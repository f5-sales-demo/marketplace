import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { canonicalSha256 } from '../../src/ce/canonical';
import { coordinateAwsPendingTeardown, prepareAwsPendingTeardown } from '../../src/ce/terraform-pending-teardown';
import { prepareAwsTerraformTeardown } from '../../src/ce/terraform-teardown-plan';
import { siteBindings } from '../../src/ce/topology';
import { foundationPlan } from './terraform-fixtures';

const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true });
});
async function fixture() {
  const initial = foundationPlan();
  initial.intent.topology = { nodeCount: 1, sites: [initial.intent.topology.sites[0]] };
  initial.intent.interfaces = initial.intent.interfaces.map((row) => ({ ...row, subnets: row.subnets.slice(0, 1) }));
  const { planId: _id, planSha256: _sha, ...draft } = initial;
  const normalized = {
    ...draft,
    deploymentName: initial.intent.deploymentName,
    accountId: initial.intent.accountId,
    region: initial.intent.region,
  };
  const sha = canonicalSha256(normalized),
    base = { ...normalized, planId: `aws-ce-${sha.slice(0, 24)}`, planSha256: sha };
  const { binding } = siteBindings(base)[0],
    owner = binding.owner;
  const root = await mkdtemp(join(tmpdir(), 'pending-retirement-'));
  dirs.push(root);
  const storage = await CeDeploymentStore.open(root, owner);
  await storage.write('terraform-authorization.json', {
    schemaVersion: 1,
    engine: 'terraform',
    planSha256: sha,
    mutations: true,
    f5StateOwner: 'terraform',
  });
  await storage.write('terraform-workflow.json', {
    schemaVersion: 1,
    engine: 'terraform',
    planSha256: sha,
    stage: 'registration-pending',
  });
  await storage.write('terraform-admission.json', {
    schemaVersion: 1,
    planSha256: sha,
    configurationSha256: 'b'.repeat(64),
    bootstrapByNode: { '1': 'private-cloud-init' },
    launchedAtByNode: {},
    admittedSites: [],
  });
  const token = {
    kind: 'tokens' as const,
    name: `${base.deploymentName.slice(0, 40)}-1-${sha.slice(0, 12)}`,
    namespace: 'system',
    uid: 'token-uid',
    node: binding.nodes[0],
    siteName: binding.siteName,
  };
  await storage.write('terraform-f5-resources.json', {
    schemaVersion: 1,
    owner,
    resources: {
      site: {
        type: 'xcsh_securemesh_site_v2',
        path: `/api/config/namespaces/system/securemesh_site_v2s/${binding.siteName}`,
        uid: 'logical-uid',
      },
    },
  });
  let sites = [{ siteName: binding.siteName, siteUid: 'logical-uid' as string | null, physicalSiteUid: null }],
    resources = [token],
    mutations: string[] = [],
    mode = 'valid';
  const observe = async () => ({
    owner,
    siteContractFingerprint: 'site',
    ingressContractFingerprint: 'ingress',
    startedAt: new Date().toISOString(),
    observedAt: new Date().toISOString(),
    sources: [],
    status: mode === 'unknown' ? 'unknown' : 'observed',
    sites,
    resources,
  });
  const runtime = { engine: 'terraform', contract: { fingerprint: 'site' }, pendingAdmissionInventory: observe };
  const driver = {
    engine: 'terraform' as const,
    siteContractFingerprint: 'site',
    ingressContractFingerprint: 'ingress',
    observe,
    revokeToken: async () => {
      mutations.push('token');
      resources = [];
    },
    reconcilePlatform: async () => {},
    retireCloud: async () => {
      mutations.push('cloud');
      return { status: 'terraform-state-retired' as const, sourcePlanSha256: sha, finalPlanSha256: 'a'.repeat(64) };
    },
    deleteSite: async () => {
      mutations.push('site');
      await storage.write('terraform-f5-resources.json', { schemaVersion: 1, owner, resources: {} });
      sites = [{ ...sites[0], siteUid: null }];
      return { status: 'deleted' as const };
    },
  };
  return {
    base,
    binding,
    storage,
    runtime,
    driver,
    contract: { fingerprint: 'ingress' },
    mutations,
    change: (next: string) => {
      mode = next;
    },
    replace: () => {
      sites = [{ ...sites[0], siteUid: 'replacement' }];
    },
    unknownToken: () => {
      resources = [{ ...token, name: 'foreign-token' }];
    },
    removed: () => {
      sites = [{ ...sites[0], siteUid: null }];
      resources = [];
    },
  };
}
test('prepares exact pending retirement and resumes removed identities without fabricating physical UIDs', async () => {
  const f = await fixture();
  const plan = await prepareAwsPendingTeardown(f.base, f.runtime as never, f.contract as never, f.storage);
  expect(plan.kind).toBe('aws-ce-terraform-pending-teardown');
  expect(plan.retirement[0].physicalSiteUid).toBeNull();
  expect(plan.retirement[0].tokens[0].uid).toBe('token-uid');
  expect(JSON.stringify(plan)).not.toContain('private-cloud-init');
  const result = await coordinateAwsPendingTeardown(f.base, plan, plan.planSha256, f.storage, f.driver as never);
  expect(result.status).toBe('resources-retired-awaiting-inventory');
  expect(f.mutations).toEqual(['token', 'cloud', 'site']);
  await coordinateAwsPendingTeardown(f.base, plan, plan.planSha256, f.storage, f.driver as never);
  expect(f.mutations).toEqual(['token', 'cloud', 'site', 'cloud']);
});
test('pending retirement rejects advanced journals, unrelated tokens and unknown evidence before mutations', async () => {
  for (const mode of ['registered', 'wrong-auth', 'unknown', 'foreign-token']) {
    const f = await fixture();
    if (mode === 'registered')
      await f.storage.write('terraform-admission.json', {
        schemaVersion: 1,
        planSha256: f.base.planSha256,
        configurationSha256: 'b'.repeat(64),
        bootstrapByNode: {},
        launchedAtByNode: {},
        admittedSites: [f.binding.siteName],
      });
    if (mode === 'wrong-auth')
      await f.storage.write('terraform-authorization.json', { schemaVersion: 1, engine: 'native' });
    if (mode === 'unknown') f.change('unknown');
    if (mode === 'foreign-token') f.unknownToken();
    await expect(
      prepareAwsPendingTeardown(f.base, f.runtime as never, f.contract as never, f.storage),
    ).rejects.toThrow();
    expect(f.mutations).toHaveLength(0);
  }
});
test('pending retirement rejects substituted identities, modified authorization and journal drift at apply', async () => {
  for (const mode of ['replacement', 'tampered', 'journal', 'wrong-engine']) {
    const f = await fixture();
    const plan = await prepareAwsPendingTeardown(f.base, f.runtime as never, f.contract as never, f.storage);
    if (mode === 'replacement') f.replace();
    if (mode === 'journal')
      await f.storage.write('terraform-workflow.json', {
        schemaVersion: 1,
        engine: 'terraform',
        planSha256: f.base.planSha256,
        stage: 'network-pending',
      });
    const driver = mode === 'wrong-engine' ? { ...f.driver, engine: 'native' } : f.driver;
    await expect(
      coordinateAwsPendingTeardown(
        f.base,
        plan,
        mode === 'tampered' ? 'x' : plan.planSha256,
        f.storage,
        driver as never,
      ),
    ).rejects.toThrow();
    expect(f.mutations).toHaveLength(0);
  }
});
test('pending retirement resumes a token revocation interruption without duplicate site deletion', async () => {
  const f = await fixture();
  const plan = await prepareAwsPendingTeardown(f.base, f.runtime as never, f.contract as never, f.storage);
  const driver = {
    ...f.driver,
    revokeToken: async () => {
      await f.driver.revokeToken();
      throw Error('interrupted');
    },
  };
  await expect(coordinateAwsPendingTeardown(f.base, plan, plan.planSha256, f.storage, driver as never)).rejects.toThrow(
    'interrupted',
  );
  expect(f.mutations).toEqual(['token']);
  await coordinateAwsPendingTeardown(f.base, plan, plan.planSha256, f.storage, f.driver as never);
  expect(f.mutations).toEqual(['token', 'cloud', 'site']);
});

test('public teardown preparation selects the separate pending admission contract', async () => {
  const f = await fixture();
  const plan = await prepareAwsTerraformTeardown(f.base, f.runtime as never, f.contract as never, f.storage);
  expect(plan.kind).toBe('aws-ce-terraform-pending-teardown');
  expect(f.mutations).toHaveLength(0);
});
test('pre-registration retirement binds physical identity and waits for generated-site deletion on resume', async () => {
  const f = await fixture();
  let physical: string | null = 'generated-physical';
  const observe = async () => ({
    ...(await f.runtime.pendingAdmissionInventory()),
    sites: (await f.runtime.pendingAdmissionInventory()).sites.map((site) => ({ ...site, physicalSiteUid: physical })),
  });
  const runtime = { ...f.runtime, preRegistrationInventory: observe };
  const plan = await prepareAwsPendingTeardown(f.base, runtime as never, f.contract as never, f.storage);
  expect(plan.retirement[0].physicalSiteUid).toBe('generated-physical');
  let deletionReads = 0;
  const driver = {
    ...f.driver,
    observe,
    observeSiteDeletion: async (site: { siteUid: string; physicalSiteUid: string }) => {
      expect(site.physicalSiteUid).toBe('generated-physical');
      deletionReads++;
      return { status: physical === null ? 'deleted' : 'pending' };
    },
  };
  const first = await coordinateAwsPendingTeardown(f.base, plan, plan.planSha256, f.storage, driver as never);
  expect(first.status).toBe('pending-platform-retirement');
  expect(f.mutations).toEqual(['token', 'cloud', 'site']);
  physical = null;
  const second = await coordinateAwsPendingTeardown(f.base, plan, plan.planSha256, f.storage, driver as never);
  expect(second.status).toBe('resources-retired-awaiting-inventory');
  expect(f.mutations).toEqual(['token', 'cloud', 'site', 'cloud']);
  expect(deletionReads).toBe(2);
});
test('pre-registration replacement or new physical identity rejects before mutations', async () => {
  const f = await fixture();
  let physical = 'original-physical';
  const observe = async () => ({
    ...(await f.runtime.pendingAdmissionInventory()),
    sites: (await f.runtime.pendingAdmissionInventory()).sites.map((site) => ({ ...site, physicalSiteUid: physical })),
  });
  const runtime = { ...f.runtime, preRegistrationInventory: observe };
  const plan = await prepareAwsPendingTeardown(f.base, runtime as never, f.contract as never, f.storage);
  physical = 'replacement-physical';
  await expect(
    coordinateAwsPendingTeardown(f.base, plan, plan.planSha256, f.storage, {
      ...f.driver,
      observe,
      observeSiteDeletion: async () => ({ status: 'pending' }),
    } as never),
  ).rejects.toThrow('substituted');
  expect(f.mutations).toEqual([]);
});
test('public teardown retains missing admission provenance while retiring a recorded logical site', async () => {
  const f = await fixture();
  await unlink(join(f.storage.directory, 'terraform-admission.json'));
  const labels = {
    'xcsh-ce-deployment': f.binding.owner.deploymentId,
    'xcsh-ce-engine': 'terraform',
    'xcsh-ce-provider': 'aws',
    'xcsh-ce-account': f.binding.owner.account,
    'xcsh-ce-region': f.binding.owner.region,
  };
  const book = (await f.storage.read('terraform-f5-resources.json')) as Record<string, unknown>;
  await f.storage.write('terraform-f5-resources.json', {
    ...book,
    resources: {},
    pending: {
      method: 'POST',
      path: '/api/config/namespaces/system/securemesh_site_v2s',
      planSha256: f.base.planSha256,
      submitted: true,
      receipt: { planSha256: 'a'.repeat(64) },
      request: { metadata: { name: f.binding.siteName, namespace: 'system', labels }, spec: {} },
    },
  });
  let reconciliations = 0;
  const runtime = {
    ...f.runtime,
    pendingAdmissionInventory: async () => ({ ...(await f.runtime.pendingAdmissionInventory()), resources: [] }),
    reconcileObservedTerraformResources: async () => {
      reconciliations++;
      await f.storage.write('terraform-f5-resources.json', book);
    },
  };
  const plan = await prepareAwsTerraformTeardown(f.base, runtime as never, f.contract as never, f.storage);
  expect(plan.kind).toBe('aws-ce-terraform-pending-teardown');
  expect(plan.retirement[0].siteUid).toBe('logical-uid');
  expect(reconciliations).toBe(1);
  await expect(f.storage.read('terraform-admission.json')).rejects.toHaveProperty('code', 'ENOENT');
  expect(f.mutations).toEqual([]);
  const driver = { ...f.driver, observe: runtime.pendingAdmissionInventory };
  await coordinateAwsPendingTeardown(f.base, plan, plan.planSha256, f.storage, driver as never);
  await coordinateAwsPendingTeardown(f.base, plan, plan.planSha256, f.storage, driver as never);
  expect(f.mutations).toEqual(['cloud', 'site', 'cloud']);
  await expect(f.storage.read('terraform-admission.json')).rejects.toHaveProperty('code', 'ENOENT');
});
test('missing admission never authorizes token retirement or foreign F5 state', async () => {
  for (const mode of ['token', 'foreign-owner']) {
    const f = await fixture();
    await unlink(join(f.storage.directory, 'terraform-admission.json'));
    if (mode === 'foreign-owner') {
      const book = (await f.storage.read('terraform-f5-resources.json')) as Record<string, unknown>;
      await f.storage.write('terraform-f5-resources.json', {
        ...book,
        owner: { ...f.binding.owner, engine: 'native' },
      });
    }
    await expect(
      prepareAwsTerraformTeardown(f.base, f.runtime as never, f.contract as never, f.storage),
    ).rejects.toThrow();
    expect(f.mutations).toEqual([]);
  }
});
test('pending teardown preserves the single non-HA mutation boundary', async () => {
  const f = await fixture();
  const initial = foundationPlan();
  const { planId: _id, planSha256: _sha, ...draft } = initial;
  const normalized = {
    ...draft,
    deploymentName: initial.intent.deploymentName,
    accountId: initial.intent.accountId,
    region: initial.intent.region,
  };
  const sha = canonicalSha256(normalized),
    base = { ...normalized, planId: `aws-ce-${sha.slice(0, 24)}`, planSha256: sha };
  await expect(prepareAwsPendingTeardown(base, f.runtime as never, f.contract as never, f.storage)).rejects.toThrow(
    'owning',
  );
  expect(f.mutations).toHaveLength(0);
});
test('physical registration appearing during cloud retirement blocks logical deletion', async () => {
  const f = await fixture();
  const plan = await prepareAwsPendingTeardown(f.base, f.runtime as never, f.contract as never, f.storage);
  const driver = {
    ...f.driver,
    retireCloud: async () => {
      const receipt = await f.driver.retireCloud();
      f.change('unknown');
      return receipt;
    },
  };
  await expect(coordinateAwsPendingTeardown(f.base, plan, plan.planSha256, f.storage, driver as never)).rejects.toThrow(
    'inventory',
  );
  expect(f.mutations).toEqual(['token', 'cloud']);
});

test('pending retirement rejects a logical replacement behind its durable site checkpoint', async () => {
  const f = await fixture();
  await f.storage.write(`terraform-site-${f.binding.siteName}.json`, {
    siteName: f.binding.siteName,
    uid: 'old-logical',
    owner: f.binding.owner,
    contractFingerprint: 'site',
  });
  await expect(prepareAwsPendingTeardown(f.base, f.runtime as never, f.contract as never, f.storage)).rejects.toThrow(
    'checkpoint',
  );
  expect(f.mutations).toHaveLength(0);
});

test('pending F5 creation or update is never replayed by teardown', async () => {
  for (const method of ['POST', 'PUT']) {
    const f = await fixture();
    const book = (await f.storage.read('terraform-f5-resources.json')) as Record<string, unknown>;
    await f.storage.write('terraform-f5-resources.json', {
      ...book,
      pending: {
        method,
        path: `/api/config/namespaces/system/securemesh_site_v2s/${f.binding.siteName}`,
        planSha256: f.base.planSha256,
      },
    });
    await expect(prepareAwsPendingTeardown(f.base, f.runtime as never, f.contract as never, f.storage)).rejects.toThrow(
      'separate interruption',
    );
    expect(f.mutations).toHaveLength(0);
  }
});
test('a selected pending F5 delete is reconciled through the provider owner on resume', async () => {
  const f = await fixture();
  const plan = await prepareAwsPendingTeardown(f.base, f.runtime as never, f.contract as never, f.storage);
  f.removed();
  const book = (await f.storage.read('terraform-f5-resources.json')) as Record<string, unknown>;
  await f.storage.write('terraform-f5-resources.json', {
    ...book,
    pending: {
      method: 'DELETE',
      path: `/api/config/namespaces/system/securemesh_site_v2s/${f.binding.siteName}`,
      planSha256: f.base.planSha256,
    },
  });
  let reconciled = 0;
  const driver = {
    ...f.driver,
    reconcilePlatform: async () => {
      reconciled++;
      await f.storage.write('terraform-f5-resources.json', { schemaVersion: 1, owner: f.binding.owner, resources: {} });
    },
  };
  const result = await coordinateAwsPendingTeardown(f.base, plan, plan.planSha256, f.storage, driver as never);
  expect(result.status).toBe('resources-retired-awaiting-inventory');
  expect(reconciled).toBe(1);
  expect(f.mutations).toEqual(['cloud']);
});

test('logical absence cannot manufacture successful F5 state retirement', async () => {
  const f = await fixture();
  const plan = await prepareAwsPendingTeardown(f.base, f.runtime as never, f.contract as never, f.storage);
  f.removed();
  await expect(
    coordinateAwsPendingTeardown(f.base, plan, plan.planSha256, f.storage, f.driver as never),
  ).rejects.toThrow('state retirement');
  expect(f.mutations).toEqual(['cloud']);
});

test('pending prepare reconciles a submitted owned site create from evidence before collecting immutable identities', async () => {
  const f = await fixture();
  const path = '/api/config/namespaces/system/securemesh_site_v2s';
  const labels = {
    'xcsh-ce-deployment': f.binding.owner.deploymentId,
    'xcsh-ce-engine': 'terraform',
    'xcsh-ce-provider': 'aws',
    'xcsh-ce-account': f.binding.owner.account,
    'xcsh-ce-region': f.binding.owner.region,
  };
  await f.storage.write('terraform-f5-resources.json', {
    schemaVersion: 1,
    owner: f.binding.owner,
    resources: {},
    pending: {
      method: 'POST',
      path,
      planSha256: f.base.planSha256,
      submitted: true,
      receipt: { planSha256: 'a'.repeat(64) },
      request: { metadata: { name: f.binding.siteName, namespace: 'system', labels }, spec: {} },
    },
  });
  let reconciliations = 0;
  const runtime = {
    ...f.runtime,
    reconcileObservedTerraformResources: async () => {
      reconciliations++;
      await f.storage.write('terraform-f5-resources.json', {
        schemaVersion: 1,
        owner: f.binding.owner,
        resources: {
          site: { type: 'xcsh_securemesh_site_v2', path: `${path}/${f.binding.siteName}`, uid: 'logical-uid' },
        },
      });
    },
  };
  const plan = await prepareAwsPendingTeardown(f.base, runtime as never, f.contract as never, f.storage);
  expect(plan.retirement[0].siteUid).toBe('logical-uid');
  expect(reconciliations).toBe(1);
  expect(f.mutations).toHaveLength(0);
});

test('submitted F5 reconciliation rejects unrelated requests before calling the provider owner', async () => {
  for (const mode of [
    'foreign-site',
    'foreign-owner',
    'foreign-labels',
    'wrong-plan',
    'unsubmitted',
    'missing-receipt',
  ]) {
    const f = await fixture();
    const owner = f.binding.owner;
    const labels = {
      'xcsh-ce-deployment': owner.deploymentId,
      'xcsh-ce-engine': 'terraform',
      'xcsh-ce-provider': 'aws',
      'xcsh-ce-account': owner.account,
      'xcsh-ce-region': owner.region,
    };
    const pending: Record<string, unknown> = {
      method: 'PUT',
      path: `/api/config/namespaces/system/securemesh_site_v2s/${f.binding.siteName}`,
      planSha256: mode === 'wrong-plan' ? 'foreign' : f.base.planSha256,
      submitted: mode !== 'unsubmitted',
      receipt: { planSha256: 'a'.repeat(64) },
      request: {
        metadata: {
          name: mode === 'foreign-site' ? 'foreign' : f.binding.siteName,
          namespace: 'system',
          labels: mode === 'foreign-labels' ? { ...labels, 'xcsh-ce-engine': 'native' } : labels,
        },
        spec: {},
      },
    };
    if (mode === 'missing-receipt') delete pending.receipt;
    await f.storage.write('terraform-f5-resources.json', {
      schemaVersion: 1,
      owner: mode === 'foreign-owner' ? { ...owner, engine: 'native' } : owner,
      resources: {},
      pending,
    });
    let calls = 0;
    const runtime = {
      ...f.runtime,
      reconcileObservedTerraformResources: async () => {
        calls++;
        throw Error('must not execute');
      },
    };
    await expect(prepareAwsPendingTeardown(f.base, runtime as never, f.contract as never, f.storage)).rejects.toThrow();
    expect(calls).toBe(0);
    expect(f.mutations).toHaveLength(0);
  }
});

test('pending retirement persists its plan binding before token mutation and retains it across interruption', async () => {
  const f = await fixture();
  const plan = await prepareAwsPendingTeardown(f.base, f.runtime as never, f.contract as never, f.storage);
  const driver = {
    ...f.driver,
    revokeToken: async () => {
      const marker = await f.storage.read('aws-terraform-lifecycle-retirement.json');
      expect(marker).toHaveProperty('sourcePlanSha256', f.base.planSha256);
      expect(marker).toHaveProperty('teardownPlanSha256', plan.planSha256);
      await f.driver.revokeToken();
      throw Error('after token interruption');
    },
  };
  await expect(coordinateAwsPendingTeardown(f.base, plan, plan.planSha256, f.storage, driver as never)).rejects.toThrow(
    'after token interruption',
  );
  await coordinateAwsPendingTeardown(f.base, plan, plan.planSha256, f.storage, f.driver as never);
  expect(await f.storage.read('aws-terraform-lifecycle-retirement.json')).toHaveProperty(
    'teardownPlanSha256',
    plan.planSha256,
  );
});

for (const method of ['POST', 'PUT'])
  test(`pending prepare cancels only the selected unsubmitted site ${method} before inventory`, async () => {
    const f = await fixture(),
      owner = f.binding.owner,
      path = '/api/config/namespaces/system/securemesh_site_v2s';
    const labels = {
      'xcsh-ce-deployment': owner.deploymentId,
      'xcsh-ce-engine': 'terraform',
      'xcsh-ce-provider': 'aws',
      'xcsh-ce-account': owner.account,
      'xcsh-ce-region': owner.region,
    };
    const book = (await f.storage.read('terraform-f5-resources.json')) as Record<string, unknown>;
    if (method === 'POST') {
      book.resources = {};
      f.removed();
    }
    book.pending = {
      method,
      path: method === 'POST' ? path : `${path}/${f.binding.siteName}`,
      planSha256: f.base.planSha256,
      submitted: false,
      request: { metadata: { name: f.binding.siteName, namespace: 'system', labels }, spec: {} },
    };
    await f.storage.write('terraform-f5-resources.json', book);
    let calls = 0;
    const runtime = {
      ...f.runtime,
      cancelUnsubmittedTerraformResources: async (selected: unknown) => {
        expect(selected).toEqual(owner);
        calls++;
        const current = (await f.storage.read('terraform-f5-resources.json')) as Record<string, unknown>;
        delete current.pending;
        await f.storage.write('terraform-f5-resources.json', current);
      },
    };
    const plan = await prepareAwsPendingTeardown(f.base, runtime as never, f.contract as never, f.storage);
    expect(plan.retirement[0].siteUid).toBe(method === 'POST' ? null : 'logical-uid');
    expect(calls).toBe(1);
    expect(f.mutations).toHaveLength(0);
  });

test('rejected pending retirement cannot persist a terminal deployment marker', async () => {
  for (const reason of ['authorization', 'unknown', 'replacement', 'journal']) {
    const f = await fixture();
    const plan = await prepareAwsPendingTeardown(f.base, f.runtime as never, f.contract as never, f.storage);
    if (reason === 'unknown') f.change('unknown');
    if (reason === 'replacement') f.replace();
    if (reason === 'journal')
      await f.storage.write('terraform-workflow.json', {
        schemaVersion: 1,
        engine: 'terraform',
        planSha256: f.base.planSha256,
        stage: 'network-pending',
      });
    await expect(
      coordinateAwsPendingTeardown(
        f.base,
        plan,
        reason === 'authorization' ? 'f'.repeat(64) : plan.planSha256,
        f.storage,
        f.driver as never,
      ),
    ).rejects.toThrow();
    expect(f.mutations).toHaveLength(0);
    await expect(f.storage.read('aws-terraform-lifecycle-retirement.json')).rejects.toMatchObject({ code: 'ENOENT' });
  }
});

async function launchedFixture() {
  const f = await fixture();
  await f.storage.write('terraform-admission.json', {
    schemaVersion: 1,
    planSha256: f.base.planSha256,
    configurationSha256: 'b'.repeat(64),
    bootstrapByNode: { '1': 'private-cloud-init' },
    launchedAtByNode: { '1': new Date().toISOString() },
    admittedSites: [f.binding.siteName],
  });
  await f.storage.write(`terraform-site-${f.binding.siteName}.json`, {
    siteName: f.binding.siteName,
    uid: 'logical-uid',
    owner: f.binding.owner,
    contractFingerprint: 'site',
  });
  Object.assign(f.runtime, { teardownInventory: async () => ({ status: 'unknown' }) });
  return f;
}

test('public teardown retires a launched single node before registration without requiring a physical site', async () => {
  const f = await launchedFixture();
  const plan = await prepareAwsTerraformTeardown(f.base, f.runtime as never, f.contract as never, f.storage);
  expect(plan.kind).toBe('aws-ce-terraform-pending-teardown');
  expect(plan.retirement[0].physicalSiteUid).toBeNull();
  expect(JSON.stringify(plan)).not.toContain('private-cloud-init');
  const result = await coordinateAwsPendingTeardown(f.base, plan, plan.planSha256, f.storage, f.driver as never);
  expect(result.status).toBe('resources-retired-awaiting-inventory');
  expect(f.mutations).toEqual(['token', 'cloud', 'site']);
});

test('launched pending retirement rejects incomplete, foreign and advanced provenance before mutations', async () => {
  for (const mode of [
    'foreign-site',
    'duplicate-site',
    'missing-bootstrap',
    'missing-launch',
    'future-launch',
    'missing-site',
    'approval-requested',
    'approval-submitted',
    'routing',
    'unknown',
    'stale',
  ]) {
    const f = await launchedFixture();
    const admission = (await f.storage.read('terraform-admission.json')) as Record<string, unknown>;
    if (mode === 'foreign-site') admission.admittedSites = ['foreign'];
    if (mode === 'duplicate-site') admission.admittedSites = [f.binding.siteName, f.binding.siteName];
    if (mode === 'missing-bootstrap') admission.bootstrapByNode = {};
    if (mode === 'missing-launch') admission.launchedAtByNode = {};
    if (mode === 'future-launch') admission.launchedAtByNode = { '1': new Date(Date.now() + 60000).toISOString() };
    await f.storage.write('terraform-admission.json', admission);
    if (mode === 'missing-site') await unlink(join(f.storage.directory, `terraform-site-${f.binding.siteName}.json`));
    if (mode.startsWith('approval-'))
      await f.storage.write(`terraform-registration-${f.binding.siteName}.json`, {
        siteName: f.binding.siteName,
        state: mode.slice('approval-'.length),
        action: 'approve-registration',
      });
    if (mode === 'routing') await f.storage.write('terraform-routing-checkpoint.json', {});
    if (mode === 'unknown') f.change('unknown');
    if (mode === 'stale')
      Object.assign(f.runtime, {
        preRegistrationInventory: async () => ({
          ...(await f.runtime.pendingAdmissionInventory()),
          observedAt: new Date(Date.now() - 60001).toISOString(),
        }),
      });
    await expect(
      prepareAwsTerraformTeardown(f.base, f.runtime as never, f.contract as never, f.storage),
    ).rejects.toThrow();
    expect(f.mutations).toHaveLength(0);
  }
});

test('launched pending retirement rechecks approval provenance and registration evidence at execution', async () => {
  for (const mode of ['approval', 'registration', 'launch-drift']) {
    const f = await launchedFixture();
    const plan = await prepareAwsTerraformTeardown(f.base, f.runtime as never, f.contract as never, f.storage);
    if (mode === 'approval')
      await f.storage.write(`terraform-registration-${f.binding.siteName}.json`, {
        siteName: f.binding.siteName,
        state: 'requested',
        action: 'approve-registration',
      });
    if (mode === 'registration') f.change('unknown');
    if (mode === 'launch-drift') {
      const admission = (await f.storage.read('terraform-admission.json')) as Record<string, unknown>;
      admission.launchedAtByNode = { '1': new Date(Date.now() - 1000).toISOString() };
      await f.storage.write('terraform-admission.json', admission);
    }
    await expect(
      coordinateAwsPendingTeardown(f.base, plan, plan.planSha256, f.storage, f.driver as never),
    ).rejects.toThrow();
    expect(f.mutations).toHaveLength(0);
    await expect(f.storage.read('aws-terraform-lifecycle-retirement.json')).rejects.toMatchObject({ code: 'ENOENT' });
  }
});
