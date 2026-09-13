import { expect, test } from 'bun:test';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { canonicalSha256 } from '../../src/ce/canonical';
import { compileAwsTerraformTeardown, coordinateAwsTerraformTeardown } from '../../src/ce/terraform-teardown';
import { siteBindings } from '../../src/ce/topology';
import { foundationPlan } from './terraform-fixtures';

function fixture(failAt = '') {
  const { planId: _id, planSha256: _sha, ...initial } = foundationPlan();
  const draft = {
    ...initial,
    deploymentName: 'ce',
    accountId: '123456789012',
    region: 'us-east-1',
    routing: { profile: 'tgw-connect' as const },
    actions: [1, 2, 3].flatMap((node) =>
      [0, 1].map((index) => ({
        id: `peer-${node}-${index}`,
        phase: 'routing' as const,
        kind: 'tgw-connect-peer-create' as const,
        description: 'peer',
        node,
        mutates: true,
        destructive: false,
      })),
    ),
  };
  const sha = canonicalSha256(draft),
    base = { ...draft, planId: `aws-ce-${sha.slice(0, 24)}`, planSha256: sha };
  const selected = siteBindings(base),
    owner = selected[0].binding.owner;
  const drain = {
    schemaVersion: 1 as const,
    owner,
    sourcePlanSha256: sha,
    siteContractFingerprint: 'site-contract',
    ingressContractFingerprint: 'ingress-contract',
    listeners: [],
    origins: [],
    sites: selected.map(({ binding }, index) => ({
      binding,
      siteUid: `uid-${index}`,
      routing: [
        { kind: 'bgp' as const, name: `${binding.siteName}-tgw-bgp`, uid: `bgp-${index}` },
        {
          kind: 'bgp_routing_policy' as const,
          name: `${binding.siteName}-tgw-export-policy`,
          uid: `policy-${index}`,
        },
        ...[1, 2].map((n) => ({
          kind: 'external_connector' as const,
          name: `ce-gre-${index * 2 + n}`,
          uid: `gre-${index * 2 + n}`,
        })),
      ],
    })),
  };
  const retirement = selected.map(({ binding }, index) => ({
    siteName: binding.siteName,
    siteUid: `uid-${index}`,
    physicalSiteUid: `physical-${index}`,
    tokens: binding.nodes.map((node) => ({ node, name: `${node}-token` })),
  }));
  const plan = compileAwsTerraformTeardown(base, drain, retirement);
  const files = new Map<string, unknown>(),
    changes: string[] = [];
  const present = new Set([
    'drain',
    'cloud',
    ...retirement.flatMap((row) => [`token:${row.siteName}`, `site:${row.siteName}`]),
  ]);
  let failure = failAt,
    pending = false;
  async function remove(key: string) {
    if (present.delete(key)) {
      changes.push(key);
      if (failure === key) {
        failure = '';
        throw new Error('lost response');
      }
    }
  }
  const storage = {
    owner,
    verify: async () => {},
    read: async (name: string) => {
      if (!files.has(name)) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return structuredClone(files.get(name));
    },
    write: async (name: string, value: unknown) => {
      files.set(name, structuredClone(value));
    },
  } as Pick<CeDeploymentStore, 'owner' | 'verify' | 'read' | 'write'>;
  const driver = {
    engine: 'terraform' as const,
    siteContractFingerprint: 'site-contract',
    ingressContractFingerprint: 'ingress-contract',
    drain: async () => {
      await remove('drain');
      return { status: 'platform-drained' as const };
    },
    retireCloud: async () => {
      await remove('cloud');
      return { status: 'terraform-state-retired' as const, sourcePlanSha256: sha, finalPlanSha256: 'd'.repeat(64) };
    },
    observeSite: async (site: (typeof retirement)[number]) => ({
      status: present.has(`site:${site.siteName}`) ? ('pending' as const) : ('deleted' as const),
    }),
    revokeToken: async (site: (typeof retirement)[number]) => {
      await remove(`token:${site.siteName}`);
    },
    deleteSite: async (site: (typeof retirement)[number]) => {
      if (!pending) await remove(`site:${site.siteName}`);
    },
  };
  return {
    base,
    plan,
    drain,
    retirement,
    storage,
    driver,
    files,
    changes,
    present,
    setPending: () => {
      pending = true;
    },
  };
}
test('Terraform teardown resumes lost stage mutations without repeating deletion or treating retirement as inventory proof', async () => {
  for (const boundary of ['drain', 'cloud', 'token:site-1', 'site:site-1', 'site:site-3']) {
    const f = fixture(boundary);
    await expect(
      coordinateAwsTerraformTeardown(f.base, f.plan, f.plan.planSha256, f.storage, f.driver),
    ).rejects.toThrow('lost response');
    const receipt = await coordinateAwsTerraformTeardown(f.base, f.plan, f.plan.planSha256, f.storage, f.driver);
    expect(receipt.status).toBe('resources-retired-awaiting-inventory');
    expect(receipt.cloudInventory).toBe('unknown');
    await coordinateAwsTerraformTeardown(f.base, f.plan, f.plan.planSha256, f.storage, f.driver);
    expect(f.changes).toEqual([
      'drain',
      'cloud',
      'token:site-1',
      'site:site-1',
      'token:site-2',
      'site:site-2',
      'token:site-3',
      'site:site-3',
    ]);
  }
});
test('Terraform teardown rejects incomplete topology, missing routing, wrong engine, source drift and missing authorization', async () => {
  const f = fixture();
  expect(() =>
    compileAwsTerraformTeardown(f.base, { ...f.drain, sites: f.drain.sites.slice(1) }, f.retirement),
  ).toThrow();
  const missing = structuredClone(f.drain);
  missing.sites[0].routing.pop();
  expect(() => compileAwsTerraformTeardown(f.base, missing, f.retirement)).toThrow();
  const mixed = structuredClone(f.drain);
  mixed.sites[0].routing = mixed.sites[0].routing.filter((row) => row.kind !== 'bgp_routing_policy');
  expect(() => compileAwsTerraformTeardown(f.base, mixed, f.retirement)).toThrow('export-policy inventory');
  const legacy = structuredClone(f.drain);
  for (const site of legacy.sites) site.routing = site.routing.filter((row) => row.kind !== 'bgp_routing_policy');
  expect(compileAwsTerraformTeardown(f.base, legacy, f.retirement).drain.sites).toHaveLength(3);
  await expect(coordinateAwsTerraformTeardown(f.base, f.plan, 'e'.repeat(64), f.storage, f.driver)).rejects.toThrow();
  await f.storage.write('aws-terraform-teardown-source.json', null);
  await expect(
    coordinateAwsTerraformTeardown(f.base, f.plan, f.plan.planSha256, f.storage, f.driver),
  ).rejects.toThrow();
  expect(f.changes).toEqual([]);
});
test('Terraform teardown preserves pending site convergence and refuses unknown site evidence', async () => {
  const f = fixture();
  f.setPending();
  expect((await coordinateAwsTerraformTeardown(f.base, f.plan, f.plan.planSha256, f.storage, f.driver)).status).toBe(
    'pending-site-retirement',
  );
  expect(f.changes).toEqual(['drain', 'cloud', 'token:site-1']);
  const g = fixture();
  g.driver.observeSite = async () => ({ status: 'unknown' as never });
  await expect(
    coordinateAwsTerraformTeardown(g.base, g.plan, g.plan.planSha256, g.storage, g.driver),
  ).rejects.toThrow();
  expect(g.changes).toEqual(['drain', 'cloud']);
});

test('Terraform teardown re-observes stages after each parent checkpoint failure and preserves cancellation', async () => {
  for (let boundary = 1; boundary <= 8; boundary++) {
    const f = fixture(),
      write = f.storage.write.bind(f.storage);
    let writes = 0;
    f.storage.write = async (name, value) => {
      if (name === 'aws-terraform-teardown-progress.json' && ++writes === boundary)
        throw new Error('checkpoint failed');
      await write(name, value);
    };
    await expect(
      coordinateAwsTerraformTeardown(f.base, f.plan, f.plan.planSha256, f.storage, f.driver),
    ).rejects.toThrow('checkpoint failed');
    expect((await coordinateAwsTerraformTeardown(f.base, f.plan, f.plan.planSha256, f.storage, f.driver)).status).toBe(
      'resources-retired-awaiting-inventory',
    );
    expect(f.changes.length).toBe(8);
  }
  const f = fixture(),
    controller = new AbortController(),
    cloud = f.driver.retireCloud;
  f.driver.retireCloud = async () => {
    const result = await cloud();
    controller.abort();
    return result;
  };
  await expect(
    coordinateAwsTerraformTeardown(f.base, f.plan, f.plan.planSha256, f.storage, f.driver, controller.signal),
  ).rejects.toThrow();
  expect(
    ((await f.storage.read('aws-terraform-teardown-progress.json')) as { completed: string[] }).completed,
  ).toContain('terraform-state-retired');
  expect(f.changes).toEqual(['drain', 'cloud']);
});

test('Terraform teardown refuses foreign execution and duplicate physical identities before mutation', async () => {
  const f = fixture();
  f.driver.engine = 'native' as never;
  await expect(coordinateAwsTerraformTeardown(f.base, f.plan, f.plan.planSha256, f.storage, f.driver)).rejects.toThrow(
    'ownership',
  );
  expect(f.changes).toEqual([]);
  const retirement = structuredClone(f.retirement);
  retirement[1].physicalSiteUid = retirement[0].physicalSiteUid;
  expect(() => compileAwsTerraformTeardown(f.base, f.drain, retirement)).toThrow('Duplicate');
});

test('Terraform teardown uses a final no-change receipt collected after all site mutations', async () => {
  const f = fixture(),
    cloud = f.driver.retireCloud;
  let reads = 0;
  f.driver.retireCloud = async () => {
    const result = await cloud();
    reads++;
    if (reads === 2) expect(f.present.size).toBe(0);
    return { ...result, finalPlanSha256: String(reads).repeat(64) };
  };
  const result = await coordinateAwsTerraformTeardown(f.base, f.plan, f.plan.planSha256, f.storage, f.driver);
  expect(result.status).toBe('resources-retired-awaiting-inventory');
  expect('finalPlanSha256' in result && result.finalPlanSha256).toBe('2'.repeat(64));
});
