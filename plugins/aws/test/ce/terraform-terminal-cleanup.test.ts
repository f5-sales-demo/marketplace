import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { canonicalSha256 } from '../../src/ce/canonical';
import { beginAwsTerraformRetirement } from '../../src/ce/terraform-lifecycle';
import { finalizeAwsTerraformCleanup } from '../../src/ce/terraform-terminal-cleanup';
import { siteBindings } from '../../src/ce/topology';
import { foundationPlan } from './terraform-fixtures';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
async function fixture(mode = 'absent') {
  const original = foundationPlan();
  original.intent.partition = 'aws';
  const { planId: _id, planSha256: _sha, ...draft } = original;
  const material = {
    ...draft,
    deploymentName: original.intent.deploymentName,
    accountId: original.intent.accountId,
    region: original.intent.region,
  };
  const sha = canonicalSha256(material);
  const base = { ...material, planSha256: sha, planId: `aws-ce-${sha.slice(0, 24)}` };
  const teardown = {
    kind: 'aws-ce-terraform-foundation-teardown',
    sourcePlanSha256: sha,
    planSha256: 'a'.repeat(64),
    planId: 'aws-ce-foundation-teardown-example',
    drain: {
      siteContractFingerprint: 'site-contract',
      ingressContractFingerprint: 'ingress-contract',
      listeners:
        mode === 'origin' ? [{ id: 'a'.repeat(24), name: 'listener', namespace: 'example-listener-space' }] : [],
      origins: mode === 'origin' ? [{ origin: { name: 'origin', namespace: 'example-origin-space' } }] : [],
    },
  };
  const owner = siteBindings(base)[0].binding.owner;
  const root = await mkdtemp(join(tmpdir(), 'terminal-cleanup-'));
  roots.push(root);
  const store = await CeDeploymentStore.open(root, owner);
  await beginAwsTerraformRetirement(base, teardown, store);
  await store.write(`${teardown.planId}.json`, teardown);
  await store.write(`${teardown.planId}-authorization.json`, {
    schemaVersion: 1,
    engine: 'terraform',
    sourcePlanSha256: sha,
    teardownPlanSha256: teardown.planSha256,
    mutations: true,
  });
  await store.write('terraform-admission.json', { private: 'PRIVATE_SYNTHETIC_BOOTSTRAP' });
  await store.write('terraform-cloud-teardown.json', {
    schemaVersion: 1,
    engine: 'terraform',
    sourcePlanSha256: sha,
    phase: 'retired',
  });
  const inventoryMaterial = {
    schemaVersion: 1,
    engine: 'terraform',
    accountId: base.accountId,
    region: base.region,
    deploymentId: base.deploymentName,
    sourcePlanSha256: sha,
    terraformPlanSha256: 'c'.repeat(64),
    resources: [{ type: 'aws_vpc', id: 'vpc-12345678' }],
    tgwEdges: [],
  };
  await store.write('terraform-cloud-teardown-inventory.json', {
    ...inventoryMaterial,
    sha256: canonicalSha256(inventoryMaterial),
  });
  let namespaces: string[] = [];
  let plans = 0,
    retirements = 0,
    observations = 0,
    interrupted = mode === 'interrupt';
  const runnerPath = join(store.directory, base.deploymentName);
  await mkdir(runnerPath, { mode: 0o700 });
  const manifest = {
    schemaVersion: 1,
    deploymentId: base.deploymentName,
    engine: 'terraform',
    backendIdentity: `local:${base.deploymentName}`,
    scope: { cloud: 'aws', account: base.accountId, region: base.region },
  };
  await writeFile(join(runnerPath, 'deployment.json'), JSON.stringify(manifest), { mode: 0o600 });
  await writeFile(join(runnerPath, 'main.tf.json'), 'PRIVATE', { mode: 0o600 });
  const receipt = {
    schemaVersion: 1,
    engine: 'terraform',
    deploymentId: base.deploymentName,
    backendIdentity: `local:${base.deploymentName}`,
    configurationSha256: 'd'.repeat(64),
    providerLockSha256: 'e'.repeat(64),
    planSha256: 'f'.repeat(64),
    changes: [],
    noChanges: mode !== 'drift',
  };
  const session = {
    plan: async () => {
      plans++;
      return receipt;
    },
    retireArtifacts: async (r: unknown, evidence: string) => {
      expect(r).toEqual(receipt);
      retirements++;
      if (interrupted) {
        interrupted = false;
        throw Error('interrupted removal');
      }
      await rm(join(runnerPath, 'main.tf.json'), { force: true });
      await writeFile(
        join(runnerPath, 'artifact-retirement.json'),
        JSON.stringify({
          schemaVersion: 1,
          status: 'runner-artifacts-retired',
          manifestSha256: canonicalSha256(manifest),
          evidenceSha256: evidence,
          finalPlanSha256: receipt.planSha256,
          planReceiptSha256: hash(JSON.stringify(receipt)),
          inventorySha256: hash('[]'),
          artifacts: [],
        }),
        { mode: 0o600 },
      );
      return { status: 'runner-artifacts-retired', evidenceSha256: evidence, finalPlanSha256: receipt.planSha256 };
    },
  };
  const runtime = {
    engine: 'terraform',
    contract: { fingerprint: 'site-contract' },
    unregisteredAbsence: async (_bindings: unknown, scope: string[]) => {
      namespaces = scope;
      observations++;
      return {
        status: mode === 'platform-present' ? 'unknown' : 'absent',
        owner,
        siteContractFingerprint: 'site-contract',
        ingressContractFingerprint: 'ingress-contract',
        startedAt: new Date().toISOString(),
        observedAt: mode === 'stale' ? '2000-01-01T00:00:00Z' : new Date().toISOString(),
        sources: ['synthetic-protocol'],
      };
    },
  };
  const api = {
    exec: async (_cmd: string, args: string[]) => {
      const op = args[1];
      return {
        exitCode: mode === 'unauthorized' ? 1 : 0,
        stderr: mode === 'unauthorized' ? 'UnauthorizedOperation' : '',
        stdout: JSON.stringify(
          op === 'get-caller-identity'
            ? { Account: base.accountId }
            : op === 'describe-tags'
              ? { Tags: [] }
              : op === 'get-resources'
                ? { ResourceTagMappingList: [], PaginationToken: '' }
                : op === 'describe-vpcs'
                  ? { Vpcs: mode === 'cloud-present' ? [{ VpcId: 'vpc-12345678' }] : [] }
                  : {},
        ),
      };
    },
  };
  return {
    base,
    teardown,
    store,
    session,
    runtime,
    api,
    contract: { fingerprint: 'ingress-contract' },
    counts: () => ({ plans, retirements, observations, namespaces }),
  };
}
test('terminal absence covers distinct listener and nested origin snapshot namespaces', async () => {
  const f = await fixture('origin');
  const result = await finalizeAwsTerraformCleanup(
    f.base,
    f.teardown,
    f.teardown.planSha256,
    f.runtime as never,
    f.contract as never,
    f.session as never,
    f.store,
    f.api,
    {},
  );
  expect(result.status).toBe('deployment-artifacts-retired');
  expect(f.counts().namespaces).toEqual(['default', 'example-listener-space', 'example-origin-space']);
});
test('terminal finalizer qualifies fresh absence then retires owning runner and parent journals', async () => {
  const f = await fixture();
  const run = () =>
    finalizeAwsTerraformCleanup(
      f.base,
      f.teardown,
      f.teardown.planSha256,
      f.runtime as never,
      f.contract as never,
      f.session as never,
      f.store,
      f.api,
      {},
      undefined,
      undefined,
    );
  const result = await run();
  expect(result.status).toBe('deployment-artifacts-retired');
  expect(await readdir(f.store.directory)).not.toContain('terraform-admission.json');
  expect(f.counts().plans).toBe(1);
  expect(f.counts().observations).toBeGreaterThanOrEqual(2);
  const repeated = await run();
  expect(repeated).toEqual(result);
  expect(f.counts().plans).toBe(1);
});
test('terminal cleanup interruption resumes immutable plan without normal teardown journals or replanning', async () => {
  const f = await fixture('interrupt');
  const run = () =>
    finalizeAwsTerraformCleanup(
      f.base,
      f.teardown,
      f.teardown.planSha256,
      f.runtime as never,
      f.contract as never,
      f.session as never,
      f.store,
      f.api,
      {},
      undefined,
      undefined,
    );
  await expect(run()).rejects.toThrow('interrupted');
  expect(await f.store.read('aws-terraform-terminal-cleanup.json')).toBeDefined();
  await run();
  expect(f.counts().plans).toBe(1);
  expect(f.counts().retirements).toBe(2);
});
test('terminal cleanup leaves source journals for present, stale, unauthorized, wrong-plan or unqualified-stage evidence', async () => {
  for (const mode of [
    'platform-present',
    'cloud-present',
    'stale',
    'unauthorized',
    'drift',
    'authorization',
    'stage',
  ]) {
    const f = await fixture(mode);
    if (mode === 'stage')
      await mkdir(join(f.store.directory, 'terraform-stages/unknown-stage'), { recursive: true, mode: 0o700 });
    await expect(
      finalizeAwsTerraformCleanup(
        f.base,
        f.teardown,
        mode === 'authorization' ? '0'.repeat(64) : f.teardown.planSha256,
        f.runtime as never,
        f.contract as never,
        f.session as never,
        f.store,
        f.api,
        {},
        undefined,
        undefined,
      ),
    ).rejects.toThrow();
    expect(await readdir(f.store.directory)).toContain('terraform-admission.json');
    expect(f.counts().retirements).toBe(0);
    expect(await readdir(f.store.directory)).not.toContain('aws-terraform-terminal-cleanup.json');
  }
});

test('public owning teardown dispatcher resumes terminal cleanup without normal cloud source journals', async () => {
  const f = await fixture('interrupt');
  await expect(
    finalizeAwsTerraformCleanup(
      f.base,
      f.teardown,
      f.teardown.planSha256,
      f.runtime as never,
      f.contract as never,
      f.session as never,
      f.store,
      f.api,
      {},
    ),
  ).rejects.toThrow('interrupted');
  await f.store.remove('terraform-cloud-teardown.json');
  const { runAwsTerraformTeardown } = await import('../../src/ce/terraform-teardown');
  const result = await runAwsTerraformTeardown(
    f.base,
    f.teardown as never,
    f.teardown.planSha256,
    f.runtime as never,
    f.contract as never,
    f.session as never,
    f.store,
    f.api,
    {},
  );
  expect(result.status).toBe('deployment-artifacts-retired');
  expect(f.counts().plans).toBe(1);
});

test('terminal cleanup refuses F5 bookkeeping without its owning stage before checkpoint or root retirement', async () => {
  const f = await fixture();
  await f.store.write('terraform-f5-resources.json', {
    schemaVersion: 1,
    owner: f.store.owner,
    resources: {},
    configurationSha256: 'd'.repeat(64),
  });
  await expect(
    finalizeAwsTerraformCleanup(
      f.base,
      f.teardown,
      f.teardown.planSha256,
      f.runtime as never,
      f.contract as never,
      f.session as never,
      f.store,
      f.api,
      {},
    ),
  ).rejects.toThrow('stage');
  expect(f.counts().retirements).toBe(0);
  await expect(f.store.read('aws-terraform-terminal-cleanup.json')).rejects.toThrow();
});
