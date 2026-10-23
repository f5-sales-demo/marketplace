import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { link, mkdir, mkdtemp, readdir, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { storeBootstrapToken } from '../../../platform/src/ce/token-store';
import { independentRetirementFixture } from '../../../terraform/test/fixtures/independent-retirement';
import {
  dispatchAwsTerraformBgpPower,
  reconcileAwsTerraformBgpPower,
  retireAwsTerraformBgpPowerPolicy,
} from '../../src/ce/bgp-power-controller';
import { canonicalSha256 } from '../../src/ce/canonical';
import { AWS_CE_PROVIDER_LOCK_SHA256 } from '../../src/ce/execution-contract';
import { reviseAwsTerraformDirectServiceRoutes } from '../../src/ce/terraform-direct-power';
import { beginAwsTerraformRetirement } from '../../src/ce/terraform-lifecycle';
import { retireAwsTerraformParentArtifacts } from '../../src/ce/terraform-parent-retirement';
import { reviseAwsTerraformStaticServiceRoutes } from '../../src/ce/terraform-static-power';
import { reviseAwsTerraformPowerConfiguration } from '../../src/ce/terraform-whole-site-power';
import { siteBindings } from '../../src/ce/topology';
import {
  type AwsWholeSitePowerDriver,
  buildAwsWholeSitePowerPlan,
  runAwsWholeSitePower,
} from '../../src/ce/whole-site-power';
import { collectAwsPowerNlbServices, reviseAwsTerraformNlbMembership } from '../../src/ce/whole-site-power-services';
import { bgpControllerFixture } from './bgp-power-controller.test';
import { replacementVersions } from './replacement-version-fixtures';
import { terraformRevisionFixture } from './terraform-direct-power.test';
import { foundationPlan } from './terraform-fixtures';
import { nlbPowerFixture } from './whole-site-power-nlb-fixtures';
import { staticRevisionFixture } from './whole-site-power-tgw.test';

const roots: string[] = [];
afterEach(async () => {
  for (const r of roots.splice(0)) await rm(r, { recursive: true, force: true });
});
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
async function fixture(single = false, supplied?: ReturnType<typeof foundationPlan>) {
  const initial = supplied ?? foundationPlan();
  if (single && !supplied)
    initial.intent.topology = { nodeCount: 1, sites: [{ name: initial.intent.siteName, nodeIndexes: [1] }] };
  const { planId: _id, planSha256: _sha, ...draft } = initial;
  const material = supplied
    ? draft
    : {
        ...draft,
        interfaces: initial.intent.interfaces,
        topology: initial.intent.topology,
        routing: initial.intent.routing,
        deploymentName: initial.intent.deploymentName,
        accountId: initial.intent.accountId,
        region: initial.intent.region,
      };
  const sha = canonicalSha256(material);
  const base = { ...material, planSha256: sha, planId: `aws-ce-${sha.slice(0, 24)}` };
  const teardown = {
    kind: 'aws-ce-terraform-foundation-teardown',
    sourcePlanSha256: sha,
    planSha256: 'a'.repeat(64),
    planId: 'aws-ce-foundation-teardown-example',
  };
  const root = await mkdtemp(join(tmpdir(), 'parent-retirement-'));
  roots.push(root);
  const store = await CeDeploymentStore.open(root, siteBindings(base)[0].binding.owner);
  await beginAwsTerraformRetirement(base, teardown, store);
  await store.write(`${teardown.planId}.json`, teardown);
  await store.write(`${teardown.planId}-authorization.json`, {
    schemaVersion: 1,
    engine: 'terraform',
    sourcePlanSha256: sha,
    teardownPlanSha256: teardown.planSha256,
    mutations: true,
  });
  await store.write('terraform-admission.json', { bootstrapByNode: { 1: 'PRIVATE_SYNTHETIC_INPUT' } });
  await store.write('terraform-cloud-teardown-source.json', { configuration: 'PRIVATE_SYNTHETIC_CONFIGURATION' });
  await store.write('terraform-brownfield-placement.json', { schemaVersion: 1, syntheticPlacement: true });
  const makeRunner = async (directory: string) => {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const manifest = {
      schemaVersion: 1,
      deploymentId: base.deploymentName,
      engine: 'terraform',
      ...(directory.includes('/terraform-stages/') ? { stage: 'f5-resources' } : {}),
      backendIdentity: `local:${base.deploymentName}${directory.includes('/terraform-stages/') ? ':stage:f5-resources' : ''}`,
      scope: { cloud: 'aws', account: base.accountId, region: base.region },
    };
    const independent = independentRetirementFixture({
      manifestSha256: canonicalSha256(manifest),
      evidenceSha256: 'b'.repeat(64),
      finalPlanSha256: 'c'.repeat(64),
      planReceiptSha256: 'd'.repeat(64),
    });
    const encoded = JSON.stringify(manifest);
    await writeFile(join(directory, 'deployment.json'), encoded, { mode: 0o600 });
    await writeFile(
      join(directory, 'artifact-retirement.json'),
      JSON.stringify({
        schemaVersion: 1,
        status: 'runner-artifacts-retired',
        manifestSha256: canonicalSha256(manifest),
        evidenceSha256: 'b'.repeat(64),
        finalPlanSha256: 'c'.repeat(64),
        planReceiptSha256: 'd'.repeat(64),
        inventorySha256: hash('[]'),
        artifacts: [],
        ...independent,
      }),
      { mode: 0o600 },
    );
  };
  await makeRunner(join(store.directory, base.deploymentName));
  return { base, teardown, store, root, makeRunner };
}
test('parent cleanup rejects a foreign stage or backend even with a matching manifest digest', async () => {
  for (const mode of ['stage', 'backend']) {
    const f = await fixture();
    const prefix = `terraform-stages/f5-resources/${f.base.deploymentName}`;
    await f.makeRunner(join(f.store.directory, prefix));
    const manifest = JSON.parse(await readFile(join(f.store.directory, prefix, 'deployment.json'), 'utf8'));
    const changed = {
      ...manifest,
      ...(mode === 'stage' ? { stage: 'foreign' } : { backendIdentity: 'local:foreign' }),
    };
    await writeFile(join(f.store.directory, prefix, 'deployment.json'), JSON.stringify(changed), { mode: 0o600 });
    const marker = JSON.parse(await readFile(join(f.store.directory, prefix, 'artifact-retirement.json'), 'utf8'));
    await writeFile(
      join(f.store.directory, prefix, 'artifact-retirement.json'),
      JSON.stringify({
        ...marker,
        manifestSha256: canonicalSha256(changed),
      }),
      { mode: 0o600 },
    );
    await expect(retireAwsTerraformParentArtifacts(f.base, f.teardown, 'b'.repeat(64), f.store)).rejects.toThrow();
    expect(await readdir(f.store.directory)).toContain('terraform-admission.json');
  }
});
test('parent retirement removes recorded sensitive journals and preserves exact terminal public bindings', async () => {
  const f = await fixture();
  for (const name of [
    'platform-drain-source.json',
    'platform-drain-progress.json',
    'platform-drain-receipt.json',
    'ingress-checkpoint-example.json',
    'ingress-origin-checkpoint-example.json',
  ])
    await f.store.write(name, { privateSyntheticLifecycle: true });
  await f.makeRunner(join(f.store.directory, 'terraform-stages/f5-resources', f.base.deploymentName));
  const result = await retireAwsTerraformParentArtifacts(f.base, f.teardown, 'b'.repeat(64), f.store);
  expect(result.status).toBe('deployment-artifacts-retired');
  const files = await readdir(f.store.directory);
  expect(files).not.toContain('terraform-admission.json');
  expect(files).not.toContain('terraform-cloud-teardown-source.json');
  expect(files).not.toContain('platform-drain-source.json');
  expect(files).not.toContain('ingress-origin-checkpoint-example.json');
  expect(files).toContain('terraform-brownfield-placement.json');
  expect(files).toContain(`${f.teardown.planId}.json`);
  expect(await retireAwsTerraformParentArtifacts(f.base, f.teardown, 'b'.repeat(64), f.store)).toEqual(result);
  await expect(retireAwsTerraformParentArtifacts(f.base, f.teardown, 'f'.repeat(64), f.store)).rejects.toThrow();
});
test('parent retirement refuses unresolved stages, runner artifacts, hardlinks, foreign bindings and unexpected files', async () => {
  for (const mode of ['stage', 'runner', 'hardlink', 'unknown', 'authorization', 'owner', 'digest']) {
    const f = await fixture();
    if (mode === 'stage')
      await mkdir(join(f.store.directory, 'terraform-stages/upgrade-software-example'), {
        recursive: true,
        mode: 0o700,
      });
    if (mode === 'runner')
      await writeFile(join(f.store.directory, f.base.deploymentName, 'main.tf.json'), 'PRIVATE', { mode: 0o600 });
    if (mode === 'hardlink') await link(join(f.store.directory, 'terraform-admission.json'), join(f.root, 'external'));
    if (mode === 'unknown') await writeFile(join(f.store.directory, 'unqualified.bin'), 'PRIVATE', { mode: 0o600 });
    if (mode === 'authorization') await f.store.write(`${f.teardown.planId}-authorization.json`, {});
    const base = mode === 'owner' ? { ...f.base, accountId: 'example-foreign-account' } : f.base;
    await expect(
      retireAwsTerraformParentArtifacts(base, f.teardown, mode === 'digest' ? 'unresolved' : 'b'.repeat(64), f.store),
    ).rejects.toThrow();
    expect(await readdir(f.store.directory)).toContain('terraform-admission.json');
    expect(await readdir(f.store.directory)).not.toContain('aws-terraform-parent-artifact-retirement.json');
  }
});
test('parent retirement rejects directory symlink substitution without deleting external data', async () => {
  const f = await fixture();
  const original = join(f.store.directory, f.base.deploymentName);
  const external = join(f.root, 'external-runner');
  await rename(original, external);
  await symlink(external, original);
  await expect(retireAwsTerraformParentArtifacts(f.base, f.teardown, 'b'.repeat(64), f.store)).rejects.toThrow();
  expect((await readdir(external)).sort()).toEqual(['artifact-retirement.json', 'deployment.json']);
  expect(await readdir(f.store.directory)).toContain('terraform-admission.json');
});
test('parent interrupted cleanup rejects changed preserved bindings and newly created journals', async () => {
  const f = await fixture();
  await retireAwsTerraformParentArtifacts(f.base, f.teardown, 'b'.repeat(64), f.store);
  const marker = (await f.store.read('aws-terraform-parent-artifact-retirement.json')) as Record<string, unknown>;
  await f.store.write('aws-terraform-parent-artifact-retirement.json', { ...marker, status: 'retiring' });
  await f.store.write('terraform-admission.json', { bootstrapByNode: { 1: 'SUBSTITUTED' } });
  await expect(retireAwsTerraformParentArtifacts(f.base, f.teardown, 'b'.repeat(64), f.store)).rejects.toThrow();
  await f.store.remove('terraform-admission.json');
  await f.store.write('terraform-new-journal.json', {});
  await expect(retireAwsTerraformParentArtifacts(f.base, f.teardown, 'b'.repeat(64), f.store)).rejects.toThrow();
  await f.store.remove('terraform-new-journal.json');
  await f.store.write('terraform-brownfield-placement.json', { changed: true });
  await expect(retireAwsTerraformParentArtifacts(f.base, f.teardown, 'b'.repeat(64), f.store)).rejects.toThrow();
});

test('parent retirement marker cannot authorize preservation of a recorded sensitive journal', async () => {
  const f = await fixture();
  await retireAwsTerraformParentArtifacts(f.base, f.teardown, 'b'.repeat(64), f.store);
  const marker = (await f.store.read('aws-terraform-parent-artifact-retirement.json')) as Record<string, unknown>;
  const artifacts = (marker.artifacts as Array<Record<string, unknown>>).map((row) =>
    row.path === 'terraform-admission.json' ? { ...row, preserve: true } : row,
  );
  await f.store.write('aws-terraform-parent-artifact-retirement.json', {
    ...marker,
    status: 'retiring',
    artifacts,
    inventorySha256: canonicalSha256(artifacts),
  });
  await f.store.write('terraform-admission.json', { bootstrapByNode: { 1: 'PRIVATE_SYNTHETIC_INPUT' } });
  await expect(retireAwsTerraformParentArtifacts(f.base, f.teardown, 'b'.repeat(64), f.store)).rejects.toThrow();
});

test('parent retirement removes exact site/node-bound bootstrap staging and retired site bindings', async () => {
  const f = await fixture();
  const binding = siteBindings(f.base)[0].binding;
  await f.store.write('ce-1-example-token.json', {
    tokenName: 'ce-1-example-token',
    siteName: binding.siteName,
    node: binding.nodes[0],
    jwt: 'PRIVATE_SYNTHETIC_JWT',
  });
  await f.store.write(`site-binding-${binding.siteName}.json`, {
    schemaVersion: 1,
    binding,
    siteUid: 'synthetic-retired-site',
    expectedInterfaces: [],
    tenantOrigin: 'https://synthetic.example',
    contractFingerprint: 'synthetic',
  });
  const result = await retireAwsTerraformParentArtifacts(f.base, f.teardown, 'b'.repeat(64), f.store);
  expect(result.status).toBe('deployment-artifacts-retired');
  expect(await readdir(f.store.directory)).not.toContain('ce-1-example-token.json');
  expect(await readdir(f.store.directory)).not.toContain(`site-binding-${binding.siteName}.json`);
});

test('parent retirement resumes after cancellation between recorded removals', async () => {
  const f = await fixture();
  const controller = new AbortController();
  const verify = f.store.verify.bind(f.store);
  let removals = 0;
  f.store.verify = async () => {
    await verify();
    const files = await readdir(f.store.directory);
    if (files.includes('aws-terraform-parent-artifact-retirement.json') && ++removals === 2) controller.abort();
  };
  await expect(
    retireAwsTerraformParentArtifacts(f.base, f.teardown, 'b'.repeat(64), f.store, controller.signal),
  ).rejects.toThrow();
  f.store.verify = verify;
  expect(
    ((await f.store.read('aws-terraform-parent-artifact-retirement.json')) as Record<string, unknown>).status,
  ).toBe('retiring');
  expect((await retireAwsTerraformParentArtifacts(f.base, f.teardown, 'b'.repeat(64), f.store)).status).toBe(
    'deployment-artifacts-retired',
  );
});

async function completedReplacement(f: Awaited<ReturnType<typeof fixture>>) {
  const binding = siteBindings(f.base)[0].binding;
  const node = binding.nodes[0];
  const versions = replacementVersions(binding);
  const draft = {
    schemaVersion: 2,
    kind: 'aws-ce-site-replacement',
    engine: 'terraform',
    sourcePlanSha256: f.base.planSha256,
    binding,
    preparation: { uid: 'old-site', instances: { [node]: 'i-12345678' } },
    versions,
  };
  const digest = canonicalSha256(draft);
  const plan = { ...draft, planId: `aws-ce-replace-${digest.slice(0, 24)}`, planSha256: digest };
  await f.store.write(`terraform-initial-replacement-${binding.siteName}.json`, {
    sourcePlanSha256: f.base.planSha256,
    configurationSha256: 'e'.repeat(64),
    plan,
  });
  await f.store.write(`${plan.planId}.json`, {
    schemaVersion: 2,
    planSha256: digest,
    phase: 'complete',
    siteUid: 'new-site',
    physicalSiteUid: 'new-physical-site',
    quiesceConfigurationSha256: 'f'.repeat(64),
    versionAdmissionSha256: canonicalSha256(versions),
    instances: { [node]: 'i-87654321' },
    bootstrap: { [node]: 'PRIVATE_SYNTHETIC_BOOTSTRAP' },
    bootstrapSha256: { [node]: canonicalSha256('PRIVATE_SYNTHETIC_BOOTSTRAP') },
  });
  await f.store.write(`${plan.planId}-terraform-final-refresh.json`, { syntheticFinalRefresh: true });
  return plan;
}

test('parent retirement removes completed frozen initial replacement journals and sensitive bootstrap', async () => {
  const f = await fixture();
  const plan = await completedReplacement(f);
  const result = await retireAwsTerraformParentArtifacts(f.base, f.teardown, 'b'.repeat(64), f.store);
  expect(result.status).toBe('deployment-artifacts-retired');
  expect(await readdir(f.store.directory)).not.toContain(`${plan.planId}.json`);
  expect(await readdir(f.store.directory)).not.toContain(`${plan.planId}-terraform-final-refresh.json`);
  expect(await retireAwsTerraformParentArtifacts(f.base, f.teardown, 'b'.repeat(64), f.store)).toEqual(result);
});

test('parent retirement rejects unbound, incomplete, corrupt or unexpected replacement journals before removal', async () => {
  for (const mode of ['source', 'owner', 'digest', 'phase', 'bootstrap', 'instance', 'unknown', 'orphan']) {
    const f = await fixture();
    const plan = await completedReplacement(f);
    const frozenName = `terraform-initial-replacement-${plan.binding.siteName}.json`;
    const frozen = (await f.store.read(frozenName)) as { sourcePlanSha256: string; plan: typeof plan };
    const checkpoint = (await f.store.read(`${plan.planId}.json`)) as {
      phase: string;
      bootstrap: Record<string, string>;
      instances: Record<string, string>;
    };
    if (mode === 'source') frozen.sourcePlanSha256 = '0'.repeat(64);
    if (mode === 'owner') frozen.plan.binding.owner.account = 'example-foreign-account';
    if (mode === 'digest') frozen.plan.planSha256 = '0'.repeat(64);
    if (mode === 'phase') checkpoint.phase = 'registration';
    if (mode === 'bootstrap') checkpoint.bootstrap[plan.binding.nodes[0]] = 'SUBSTITUTED';
    if (mode === 'instance') checkpoint.instances = {};
    if (mode === 'unknown') await f.store.write(`${plan.planId}-unexpected.json`, {});
    await f.store.write(frozenName, frozen);
    await f.store.write(`${plan.planId}.json`, checkpoint);
    if (mode === 'orphan') await f.store.remove(frozenName);
    await expect(retireAwsTerraformParentArtifacts(f.base, f.teardown, 'b'.repeat(64), f.store)).rejects.toThrow();
    expect(await readdir(f.store.directory)).toContain('terraform-admission.json');
    expect(await readdir(f.store.directory)).not.toContain('aws-terraform-parent-artifact-retirement.json');
  }
});

test('completed replacement cleanup resumes after its checkpoint was removed', async () => {
  const f = await fixture();
  const plan = await completedReplacement(f);
  const controller = new AbortController();
  const verify = f.store.verify.bind(f.store);
  f.store.verify = async () => {
    await verify();
    const files = await readdir(f.store.directory);
    if (files.includes('aws-terraform-parent-artifact-retirement.json') && !files.includes(`${plan.planId}.json`))
      controller.abort();
  };
  await expect(
    retireAwsTerraformParentArtifacts(f.base, f.teardown, 'b'.repeat(64), f.store, controller.signal),
  ).rejects.toThrow();
  f.store.verify = verify;
  expect((await retireAwsTerraformParentArtifacts(f.base, f.teardown, 'b'.repeat(64), f.store)).status).toBe(
    'deployment-artifacts-retired',
  );
});

test('AWS parent retirement retires the exact platform-issued checkout', async () => {
  const f = await fixture(),
    binding = siteBindings(f.base)[0].binding;
  await f.store.write('checkout-token.json', {
    tokenName: 'checkout-token',
    siteName: binding.siteName,
    node: binding.nodes[0],
    jwt: 'SYNTHETIC_CHECKOUT',
  });
  const stored = await storeBootstrapToken({
    sessionId: 'fixture-session',
    token: 'SYNTHETIC_CHECKOUT',
    expiresInSeconds: 60,
    root: join(f.root, 'checkout'),
    onPrepared: async (checkout) => {
      await f.store.write(`bootstrap-checkout-${checkout.reference.split('/').at(-1)}.json`, {
        schemaVersion: 1,
        owner: binding.owner,
        binding,
        siteUid: 'site-uid',
        contractFingerprint: 'fingerprint',
        tokenName: 'checkout-token',
        node: binding.nodes[0],
        checkout,
      });
    },
  });
  await retireAwsTerraformParentArtifacts(f.base, f.teardown, 'b'.repeat(64), f.store);
  await expect(
    readFile(join(f.root, 'checkout', 'fixture-session', stored.reference.split('/').at(-1) ?? '', 'token')),
  ).rejects.toMatchObject({ code: 'ENOENT' });
  expect(await retireAwsTerraformParentArtifacts(f.base, f.teardown, 'b'.repeat(64), f.store)).toMatchObject({
    status: 'deployment-artifacts-retired',
  });
});

async function preparedPower(f: Awaited<ReturnType<typeof fixture>>) {
  const bindings = {
    sourcePlanSha256: f.base.planSha256,
    owner: f.store.owner,
    servicesSha256: 'e'.repeat(64),
    nodes: siteBindings(f.base).flatMap(({ site, binding }) =>
      site.nodeIndexes.map((nodeIndex, offset) => ({
        nodeIndex,
        nodeName: binding.nodes[offset],
        siteName: site.name,
        instanceId: `i-${String(nodeIndex).padStart(16, '0')}`,
        interfaces: f.base.interfaces.map((item) => ({
          index: item.index,
          role: item.role,
          id: `eni-${String(nodeIndex * 10 + item.index).padStart(16, '0')}`,
          mac: `02:00:00:00:00:${String(nodeIndex * 10 + item.index).padStart(2, '0')}`,
          device: item.guestDevice ?? `ens${5 + item.index}`,
        })),
      })),
    ),
  };
  const plan = buildAwsWholeSitePowerPlan(f.base, 'stop', bindings, '11111111-1111-4111-8111-111111111111');
  await f.store.write(`${plan.planId}.json`, plan);
  await f.store.write(`${plan.planId}-checkpoint.json`, {
    schemaVersion: 1,
    planSha256: plan.planSha256,
    bindingsSha256: plan.bindingsSha256,
    step: 0,
    attempts: {},
    evidence: {},
    complete: false,
  });
  return plan;
}

test('terminal parent retirement admits exact prepared unsubmitted owning power artifacts', async () => {
  const f = await fixture();
  const plan = await preparedPower(f);
  expect((await retireAwsTerraformParentArtifacts(f.base, f.teardown, 'b'.repeat(64), f.store)).status).toBe(
    'deployment-artifacts-retired',
  );
  expect(await readdir(f.store.directory)).not.toContain(`${plan.planId}.json`);
  expect(await readdir(f.store.directory)).not.toContain(`${plan.planId}-checkpoint.json`);
});

test('terminal parent retirement rejects foreign, orphan, malformed and unexpected power artifacts before deletion', async () => {
  for (const mode of ['owner', 'digest', 'checkpoint', 'orphan', 'unexpected']) {
    const f = await fixture();
    const plan = await preparedPower(f);
    if (mode === 'owner') {
      plan.bindings.owner.account = 'example-foreign-account';
      await f.store.write(`${plan.planId}.json`, plan);
    }
    if (mode === 'digest') {
      plan.planSha256 = '0'.repeat(64);
      await f.store.write(`${plan.planId}.json`, plan);
    }
    if (mode === 'checkpoint') await f.store.write(`${plan.planId}-checkpoint.json`, {});
    if (mode === 'orphan') await f.store.remove(`${plan.planId}.json`);
    if (mode === 'unexpected') await f.store.write(`${plan.planId}-future.json`, {});
    await expect(retireAwsTerraformParentArtifacts(f.base, f.teardown, 'b'.repeat(64), f.store)).rejects.toThrow();
    expect(await readdir(f.store.directory)).toContain('terraform-admission.json');
    expect(await readdir(f.store.directory)).not.toContain('aws-terraform-parent-artifact-retirement.json');
  }
});

async function executedPower(f: Awaited<ReturnType<typeof fixture>>, mode: 'stopped' | 'restored' | 'interrupted') {
  const stop = await preparedPower(f);
  let cloud: 'running' | 'stopped' = 'running';
  let services: 'active' | 'withdrawn' = 'active';
  const calls: string[] = [];
  const driver: AwsWholeSitePowerDriver = {
    engine: 'terraform',
    readBindings: async () => stop.bindings,
    observe: async (plan, gate) => ({
      source: 'live',
      planSha256: plan.planSha256,
      bindingsSha256: plan.bindingsSha256,
      gate,
      collectedAt: new Date().toISOString(),
      identity: 'verified',
      cloud,
      services,
      traffic: services === 'active' ? 'passing' : 'blocked',
      registration: 'healthy',
      configuration: 'verified',
      versions: 'stable',
      interfaces: 'up',
      canSatisfyInterfaceMutationGate: true,
    }),
    execute: async (_plan, effect) => {
      calls.push(effect);
      if (effect === 'withdraw') services = 'withdrawn';
      if (effect === 'stop') cloud = 'stopped';
      if (effect === 'start') cloud = 'running';
      if (effect === 'restore') services = 'active';
      if (mode === 'interrupted' && effect === 'stop') throw Error('synthetic lost response');
    },
    reconcile: async () => 'completed',
    finish: async () => ({ engine: 'terraform', noChanges: true }),
  };
  let start: ReturnType<typeof buildAwsWholeSitePowerPlan> | undefined;
  if (mode === 'interrupted')
    await expect(runAwsWholeSitePower(f.base, stop, stop.planSha256, f.store, driver)).rejects.toThrow('lost response');
  else {
    const stopped = await runAwsWholeSitePower(f.base, stop, stop.planSha256, f.store, driver);
    expect(stopped.status).toBe('site-stopped');
    if (mode === 'restored' && 'maintenance' in stopped) {
      start = buildAwsWholeSitePowerPlan(f.base, 'start', stop.bindings, stop.transitionId, stopped.maintenance);
      expect((await runAwsWholeSitePower(f.base, start, start.planSha256, f.store, driver)).status).toBe(
        'site-started',
      );
    }
  }
  return { stop, start, calls };
}

for (const mode of ['stopped', 'restored', 'interrupted'] as const) {
  test(`terminal cleanup retires ${mode} coordinator journals without replay`, async () => {
    const f = await fixture(true);
    const power = await executedPower(f, mode);
    const calls = [...power.calls];
    expect((await retireAwsTerraformParentArtifacts(f.base, f.teardown, 'b'.repeat(64), f.store)).status).toBe(
      'deployment-artifacts-retired',
    );
    expect((await readdir(f.store.directory)).filter((n) => n.startsWith('aws-ce-power-'))).toEqual([]);
    expect(power.calls).toEqual(calls);
  });
}

test('power cleanup resumes after source removal and rejects substituted surviving bytes', async () => {
  const f = await fixture(true);
  const { stop } = await executedPower(f, 'stopped');
  const controller = new AbortController();
  const verify = f.store.verify.bind(f.store);
  f.store.verify = async () => {
    await verify();
    const names = await readdir(f.store.directory);
    if (names.includes('aws-terraform-parent-artifact-retirement.json')) controller.abort();
  };
  await expect(
    retireAwsTerraformParentArtifacts(f.base, f.teardown, 'b'.repeat(64), f.store, controller.signal),
  ).rejects.toThrow();
  f.store.verify = verify;
  await f.store.remove(`${stop.planId}.json`);
  const path = `${stop.planId}-maintenance.json`;
  const bytes = await readFile(join(f.store.directory, path), 'utf8');
  await writeFile(join(f.store.directory, path), JSON.stringify({ substituted: true }), { mode: 0o600 });
  await expect(retireAwsTerraformParentArtifacts(f.base, f.teardown, 'b'.repeat(64), f.store)).rejects.toThrow();
  await writeFile(join(f.store.directory, path), bytes, { mode: 0o600 });
  expect((await retireAwsTerraformParentArtifacts(f.base, f.teardown, 'b'.repeat(64), f.store)).status).toBe(
    'deployment-artifacts-retired',
  );
});

test('power terminal cleanup rejects forged attempt and maintenance chains', async () => {
  for (const mode of ['attempt', 'maintenance', 'evidence', 'pending', 'engine']) {
    const f = await fixture(true);
    const { stop } = await executedPower(f, 'stopped');
    const cp = (await f.store.read(`${stop.planId}-checkpoint.json`)) as any;
    if (mode === 'attempt') cp.attempts.stop.requestSha256 = '0'.repeat(64);
    if (mode === 'evidence') cp.evidence.stopped.bindingsSha256 = '0'.repeat(64);
    if (mode === 'pending') cp.pending = cp.attempts.stop;
    if (mode === 'engine') {
      stop.engine = 'native';
      await f.store.write(`${stop.planId}.json`, stop);
    }
    if (mode === 'maintenance') {
      const m = (await f.store.read(`${stop.planId}-maintenance.json`)) as any;
      m.stoppedEvidenceSha256 = '0'.repeat(64);
      const { receiptSha256, ...body } = m;
      m.receiptSha256 = canonicalSha256(body);
      await f.store.write(`${stop.planId}-maintenance.json`, m);
    }
    await f.store.write(`${stop.planId}-checkpoint.json`, cp);
    await expect(retireAwsTerraformParentArtifacts(f.base, f.teardown, 'b'.repeat(64), f.store)).rejects.toThrow();
    expect(await readdir(f.store.directory)).toContain('terraform-admission.json');
  }
});

function stateConfiguration(f: Awaited<ReturnType<typeof fixture>>, node: { siteName: string }) {
  const configuration = JSON.stringify({
    terraform: {
      required_version: '= 1.16.5',
      required_providers: { aws: { source: 'hashicorp/aws', version: '= 6.63.0' } },
    },
    provider: { aws: { region: f.base.region, allowed_account_ids: [f.base.accountId] } },
    resource: {
      aws_instance: {
        node_1: {
          user_data_base64: 'PRIVATE_SYNTHETIC_CONFIGURATION',
          tags: {
            'xcsh-deployment-id': f.base.deploymentName,
            'xcsh-execution-engine': 'terraform',
            'xcsh-plan-sha256': f.base.planSha256,
            'xcsh-node-index': '1',
            'ves-io-site-name': node.siteName,
          },
        },
      },
    },
  });
  return configuration;
}

async function statePowerPreparation(f: Awaited<ReturnType<typeof fixture>>, dispatched: boolean) {
  const { stop } = await executedPower(f, 'interrupted');
  const cp = (await f.store.read(`${stop.planId}-checkpoint.json`)) as { attempts: Record<string, unknown> };
  const node = stop.bindings.nodes[0];
  const marker = {
    schemaVersion: 1,
    engine: 'terraform',
    planSha256: stop.planSha256,
    bindingsSha256: stop.bindingsSha256,
    instanceId: node.instanceId,
    attempt: cp.attempts.stop,
  };
  const configuration = stateConfiguration(f, node);
  const revision = reviseAwsTerraformPowerConfiguration(f.base, stop, configuration, 'stop');
  const receipt = {
    schemaVersion: 1,
    engine: 'terraform',
    deploymentId: f.base.deploymentName,
    backendIdentity: `local:${f.base.deploymentName}`,
    configurationSha256: revision.afterSha256,
    providerLockSha256: AWS_CE_PROVIDER_LOCK_SHA256,
    planSha256: 'c'.repeat(64),
    changes: [{ address: revision.address, type: 'aws_ec2_instance_state', actions: ['create'] }],
    noChanges: false,
  };
  const stem = `${stop.planId}-stop-terraform`;
  await f.store.write(`${stem}-source.json`, { marker, configuration });
  await f.store.write(`${stem}-preparation.json`, { marker, revision, ...(dispatched ? { receipt } : {}) });
  if (dispatched) await f.store.write(`${stem}-dispatch.json`, { marker, receipt });
  return { stop, stem, marker, configuration, revision, receipt };
}
for (const dispatched of [false, true])
  test(`terminal retirement admits state preparation dispatched=${dispatched}`, async () => {
    const f = await fixture(true);
    const p = await statePowerPreparation(f, dispatched);
    expect((await retireAwsTerraformParentArtifacts(f.base, f.teardown, 'b'.repeat(64), f.store)).status).toBe(
      'deployment-artifacts-retired',
    );
    expect((await readdir(f.store.directory)).filter((n) => n.startsWith(p.stop.planId))).toEqual([]);
  });
test('state preparation retirement rejects changed configuration, receipt and original attempt', async () => {
  for (const mode of ['configuration', 'revision', 'receipt', 'attempt', 'orphan-dispatch', 'unexpected']) {
    const f = await fixture(true);
    const p = await statePowerPreparation(f, true);
    if (mode === 'configuration')
      await f.store.write(`${p.stem}-source.json`, { marker: p.marker, configuration: '{}' });
    if (mode === 'revision')
      await f.store.write(`${p.stem}-preparation.json`, {
        marker: p.marker,
        revision: { ...p.revision, afterSha256: '0'.repeat(64) },
        receipt: p.receipt,
      });
    if (mode === 'receipt')
      await f.store.write(`${p.stem}-preparation.json`, {
        marker: p.marker,
        revision: p.revision,
        receipt: { ...p.receipt, backendIdentity: 'local:foreign' },
      });
    if (mode === 'attempt')
      await f.store.write(`${p.stem}-dispatch.json`, { marker: { ...p.marker, attempt: {} }, receipt: p.receipt });
    if (mode === 'orphan-dispatch') await f.store.remove(`${p.stem}-preparation.json`);
    if (mode === 'unexpected') await f.store.write(`${p.stem}-unqualified.json`, {});
    await expect(retireAwsTerraformParentArtifacts(f.base, f.teardown, 'b'.repeat(64), f.store)).rejects.toThrow();
    expect(await readdir(f.store.directory)).toContain('terraform-admission.json');
  }
});

async function directPowerPreparation(dispatched: boolean) {
  const direct = await terraformRevisionFixture();
  const f = await fixture(true, direct.base);
  const preliminary = await preparedPower(f);
  await f.store.remove(`${preliminary.planId}.json`);
  await f.store.remove(`${preliminary.planId}-checkpoint.json`);
  const bindings = {
    ...preliminary.bindings,
    servicesSha256: direct.observed.servicesSha256,
    servicesInventory: {
      schemaVersion: 1 as const,
      kind: 'aws-ce-whole-site-services' as const,
      sourcePlanSha256: f.base.planSha256,
      engine: 'terraform' as const,
      components: [
        { kind: 'direct' as const, services: direct.observed.services, servicesSha256: direct.observed.servicesSha256 },
      ],
    },
  };
  bindings.servicesSha256 = canonicalSha256(bindings.servicesInventory);
  const plan = buildAwsWholeSitePowerPlan(f.base, 'stop', bindings, preliminary.transitionId);
  const attempt = {
    effect: 'withdraw',
    originalAttemptAt: new Date().toISOString(),
    requestSha256: canonicalSha256({ planSha256: plan.planSha256, effect: 'withdraw' }),
  };
  const evidence = {
    source: 'live',
    planSha256: plan.planSha256,
    bindingsSha256: plan.bindingsSha256,
    gate: 'ready-to-stop',
    collectedAt: new Date().toISOString(),
    identity: 'verified',
    cloud: 'running',
    services: 'active',
    traffic: 'passing',
    registration: 'healthy',
    configuration: 'verified',
    versions: 'stable',
    interfaces: 'up',
    canSatisfyInterfaceMutationGate: true,
  };
  await f.store.write(`${plan.planId}.json`, plan);
  await f.store.write(`${plan.planId}-checkpoint.json`, {
    schemaVersion: 1,
    planSha256: plan.planSha256,
    bindingsSha256: plan.bindingsSha256,
    step: 1,
    complete: false,
    attempts: { withdraw: attempt },
    pending: attempt,
    evidence: { 'ready-to-stop': evidence },
  });
  const marker = {
    schemaVersion: 1,
    engine: 'terraform',
    planSha256: plan.planSha256,
    bindingsSha256: plan.bindingsSha256,
    servicesSha256: direct.observed.servicesSha256,
    attempt,
  };
  const revision = reviseAwsTerraformDirectServiceRoutes(f.base, direct.observed.services, direct.original, 'withdraw');
  const receipt = {
    schemaVersion: 1,
    engine: 'terraform',
    deploymentId: f.base.deploymentName,
    backendIdentity: `local:${f.base.deploymentName}`,
    configurationSha256: revision.afterSha256,
    providerLockSha256: AWS_CE_PROVIDER_LOCK_SHA256,
    planSha256: 'c'.repeat(64),
    changes: [{ address: 'aws_route.direct_0', type: 'aws_route', actions: ['delete'] }],
    noChanges: false,
  };
  const stem = `${plan.planId}-withdraw-terraform-direct`;
  await f.store.write(`${stem}-preparation.json`, {
    marker,
    source: direct.original,
    revision,
    ...(dispatched ? { receipt } : {}),
  });
  if (dispatched) await f.store.write(`${stem}-dispatch.json`, { marker, receipt });
  return { f, plan, stem, marker, revision, receipt, direct };
}
for (const dispatched of [false, true])
  test(`terminal retirement admits direct service preparation dispatched=${dispatched}`, async () => {
    const p = await directPowerPreparation(dispatched);
    expect((await retireAwsTerraformParentArtifacts(p.f.base, p.f.teardown, 'b'.repeat(64), p.f.store)).status).toBe(
      'deployment-artifacts-retired',
    );
    expect((await readdir(p.f.store.directory)).filter((n) => n.startsWith(p.plan.planId))).toEqual([]);
  });
test('direct service retirement rejects foreign services, source, receipt and unresolved route', async () => {
  for (const mode of ['service', 'source', 'receipt', 'route']) {
    const p = await directPowerPreparation(true);
    const prep = (await p.f.store.read(`${p.stem}-preparation.json`)) as {
      marker: Record<string, unknown>;
      source: string;
      revision: typeof p.revision;
      receipt: typeof p.receipt;
    };
    if (mode === 'service') prep.marker.servicesSha256 = '0'.repeat(64);
    if (mode === 'source') prep.source = '{}';
    if (mode === 'receipt') prep.receipt.changes[0].actions = ['update'];
    if (mode === 'route') prep.revision.routes.direct_0.network_interface_id = '__ENI_1_1__';
    await p.f.store.write(`${p.stem}-preparation.json`, prep);
    await expect(
      retireAwsTerraformParentArtifacts(p.f.base, p.f.teardown, 'b'.repeat(64), p.f.store),
    ).rejects.toThrow();
    expect(await readdir(p.f.store.directory)).toContain('terraform-admission.json');
  }
});

async function bgpRetirementFixture() {
  const bgp = await bgpControllerFixture('terraform');
  await bgp.dispatch();
  bgp.withdraw();
  expect(await bgp.reconcile()).toBe('completed');
  const f = await fixture(true, bgp.base);
  for (const name of await readdir(bgp.storage.directory))
    if (name.startsWith(bgp.plan.planId)) await f.store.write(name, await bgp.storage.read(name));
  const cp = (await f.store.read(`${bgp.plan.planId}-checkpoint.json`)) as Record<string, unknown>;
  cp.evidence = {
    'ready-to-stop': {
      source: 'live',
      planSha256: bgp.plan.planSha256,
      bindingsSha256: bgp.plan.bindingsSha256,
      gate: 'ready-to-stop',
      collectedAt: new Date().toISOString(),
      identity: 'verified',
      cloud: 'running',
      services: 'active',
      traffic: 'passing',
      registration: 'healthy',
      configuration: 'verified',
      versions: 'stable',
      interfaces: 'up',
      canSatisfyInterfaceMutationGate: true,
    },
  };
  await f.store.write(`${bgp.plan.planId}-checkpoint.json`, cp);
  return { f, bgp };
}
test('terminal cleanup retires exact BGP policy creation and routing journals without replay', async () => {
  const { f, bgp } = await bgpRetirementFixture();
  const mutations = [...bgp.mutations];
  expect((await retireAwsTerraformParentArtifacts(f.base, f.teardown, 'b'.repeat(64), f.store)).status).toBe(
    'deployment-artifacts-retired',
  );
  expect((await readdir(f.store.directory)).filter((n) => n.startsWith(bgp.plan.planId))).toEqual([]);
  expect(bgp.mutations).toEqual(mutations);
});
test('BGP retirement rejects foreign snapshot and substituted creation or dispatch evidence', async () => {
  for (const mode of ['snapshot', 'policy', 'dispatch', 'outcome', 'publisher-site', 'partial-snapshot']) {
    const { f, bgp } = await bgpRetirementFixture();
    const stem = `${bgp.plan.planId}-withdraw-terraform-bgp`;
    if (mode === 'snapshot') {
      const p = (await f.store.read(`${stem}-preparation.json`)) as { snapshots: Array<Record<string, unknown>> };
      p.snapshots[0].uid = 'foreign';
      await f.store.write(`${stem}-preparation.json`, p);
    }
    if (mode === 'policy') {
      const p = (await f.store.read(`${stem}-policy-created.json`)) as Record<string, unknown>;
      p.uid = 'foreign';
      await f.store.write(`${stem}-policy-created.json`, p);
    }
    if (mode === 'dispatch') await f.store.write(`${stem}-replacement-dispatch.json`, {});
    if (mode === 'outcome') {
      const p = (await f.store.read(`${stem}-outcome.json`)) as { observed: Record<string, unknown> };
      p.observed.servicesSha256 = '0'.repeat(64);
      await f.store.write(`${stem}-outcome.json`, p);
    }
    if (mode === 'publisher-site' || mode === 'partial-snapshot') {
      const p = (await f.store.read(`${stem}-outcome.json`)) as any;
      if (mode === 'publisher-site') p.observed.snapshots[0].siteUid = 'foreign';
      else p.observed.snapshots = [];
      await f.store.write(`${stem}-outcome.json`, p);
    }
    await expect(retireAwsTerraformParentArtifacts(f.base, f.teardown, 'b'.repeat(64), f.store)).rejects.toThrow();
    expect(await readdir(f.store.directory)).toContain('terraform-admission.json');
  }
});

for (const family of ['nlb', 'static-tgw'] as const)
  test(`terminal retirement admits exact ${family} preparation and rejects changed receipt`, async () => {
    const cloud = family === 'nlb' ? await nlbPowerFixture('terraform') : await staticRevisionFixture();
    const f = await fixture(true, cloud.base);
    const prepared = await preparedPower(f);
    await f.store.remove(`${prepared.planId}.json`);
    await f.store.remove(`${prepared.planId}-checkpoint.json`);
    const observed =
      family === 'nlb'
        ? await collectAwsPowerNlbServices(cloud.base, cloud.values, cloud.api)
        : 'observed' in cloud
          ? cloud.observed
          : undefined;
    if (!observed) throw Error('Missing service fixture');
    const services = observed.services;
    const bindings = {
      ...prepared.bindings,
      servicesInventory: {
        schemaVersion: 1 as const,
        kind: 'aws-ce-whole-site-services' as const,
        sourcePlanSha256: f.base.planSha256,
        engine: 'terraform' as const,
        components: [{ kind: family, services, servicesSha256: canonicalSha256(services) }],
      },
    };
    bindings.servicesSha256 = canonicalSha256(bindings.servicesInventory);
    const plan = buildAwsWholeSitePowerPlan(f.base, 'stop', bindings, prepared.transitionId);
    const attempt = {
      effect: 'withdraw',
      originalAttemptAt: new Date().toISOString(),
      requestSha256: canonicalSha256({ planSha256: plan.planSha256, effect: 'withdraw' }),
    };
    const marker = {
      schemaVersion: 1,
      engine: 'terraform',
      planSha256: plan.planSha256,
      bindingsSha256: plan.bindingsSha256,
      servicesSha256: canonicalSha256(services),
      attempt,
    };
    const evidence = {
      source: 'live',
      planSha256: plan.planSha256,
      bindingsSha256: plan.bindingsSha256,
      gate: 'ready-to-stop',
      collectedAt: new Date().toISOString(),
      identity: 'verified',
      cloud: 'running',
      services: 'active',
      traffic: 'passing',
      registration: 'healthy',
      configuration: 'verified',
      versions: 'stable',
      interfaces: 'up',
      canSatisfyInterfaceMutationGate: true,
    };
    await f.store.write(`${plan.planId}.json`, plan);
    await f.store.write(`${plan.planId}-checkpoint.json`, {
      schemaVersion: 1,
      planSha256: plan.planSha256,
      bindingsSha256: plan.bindingsSha256,
      step: 1,
      complete: false,
      attempts: { withdraw: attempt },
      pending: attempt,
      evidence: { 'ready-to-stop': evidence },
    });
    const source =
      family === 'static-tgw' && 'original' in cloud
        ? cloud.original
        : JSON.stringify({
            terraform: {
              required_version: '= 1.16.5',
              required_providers: { aws: { source: 'hashicorp/aws', version: '= 6.63.0' } },
            },
            provider: { aws: { region: f.base.region, allowed_account_ids: [f.base.accountId] } },
            resource: {
              aws_lb_target_group_attachment: {
                node_1: {
                  target_group_arn: '${aws_lb_target_group.ce.arn}',
                  target_id: '10.0.4.10',
                  port: 443,
                  availability_zone: 'all',
                  depends_on: ['aws_instance.node_1'],
                },
              },
            },
          });
    const revision =
      family === 'nlb'
        ? reviseAwsTerraformNlbMembership(f.base, services as never, source, 'withdraw')
        : reviseAwsTerraformStaticServiceRoutes(f.base, services as never, source, 'withdraw');
    const address =
      family === 'nlb' ? 'aws_lb_target_group_attachment.node_1' : 'aws_ec2_transit_gateway_route.static_0';
    const receipt = {
      schemaVersion: 1,
      engine: 'terraform',
      deploymentId: f.base.deploymentName,
      backendIdentity: `local:${f.base.deploymentName}`,
      configurationSha256: revision.afterSha256,
      providerLockSha256: AWS_CE_PROVIDER_LOCK_SHA256,
      planSha256: 'c'.repeat(64),
      noChanges: false,
      changes: [
        {
          address,
          type: family === 'nlb' ? 'aws_lb_target_group_attachment' : 'aws_ec2_transit_gateway_route',
          actions: ['delete'],
        },
      ],
    };
    const path = `${plan.planId}-withdraw-terraform-${family}-preparation.json`;
    await f.store.write(path, { marker, source, revision, receipt: { ...receipt, backendIdentity: 'local:foreign' } });
    await expect(retireAwsTerraformParentArtifacts(f.base, f.teardown, 'b'.repeat(64), f.store)).rejects.toThrow();
    await f.store.write(path, { marker, source, revision, receipt });
    expect((await retireAwsTerraformParentArtifacts(f.base, f.teardown, 'b'.repeat(64), f.store)).status).toBe(
      'deployment-artifacts-retired',
    );
  });

test('power retirement rejects byte-identical inode substitution after frozen inventory', async () => {
  const f = await fixture(true);
  const { stop } = await executedPower(f, 'stopped');
  const controller = new AbortController();
  const verify = f.store.verify.bind(f.store);
  f.store.verify = async () => {
    await verify();
    if ((await readdir(f.store.directory)).includes('aws-terraform-parent-artifact-retirement.json'))
      controller.abort();
  };
  await expect(
    retireAwsTerraformParentArtifacts(f.base, f.teardown, 'b'.repeat(64), f.store, controller.signal),
  ).rejects.toThrow();
  f.store.verify = verify;
  const path = join(f.store.directory, `${stop.planId}-maintenance.json`);
  const bytes = await readFile(path);
  await rename(path, path + '.retained');
  await writeFile(path, bytes, { mode: 0o600 });
  await rm(path + '.retained');
  await expect(retireAwsTerraformParentArtifacts(f.base, f.teardown, 'b'.repeat(64), f.store)).rejects.toThrow();
  expect(await readdir(f.store.directory)).toContain('terraform-admission.json');
});

async function restoredBgpRetirement(status: 'deleted' | 'pending') {
  const bgp = await bgpControllerFixture('terraform');
  const f = await fixture(true, bgp.base);
  let cloud: 'running' | 'stopped' = 'running';
  let services: 'active' | 'withdrawn' = 'active';
  bgp.runtime.deleteTerraformPowerRoutingPolicy = async (snapshot, disposition, checkpoint) => {
    if (disposition === 'not-submitted') {
      await checkpoint({ ...snapshot, kind: 'bgp_routing_policy', phase: 'power-policy-delete-dispatch' });
      bgp.mutations.push('DELETE');
    }
    return { ...snapshot, status, collectedAt: new Date().toISOString() };
  };
  const driver: AwsWholeSitePowerDriver = {
    engine: 'terraform',
    readBindings: async () => bgp.plan.bindings,
    observe: async (plan, gate) => ({
      source: 'live',
      planSha256: plan.planSha256,
      bindingsSha256: plan.bindingsSha256,
      gate,
      collectedAt: new Date().toISOString(),
      identity: 'verified',
      cloud,
      services,
      traffic: services === 'active' ? 'passing' : 'blocked',
      registration: 'healthy',
      configuration: 'verified',
      versions: 'stable',
      interfaces: 'up',
      canSatisfyInterfaceMutationGate: true,
    }),
    execute: async (plan, effect) => {
      if (effect === 'withdraw' || effect === 'restore') {
        await dispatchAwsTerraformBgpPower(
          f.base,
          plan,
          plan.planSha256,
          effect,
          f.store,
          bgp.values,
          bgp.api,
          bgp.runtime,
        );
        if (effect === 'withdraw') bgp.withdraw();
        else bgp.restore();
        services = effect === 'withdraw' ? 'withdrawn' : 'active';
      } else if (effect === 'release') {
        await retireAwsTerraformBgpPowerPolicy(
          f.base,
          plan,
          plan.planSha256,
          f.store,
          bgp.values,
          bgp.api,
          bgp.runtime,
        );
      } else cloud = effect === 'stop' ? 'stopped' : 'running';
    },
    reconcile: async (plan, effect, attemptedAt) => {
      if (effect === 'withdraw' || effect === 'restore')
        return reconcileAwsTerraformBgpPower(
          f.base,
          plan,
          effect,
          attemptedAt,
          f.store,
          bgp.values,
          bgp.api,
          bgp.runtime,
        );
      if (effect === 'release')
        return retireAwsTerraformBgpPowerPolicy(
          f.base,
          plan,
          plan.planSha256,
          f.store,
          bgp.values,
          bgp.api,
          bgp.runtime,
        );
      return 'completed';
    },
    finish: async () => ({ engine: 'terraform', noChanges: true }),
  };
  const stopped = await runAwsWholeSitePower(f.base, bgp.plan, bgp.plan.planSha256, f.store, driver);
  if (!('maintenance' in stopped)) throw Error('Stopped maintenance missing');
  const start = buildAwsWholeSitePowerPlan(
    f.base,
    'start',
    bgp.plan.bindings,
    bgp.plan.transitionId,
    stopped.maintenance,
  );
  const result = await runAwsWholeSitePower(f.base, start, start.planSha256, f.store, driver);
  return { f, bgp, start, result };
}
for (const status of ['deleted', 'pending'] as const)
  test(`terminal retirement qualifies BGP restore and ${status} deletion journals without replay`, async () => {
    const { f, bgp, result } = await restoredBgpRetirement(status);
    expect(result.status).toBe(status === 'deleted' ? 'site-started' : 'power-pending');
    const calls = [...bgp.mutations];
    expect((await retireAwsTerraformParentArtifacts(f.base, f.teardown, 'b'.repeat(64), f.store)).status).toBe(
      'deployment-artifacts-retired',
    );
    expect(bgp.mutations).toEqual(calls);
  });
test('restored BGP terminal retirement rejects wrong deletion identity and invalid result state', async () => {
  for (const mode of ['identity', 'status', 'time', 'services']) {
    const { f, start } = await restoredBgpRetirement('deleted');
    const name = `${start.planId}-restore-terraform-bgp-policy-retirement-outcome.json`;
    const outcome = (await f.store.read(name)) as any;
    if (mode === 'identity') outcome.result.uid = 'foreign';
    if (mode === 'status') outcome.result.status = 'fabricated';
    if (mode === 'time') outcome.result.collectedAt = 'not-a-date';
    if (mode === 'services') outcome.observed.servicesSha256 = '0'.repeat(64);
    await f.store.write(name, outcome);
    await expect(retireAwsTerraformParentArtifacts(f.base, f.teardown, 'b'.repeat(64), f.store)).rejects.toThrow();
    expect(await readdir(f.store.directory)).toContain('terraform-admission.json');
  }
});

async function stateLifecycleRetirement() {
  const f = await fixture(true);
  const { stop, start } = await executedPower(f, 'restored');
  if (!start) throw Error('Start plan missing');
  const node = stop.bindings.nodes[0];
  let source = stateConfiguration(f, node);
  let finalStem = '';
  for (const [plan, effect, action] of [
    [stop, 'stop', 'create'],
    [start, 'start', 'update'],
    [start, 'release', 'delete'],
  ] as const) {
    const cp = (await f.store.read(`${plan.planId}-checkpoint.json`)) as { attempts: Record<string, unknown> };
    const marker = {
      schemaVersion: 1,
      engine: 'terraform',
      planSha256: plan.planSha256,
      bindingsSha256: plan.bindingsSha256,
      instanceId: node.instanceId,
      attempt: cp.attempts[effect],
    };
    const revision = reviseAwsTerraformPowerConfiguration(f.base, plan, source, effect);
    const receipt = {
      schemaVersion: 1,
      engine: 'terraform',
      deploymentId: f.base.deploymentName,
      backendIdentity: `local:${f.base.deploymentName}`,
      configurationSha256: revision.afterSha256,
      providerLockSha256: AWS_CE_PROVIDER_LOCK_SHA256,
      planSha256: 'c'.repeat(64),
      noChanges: false,
      changes: [{ address: revision.address, type: 'aws_ec2_instance_state', actions: [action] }],
    };
    const stem = `${plan.planId}-${effect}-terraform`;
    const fields = {
      [`aws_instance.node_${node.nodeIndex}`]: { id: node.instanceId },
      ...Object.fromEntries(
        node.interfaces.map((nic) => [
          `aws_network_interface.node_${node.nodeIndex}_nic_${nic.index}`,
          { id: nic.id, mac_address: nic.mac },
        ]),
      ),
      [revision.address]:
        effect === 'release'
          ? null
          : {
              id: node.instanceId,
              instance_id: node.instanceId,
              state: effect === 'stop' ? 'stopped' : 'running',
              force: false,
            },
    };
    const cloud = {
      owner: plan.bindings.owner,
      nodes: plan.bindings.nodes,
      cloud: effect === 'stop' ? 'stopped' : 'running',
    };
    await f.store.write(`${stem}-source.json`, { marker, configuration: source });
    await f.store.write(`${stem}-preparation.json`, { marker, revision, receipt });
    await f.store.write(`${stem}-dispatch.json`, { marker, receipt });
    await f.store.write(`${stem}-outcome.json`, {
      schemaVersion: 1,
      marker,
      receipt,
      fields,
      cloud,
      collectedAt: new Date().toISOString(),
    });
    if (effect === 'release') {
      finalStem = stem;
      const final = { ...receipt, planSha256: 'd'.repeat(64), changes: [], noChanges: true };
      await f.store.write(`${stem}-final-preparing.json`, { marker, removalReceipt: receipt });
      await f.store.write(`${stem}-final-plan.json`, { marker, receipt: final });
      await f.store.write(`${stem}-complete.json`, {
        schemaVersion: 1,
        marker,
        receipt: final,
        fields,
        cloud,
        collectedAt: new Date().toISOString(),
      });
    }
    source = revision.configuration;
  }
  return { f, stop, start, finalStem };
}
test('terminal retirement qualifies complete state stop/start/release and final no-change journals', async () => {
  const { f } = await stateLifecycleRetirement();
  expect((await retireAwsTerraformParentArtifacts(f.base, f.teardown, 'b'.repeat(64), f.store)).status).toBe(
    'deployment-artifacts-retired',
  );
});
for (const mode of ['node', 'mac', 'cloud', 'duplicate-plan', 'final-receipt'] as const)
  test(`state final retirement rejects substituted ${mode} evidence before removal`, async () => {
    const { f, finalStem } = await stateLifecycleRetirement();
    const path = `${finalStem}-${mode === 'duplicate-plan' ? 'final-plan' : 'complete'}.json`;
    const value = (await f.store.read(path)) as any;
    if (mode === 'node') value.fields['aws_instance.node_1'].id = 'i-fffffffffffffffff';
    if (mode === 'mac') value.fields['aws_network_interface.node_1_nic_0'].mac_address = 'ff:ff:ff:ff:ff:ff';
    if (mode === 'cloud') value.cloud.owner.account = 'example-foreign-account';
    if (mode === 'duplicate-plan')
      value.receipt.changes = [0, 1].map(() => ({ address: 'aws_instance.node_1', actions: ['no-op'] }));
    if (mode === 'final-receipt') value.receipt.planSha256 = 'e'.repeat(64);
    await f.store.write(path, value);
    await expect(retireAwsTerraformParentArtifacts(f.base, f.teardown, 'b'.repeat(64), f.store)).rejects.toThrow();
    expect(await readdir(f.store.directory)).toContain('terraform-admission.json');
  });

async function restoredDirectRetirement() {
  const p = await directPowerPreparation(true);
  const { f, plan: stop, direct } = p;
  let cloud: 'running' | 'stopped' = 'running';
  let services: 'active' | 'withdrawn' = 'withdrawn';
  const driver: AwsWholeSitePowerDriver = {
    engine: 'terraform',
    readBindings: async () => stop.bindings,
    observe: async (plan, gate) => ({
      source: 'live',
      planSha256: plan.planSha256,
      bindingsSha256: plan.bindingsSha256,
      gate,
      collectedAt: new Date().toISOString(),
      identity: 'verified',
      cloud,
      services,
      traffic: services === 'active' ? 'passing' : 'blocked',
      registration: 'healthy',
      configuration: 'verified',
      versions: 'stable',
      interfaces: 'up',
      canSatisfyInterfaceMutationGate: true,
    }),
    execute: async (_plan, effect) => {
      if (effect === 'stop') cloud = 'stopped';
      if (effect === 'start') cloud = 'running';
      if (effect === 'restore') services = 'active';
    },
    reconcile: async () => 'completed',
    finish: async () => ({ engine: 'terraform', noChanges: true }),
  };
  const stopped = await runAwsWholeSitePower(f.base, stop, stop.planSha256, f.store, driver);
  if (!('maintenance' in stopped)) throw Error('Maintenance missing');
  const start = buildAwsWholeSitePowerPlan(f.base, 'start', stop.bindings, stop.transitionId, stopped.maintenance);
  await runAwsWholeSitePower(f.base, start, start.planSha256, f.store, driver);
  const owned = Object.fromEntries(
    Object.entries(p.revision.routes).map(([name, route]) => [`aws_route.${name}`, route]),
  );
  const absent = Object.fromEntries(Object.keys(owned).map((name) => [name, null]));
  await f.store.write(`${p.stem}-outcome.json`, {
    marker: p.marker,
    receipt: p.receipt,
    applied: absent,
    observed: { ...direct.observed, status: 'withdrawn' },
    collectedAt: new Date().toISOString(),
  });
  const cp = (await f.store.read(`${start.planId}-checkpoint.json`)) as { attempts: Record<string, unknown> };
  const marker = { ...p.marker, planSha256: start.planSha256, attempt: cp.attempts.restore };
  const source = p.revision.configuration;
  const revision = reviseAwsTerraformDirectServiceRoutes(
    f.base,
    direct.observed.services,
    source,
    'restore',
    p.revision,
  );
  const receipt = {
    ...p.receipt,
    configurationSha256: revision.afterSha256,
    changes: Object.keys(owned).map((address) => ({ address, type: 'aws_route', actions: ['create'] })),
  };
  const stem = `${start.planId}-restore-terraform-direct`;
  await f.store.write(`${stem}-preparation.json`, { marker, source, revision, receipt });
  await f.store.write(`${stem}-dispatch.json`, { marker, receipt });
  await f.store.write(`${stem}-outcome.json`, {
    marker,
    receipt,
    applied: owned,
    observed: direct.observed,
    collectedAt: new Date().toISOString(),
  });
  return { f, stem };
}
test('terminal retirement qualifies direct-route withdrawal/restoration and applied outcomes', async () => {
  const { f } = await restoredDirectRetirement();
  expect((await retireAwsTerraformParentArtifacts(f.base, f.teardown, 'b'.repeat(64), f.store)).status).toBe(
    'deployment-artifacts-retired',
  );
});
for (const mode of ['applied', 'status', 'services', 'time'] as const)
  test(`direct restoration retirement rejects substituted ${mode} outcome`, async () => {
    const { f, stem } = await restoredDirectRetirement();
    const path = `${stem}-outcome.json`;
    const outcome = (await f.store.read(path)) as any;
    if (mode === 'applied') outcome.applied = {};
    if (mode === 'status') outcome.observed.status = 'withdrawn';
    if (mode === 'services') outcome.observed.servicesSha256 = '0'.repeat(64);
    if (mode === 'time') outcome.collectedAt = 'not-a-date';
    await f.store.write(path, outcome);
    await expect(retireAwsTerraformParentArtifacts(f.base, f.teardown, 'b'.repeat(64), f.store)).rejects.toThrow();
    expect(await readdir(f.store.directory)).toContain('terraform-admission.json');
  });

test('parent retirement rejects missing independent original execution evidence', async () => {
  const f = await fixture(),
    path = join(f.store.directory, f.base.deploymentName, 'artifact-retirement.json');
  const marker = JSON.parse(await readFile(path, 'utf8'));
  delete marker.independentCleanup;
  await writeFile(path, JSON.stringify(marker), { mode: 0o600 });
  await expect(retireAwsTerraformParentArtifacts(f.base, f.teardown, 'b'.repeat(64), f.store)).rejects.toThrow(
    'Independent',
  );
});

test('parent retirement curates other integrity-verified teardown plans without changing the selected retirement', async () => {
  const f = await fixture();
  const owner = siteBindings(f.base)[0].binding.owner;
  const drain = {
    owner,
    sourcePlanSha256: f.base.planSha256,
    siteContractFingerprint: 'site',
    ingressContractFingerprint: 'ingress',
  };
  Object.assign(f.teardown, { drain });
  await f.store.write(`${f.teardown.planId}.json`, f.teardown);
  const draft = {
    schemaVersion: 1,
    engine: 'terraform',
    kind: 'aws-ce-terraform-pending-teardown',
    sourcePlanSha256: f.base.planSha256,
    sourceJournalSha256: 'd'.repeat(64),
    drain,
    retirement: [],
  };
  const planSha256 = canonicalSha256(draft),
    planId = `aws-ce-pending-teardown-${planSha256.slice(0, 24)}`;
  await f.store.write(`${planId}.json`, { ...draft, planId, planSha256 });
  await f.store.write(`${planId}-authorization.json`, {
    schemaVersion: 1,
    engine: 'terraform',
    sourcePlanSha256: f.base.planSha256,
    teardownPlanSha256: planSha256,
    mutations: true,
  });
  const result = await retireAwsTerraformParentArtifacts(f.base, f.teardown, 'b'.repeat(64), f.store);
  expect(result.status).toBe('deployment-artifacts-retired');
  expect(await readdir(f.store.directory)).not.toContain(`${planId}.json`);
  expect(await readdir(f.store.directory)).not.toContain(`${planId}-authorization.json`);
  expect(await readdir(f.store.directory)).toContain(`${f.teardown.planId}.json`);
});

test('parent retirement refuses altered or foreign alternative teardown plan and authorization', async () => {
  for (const mode of ['bytes', 'owner', 'source', 'contract', 'authorization']) {
    const f = await fixture();
    const owner = siteBindings(f.base)[0].binding.owner;
    const drain = {
      owner,
      sourcePlanSha256: f.base.planSha256,
      siteContractFingerprint: 'site',
      ingressContractFingerprint: 'ingress',
    };
    Object.assign(f.teardown, { drain });
    await f.store.write(`${f.teardown.planId}.json`, f.teardown);
    const draft = {
      schemaVersion: 1,
      engine: 'terraform',
      kind: 'aws-ce-terraform-pending-teardown',
      sourcePlanSha256: mode === 'source' ? 'f'.repeat(64) : f.base.planSha256,
      drain: {
        ...drain,
        ...(mode === 'owner' ? { owner: {} } : {}),
        ...(mode === 'contract' ? { siteContractFingerprint: 'foreign' } : {}),
      },
      retirement: [],
    };
    const planSha256 = canonicalSha256(draft),
      planId = `aws-ce-pending-teardown-${planSha256.slice(0, 24)}`;
    await f.store.write(`${planId}.json`, {
      ...draft,
      planId,
      planSha256,
      ...(mode === 'bytes' ? { changed: true } : {}),
    });
    await f.store.write(`${planId}-authorization.json`, {
      schemaVersion: 1,
      engine: 'terraform',
      sourcePlanSha256: f.base.planSha256,
      teardownPlanSha256: mode === 'authorization' ? 'f'.repeat(64) : planSha256,
      mutations: true,
    });
    await expect(retireAwsTerraformParentArtifacts(f.base, f.teardown, 'b'.repeat(64), f.store)).rejects.toThrow();
    expect(await readdir(f.store.directory)).toContain('terraform-admission.json');
  }
});
