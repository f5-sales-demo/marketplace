import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { type CaptureCleanupRecovery, TerraformRunner } from '../src/runner';

const hash = (raw: string | Uint8Array) => createHash('sha256').update(raw).digest('hex');
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'ce-capture-cleanup-'));
  const dir = join(root, 'cleanup-fixture');
  const run = new TerraformRunner(root, async () => ({ code: 0, stdout: '' }));
  await run.prepare({
    schemaVersion: 1,
    deploymentId: 'cleanup-fixture',
    engine: 'terraform',
    scope: { cloud: 'gcp', account: 'example-project', region: 'us-central1' },
    terraformVersion: '1.16.6',
    configuration: '{}',
    providerLock: '# fixture',
    backendIdentity: 'local:cleanup-fixture',
  });
  const state = {
    version: 4,
    lineage: 'example-lineage',
    serial: 1,
    resources: [
      { mode: 'managed', type: 'terraform_data', name: 'one', instances: [{ attributes: { id: 'example-owned-id' } }] },
    ],
  };
  const raw = JSON.stringify(state);
  await writeFile(join(dir, 'terraform.tfstate'), raw, { mode: 0o600 });
  const lock = join(dir, '.terraform-executor-lock');
  await mkdir(lock, { mode: 0o700 });
  const claim = {
    schemaVersion: 2,
    token: '11111111-1111-1111-1111-111111111111',
    pid: 999999999,
    group: 999999999,
    bootId: (await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim(),
    processStartTicks: '1',
  };
  for (const [name, mode, value] of [
    ['claim.json', 0o600, claim],
    ['lifetime.json', 0o400, claim],
    ['capture-unresolved.json', 0o400, { schemaVersion: 1 }],
  ] as const)
    await writeFile(join(lock, name), JSON.stringify(value), { mode });
  const binding = async (path: string) => {
    const file = await lstat(path, { bigint: true });
    const parent = await lstat(dirname(path), { bigint: true });
    return {
      path,
      sha256: hash(await readFile(path)),
      expectedIdentity: Object.fromEntries(
        ['dev', 'ino', 'uid', 'nlink', 'mode', 'size', 'mtimeNs', 'ctimeNs'].map((key) => [
          key,
          String(file[key as keyof typeof file]),
        ]),
      ) as Record<'dev' | 'ino' | 'uid' | 'nlink' | 'mode' | 'size' | 'mtimeNs' | 'ctimeNs', string>,
      expectedParentIdentity: {
        dev: String(parent.dev),
        ino: String(parent.ino),
        uid: String(parent.uid),
        mode: String(parent.mode),
      },
    };
  };
  const retainedLockInputs = Object.fromEntries(
    await Promise.all(
      ['claim.json', 'lifetime.json', 'capture-unresolved.json'].map(async (name) => [
        name,
        await binding(join(lock, name)),
      ]),
    ),
  );
  let checks = 0;
  const recovery: CaptureCleanupRecovery = {
    retainedLockInputs,
    deploymentId: 'cleanup-fixture',
    deploymentManifestSha256: hash(await readFile(join(dir, 'deployment.json'))),
    state: { sha256: hash(raw), lineage: state.lineage, serial: state.serial },
    resources: [{ address: 'terraform_data.one', id: 'example-owned-id' }],
    retainedLockSha256: Object.fromEntries(
      await Promise.all(
        ['claim.json', 'lifetime.json', 'capture-unresolved.json'].map(async (name) => [
          name,
          hash(await readFile(join(lock, name))),
        ]),
      ),
    ) as CaptureCleanupRecovery['retainedLockSha256'],
    assertIndependentClosure: async () => {
      checks++;
    },
  };
  const calls: string[][] = [];
  const execute = async (request: { args: string[] }) => {
    calls.push(request.args);
    return { code: 0, stdout: JSON.stringify({ terraform_version: '1.16.6' }) };
  };
  return { root, dir, lock, recovery, execute, calls, binding, checks: () => checks };
}

test('default resume retains the failed capture lock while reviewed cleanup has a separate closure gate', async () => {
  const f = await fixture();
  await expect(new TerraformRunner(f.root, f.execute).resume('cleanup-fixture')).rejects.toThrow(
    'capture closure remains unresolved',
  );
  const recovery = new TerraformRunner(f.root, f.execute, f.recovery);
  await recovery.resume('cleanup-fixture');
  expect(f.checks()).toBeGreaterThan(0);
  expect(await Bun.file(join(f.lock, 'capture-unresolved.json')).exists()).toBe(true);
});

test('cleanup recovery cannot plan creates or apply an original creation receipt', async () => {
  const f = await fixture();
  const runner = new TerraformRunner(f.root, f.execute, f.recovery);
  await runner.resume('cleanup-fixture');
  await expect(runner.plan({})).rejects.toThrow('cleanup');
  expect(f.calls).toHaveLength(0);
});

test('changed reviewed state or retained lock prevents cleanup recovery', async () => {
  const f = await fixture();
  await writeFile(join(f.dir, 'terraform.tfstate'), '{}', { mode: 0o600 });
  await expect(new TerraformRunner(f.root, f.execute, f.recovery).resume('cleanup-fixture')).rejects.toThrow('state');
  expect(f.calls).toHaveLength(0);
});

test('same-byte retained claim replacement cannot authorize cleanup', async () => {
  const f = await fixture();
  const path = join(f.lock, 'claim.json');
  const bytes = await readFile(path);
  await rename(path, join(f.lock, 'claim.original.private.json'));
  await writeFile(path, bytes, { mode: 0o600 });
  await expect(new TerraformRunner(f.root, f.execute, f.recovery).resume('cleanup-fixture')).rejects.toThrow();
  expect(f.calls).toHaveLength(0);
});

test('cleanup mode cannot change configuration or reconcile a creation receipt', async () => {
  const f = await fixture();
  const runner = new TerraformRunner(f.root, f.execute, f.recovery);
  await runner.resume('cleanup-fixture');
  await expect(runner.reviseConfiguration(hash('{}'), '{}')).rejects.toThrow('cleanup');
  expect(f.calls).toHaveLength(0);
});

async function completedCleanupFixture() {
  const f = await fixture();
  const empty = { version: 4, lineage: f.recovery.state.lineage, serial: f.recovery.state.serial + 1, resources: [] };
  await writeFile(join(f.dir, 'terraform.tfstate'), JSON.stringify(empty), { mode: 0o600 });
  const manifest = JSON.parse(await readFile(join(f.dir, 'deployment.json'), 'utf8'));
  const receipt = {
    schemaVersion: 1,
    deploymentId: manifest.deploymentId,
    engine: 'terraform',
    backendIdentity: manifest.backendIdentity,
    configurationSha256: manifest.configurationSha256,
    providerLockSha256: manifest.providerLockSha256,
    planSha256: 'a'.repeat(64),
    operation: 'destroy',
    changes: [{ address: 'terraform_data.one', type: 'terraform_data', actions: ['delete'] }],
    noChanges: false,
  };
  const directory = join(f.dir, 'capture-cleanup-verification');
  await mkdir(directory, { mode: 0o700 });
  const checkpointPath = join(directory, 'applied-destroy.private.json');
  await writeFile(checkpointPath, JSON.stringify({ state: 'applied', receipt }), { mode: 0o400 });
  const recovery = {
    ...f.recovery,
    verification: {
      schemaVersion: 1 as const,
      kind: 'applied-destroy-state-verification' as const,
      checkpoint: await f.binding(checkpointPath),
      state: { sha256: hash(JSON.stringify(empty)), lineage: empty.lineage, serial: empty.serial },
    },
  };
  return { ...f, recovery, checkpointPath, receipt };
}

test('completed cleanup verification resumes twice without submission and preserves the original failed lock', async () => {
  const f = await completedCleanupFixture();
  const before = await readFile(join(f.lock, 'capture-unresolved.json'));
  for (let i = 0; i < 2; i++) await new TerraformRunner(f.root, f.execute, f.recovery).resume('cleanup-fixture');
  expect(f.calls).toHaveLength(0);
  expect(await readFile(join(f.lock, 'capture-unresolved.json'))).toEqual(before);
});

test('verification after completed cleanup refuses every apply including the original destroy receipt', async () => {
  const f = await completedCleanupFixture();
  const runner = new TerraformRunner(f.root, f.execute, f.recovery);
  await runner.resume('cleanup-fixture');
  await expect(runner.apply(f.receipt as never, {})).rejects.toThrow('verification');
  await expect(runner.plan({})).rejects.toThrow('cleanup');
  expect(f.calls).toHaveLength(0);
});

test('cleanup verification requires the applied original destroy checkpoint and exact empty state', async () => {
  for (const change of [
    { state: 'applying' },
    { receipt: { operation: 'create' } },
    { receipt: { deploymentId: 'foreign' } },
  ]) {
    const f = await completedCleanupFixture();
    const source = JSON.parse(await readFile(f.checkpointPath, 'utf8'));
    const altered = { ...source, ...change, receipt: { ...source.receipt, ...(change.receipt ?? {}) } };
    const path = join(f.dir, 'capture-cleanup-verification', 'wrong.private.json');
    await writeFile(path, JSON.stringify(altered), { mode: 0o400 });
    const scope = { ...f.recovery, verification: { ...f.recovery.verification, checkpoint: await f.binding(path) } };
    await expect(new TerraformRunner(f.root, f.execute, scope).resume('cleanup-fixture')).rejects.toThrow();
    expect(f.calls).toHaveLength(0);
  }
});

test('same-byte applied-checkpoint replacement refuses verification before any command', async () => {
  const f = await completedCleanupFixture();
  const raw = await readFile(f.checkpointPath);
  await rename(f.checkpointPath, `${f.checkpointPath}.original`);
  await writeFile(f.checkpointPath, raw, { mode: 0o400 });
  await expect(new TerraformRunner(f.root, f.execute, f.recovery).resume('cleanup-fixture')).rejects.toThrow();
  expect(f.calls).toHaveLength(0);
});

test('completed cleanup read-only resume verifies empty state and plan without executor submission', async () => {
  const f = await fixture();
  const owner = JSON.parse(await readFile(join(f.dir, 'deployment.json'), 'utf8'));
  const state = JSON.stringify({
    version: 4,
    lineage: f.recovery.state.lineage,
    serial: f.recovery.state.serial + 1,
    resources: [],
  });
  await writeFile(join(f.dir, 'terraform.tfstate'), state, { mode: 0o600 });
  const plan = Buffer.from('example-verified-empty-plan');
  await writeFile(join(f.dir, 'saved.tfplan'), plan, { mode: 0o600 });
  await writeFile(
    join(f.dir, 'plan-receipt.json'),
    JSON.stringify({
      state: 'planned',
      receipt: {
        schemaVersion: 1,
        deploymentId: owner.deploymentId,
        engine: 'terraform',
        backendIdentity: owner.backendIdentity,
        configurationSha256: owner.configurationSha256,
        providerLockSha256: owner.providerLockSha256,
        planSha256: hash(plan),
        changes: [],
        noChanges: true,
        operation: 'destroy',
      },
    }),
    { mode: 0o600 },
  );
  const before = await readFile(join(f.lock, 'capture-unresolved.json'));
  for (let i = 0; i < 2; i++) {
    const runner = new TerraformRunner(f.root, f.execute, f.recovery);
    const snapshot = await runner.resumeCompletedCleanupReadOnly('cleanup-fixture');
    expect(snapshot.readOnly).toBe(true);
    expect(snapshot.stateSha256).toBe(hash(state));
    await expect(runner.planDestroy({})).rejects.toThrow();
  }
  expect(f.calls).toHaveLength(0);
  expect(await readFile(join(f.lock, 'capture-unresolved.json'))).toEqual(before);
});

test('read-only completed cleanup cannot admit owned resources that still remain', async () => {
  const f = await fixture();
  await expect(
    new TerraformRunner(f.root, f.execute, f.recovery).resumeCompletedCleanupReadOnly('cleanup-fixture'),
  ).rejects.toThrow();
  expect(f.calls).toHaveLength(0);
});
