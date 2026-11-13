import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { independentRetirementFixture } from '../../../terraform/test/fixtures/independent-retirement';
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
function observationGate() {
  let release: () => void = () => {
    throw Error('Observation gate not initialized');
  };
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release: () => release() };
}
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
    metadata: [
      {
        type: 'aws_vpc',
        id: 'vpc-12345678',
        address: 'aws_vpc.ce',
        tags: Object.entries({
          'xcsh-managed-by': 'aws-ce',
          'xcsh-execution-engine': 'terraform',
          'xcsh-deployment-id': base.deploymentName,
          'xcsh-plan-sha256': base.planSha256,
        })
          .map(([Key, Value]) => ({ Key, Value }))
          .sort((a, b) => a.Key.localeCompare(b.Key)),
      },
    ],
    tgwEdges: [],
  };
  await store.write('terraform-cloud-teardown-inventory.json', {
    ...inventoryMaterial,
    sha256: canonicalSha256(inventoryMaterial),
  });
  let metadataTags = mode === 'metadata' ? structuredClone(inventoryMaterial.metadata[0].tags) : [];
  let metadataMutations = 0;
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
      if (mode === 'metadata') expect(metadataTags).toEqual([]);
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
          ...independentRetirementFixture({
            manifestSha256: canonicalSha256(manifest),
            evidenceSha256: evidence,
            finalPlanSha256: receipt.planSha256,
            planReceiptSha256: hash(JSON.stringify(receipt)),
          }),
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
      const input = args.includes('--cli-input-json')
        ? JSON.parse(args[args.indexOf('--cli-input-json') + 1])
        : { Filters: [] };
      if (op === 'delete-tags') {
        const intent = (await store.read('aws-terraform-metadata-retirement.json')) as {
          pending: { id: string; tags: unknown[] };
        };
        expect(intent.pending.id).toBe('vpc-12345678');
        expect(intent.pending.tags).toEqual(input.Tags);
        expect(input.Resources).toEqual(['vpc-12345678']);
        metadataMutations++;
        metadataTags = metadataTags.filter(
          (tag) =>
            !input.Tags.some(
              (target: { Key: string; Value: string }) => target.Key === tag.Key && target.Value === tag.Value,
            ),
        );
      }
      return {
        exitCode: mode === 'unauthorized' ? 1 : 0,
        stderr: mode === 'unauthorized' ? 'UnauthorizedOperation' : '',
        stdout: JSON.stringify(
          op === 'get-caller-identity'
            ? { Account: base.accountId }
            : op === 'describe-tags'
              ? {
                  Tags: metadataTags
                    .filter(
                      (tag) =>
                        !input.Filters.some((filter: { Name: string }) => filter.Name === 'key') ||
                        tag.Key === 'xcsh-deployment-id',
                    )
                    .map((tag) => ({ ...tag, ResourceId: 'vpc-12345678', ResourceType: 'vpc' })),
                }
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
    counts: () => ({ plans, retirements, observations, namespaces, metadataMutations }),
  };
}
test('independent cleanup absence probes begin together before the platform response', async () => {
  const f = await fixture();
  const entered = observationGate(),
    platformGate = observationGate();
  const platform = f.runtime.unregisteredAbsence,
    cloud = f.api.exec;
  let first = true,
    cloudStarted = false;
  f.runtime.unregisteredAbsence = async (bindings, namespaces) => {
    if (first) {
      first = false;
      entered.release();
      await platformGate.promise;
    }
    return platform(bindings, namespaces);
  };
  f.api.exec = async (command, args) => {
    cloudStarted = true;
    return cloud(command, args);
  };
  const pending = finalizeAwsTerraformCleanup(
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
  const outcome = pending.then(
    (value) => ({ value }),
    (error) => ({ error }),
  );
  await entered.promise;
  await Promise.resolve();
  await Promise.resolve();
  const startedBeforePlatformResponse = cloudStarted;
  platformGate.release();
  const result = await outcome;
  if ('error' in result) throw result.error;
  expect(startedBeforePlatformResponse).toBe(true);
  expect(result.value.status).toBe('deployment-artifacts-retired');
});
test('a failed platform collection waits for its cloud probe and preserves source journals', async () => {
  const f = await fixture();
  const entered = observationGate(),
    cloudGate = observationGate();
  const cloud = f.api.exec,
    failure = Error('platform collection unavailable');
  let cloudStarted = false,
    settled = false;
  f.runtime.unregisteredAbsence = async () => {
    entered.release();
    throw failure;
  };
  f.api.exec = async (command, args) => {
    cloudStarted = true;
    await cloudGate.promise;
    return cloud(command, args);
  };
  const pending = finalizeAwsTerraformCleanup(
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
  const outcome = pending.then(
    (value) => {
      settled = true;
      return { value };
    },
    (error) => {
      settled = true;
      return { error };
    },
  );
  await entered.promise;
  await Promise.resolve();
  await Promise.resolve();
  const beforeRelease = { cloudStarted, settled };
  cloudGate.release();
  const result = await outcome;
  expect(beforeRelease).toEqual({ cloudStarted: true, settled: false });
  expect('error' in result && result.error).toBe(failure);
  expect(f.counts().retirements).toBe(0);
  expect(await readdir(f.store.directory)).toContain('terraform-admission.json');
  expect(await readdir(f.store.directory)).not.toContain('aws-terraform-terminal-cleanup.json');
});
test('public terminal cleanup retires retained exact metadata before runner/parent artifacts and replays without another deletion', async () => {
  const f = await fixture('metadata');
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
    );
  expect((await run()).status).toBe('deployment-artifacts-retired');
  expect(f.counts().metadataMutations).toBe(1);
  expect(await f.store.read('aws-terraform-metadata-retirement.json')).toMatchObject({
    phase: 'retired',
    pending: null,
    completed: ['vpc-12345678'],
  });
  expect((await run()).status).toBe('deployment-artifacts-retired');
  expect(f.counts().metadataMutations).toBe(1);
  expect(f.counts().retirements).toBe(1);
});
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
  expect(f.counts().retirements).toBe(1);
});
test('completed parent resume verifies current absence and recorded inventory without reopening retired runners', async () => {
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
    );
  await run();
  f.session.retireArtifacts = async () => {
    throw Error('retired runner must remain closed');
  };
  expect((await run()).status).toBe('deployment-artifacts-retired');
  const marker = (await f.store.read('aws-terraform-parent-artifact-retirement.json')) as Record<string, unknown>;
  await f.store.write('aws-terraform-parent-artifact-retirement.json', { ...marker, evidenceSha256: '0'.repeat(64) });
  await expect(run()).rejects.toThrow('checkpoint differs');
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

test('an upgrade-shaped directory alone remains unqualified and cannot retire the root', async () => {
  const f = await fixture();
  await mkdir(join(f.store.directory, `terraform-stages/upgrade-software-${'a'.repeat(24)}`), {
    recursive: true,
    mode: 0o700,
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
  ).rejects.toThrow();
  expect(f.counts().retirements).toBe(0);
});
