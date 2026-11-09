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
  return { root, dir, lock, recovery, execute, calls, checks: () => checks };
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
