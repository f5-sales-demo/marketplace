import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { type CaptureCleanupRecovery, readCaptureCleanupAttemptResourceFields, TerraformRunner } from '../src/runner';

const hash = (raw: string | Uint8Array) => createHash('sha256').update(raw).digest('hex');

async function inspectionFixture() {
  const f = await fixture();
  const manifest = JSON.parse(await readFile(join(f.dir, 'deployment.json'), 'utf8'));
  const plan = Buffer.from('original-private-plan-fixture');
  const receipt = {
    schemaVersion: 1 as const,
    deploymentId: manifest.deploymentId,
    engine: 'terraform' as const,
    backendIdentity: manifest.backendIdentity,
    configurationSha256: manifest.configurationSha256,
    providerLockSha256: manifest.providerLockSha256,
    planSha256: hash(plan),
    noChanges: false,
    changes: [{ address: 'terraform_data.one', type: 'terraform_data', actions: ['create'] }],
  };
  await writeFile(join(f.dir, 'saved.tfplan'), plan, { mode: 0o600 });
  await writeFile(join(f.dir, 'plan-receipt.json'), JSON.stringify({ state: 'applying', receipt }), { mode: 0o600 });
  const names = [
    'deployment.json',
    'main.tf.json',
    '.terraform.lock.hcl',
    'deployment.tfrc',
    'terraform.tfstate',
    'plan-receipt.json',
    'saved.tfplan',
  ];
  const inputs = Object.fromEntries(
    await Promise.all(names.map(async (name) => [name, await f.binding(join(f.dir, name))])),
  );
  for (const [name, binding] of Object.entries(f.recovery.retainedLockInputs)) inputs[`lock:${name}`] = binding;
  let checks = 0;
  const rendered = {
    format_version: '1.0',
    terraform_version: manifest.terraformVersion,
    values: {
      root_module: {
        resources: [
          {
            address: 'terraform_data.one',
            mode: 'managed',
            type: 'terraform_data',
            values: { id: 'example-owned-id', secret: 'private-example-content' },
            sensitive_values: { secret: true },
          },
        ],
      },
    },
  };
  const input = {
    directory: f.dir,
    inputs,
    receipt,
    selections: { 'terraform_data.one': ['id'] },
    environment: {},
    assertIndependentClosure: async () => {
      checks++;
    },
    execute: async (request: { cwd: string; args: string[] }) => {
      f.calls.push(request.args);
      expect(request.cwd).toBe(f.dir);
      return {
        code: 0,
        stdout: JSON.stringify(
          request.args[0] === 'version' ? { terraform_version: manifest.terraformVersion } : rendered,
        ),
      };
    },
  };
  return { ...f, input, rendered, checks: () => checks };
}

test('independent capture cleanup inspection reads original ownership without reclaiming the failed executor or submitting writes', async () => {
  const f = await inspectionFixture();
  const failed = await readFile(join(f.lock, 'capture-unresolved.json'));
  const result = await readCaptureCleanupAttemptResourceFields(f.input);
  expect(result.applyState).toBe('applying');
  expect(result.resources).toEqual({ 'terraform_data.one': { id: 'example-owned-id' } });
  expect(result.stateSha256).toBe(f.recovery.state.sha256);
  expect(f.calls.map((args) => args[0])).toEqual(['version', 'show']);
  expect(f.checks()).toBeGreaterThan(1);
  expect(JSON.stringify(result)).not.toContain('private-example-content');
  expect(await readFile(join(f.lock, 'capture-unresolved.json'))).toEqual(failed);
});

for (const mode of ['state-change', 'plan-replacement', 'planned-checkpoint', 'reader-live'] as const)
  test(`independent cleanup inspection refuses before any executor read: ${mode}`, async () => {
    const f = await inspectionFixture();
    if (mode === 'state-change') await writeFile(join(f.dir, 'terraform.tfstate'), '{}', { mode: 0o600 });
    if (mode === 'plan-replacement') {
      const path = join(f.dir, 'saved.tfplan'),
        raw = await readFile(path);
      await rename(path, `${path}.original`);
      await writeFile(path, raw, { mode: 0o600 });
    }
    if (mode === 'planned-checkpoint') {
      const path = join(f.dir, 'plan-receipt.json');
      await writeFile(path, JSON.stringify({ state: 'planned', receipt: f.input.receipt }), { mode: 0o600 });
      f.input.inputs['plan-receipt.json'] = await f.binding(path);
    }
    if (mode === 'reader-live')
      f.input.assertIndependentClosure = async () => {
        throw new Error('Original reader remains live');
      };
    await expect(readCaptureCleanupAttemptResourceFields(f.input)).rejects.toThrow();
    expect(f.calls).toHaveLength(0);
    expect(await Bun.file(join(f.lock, 'capture-unresolved.json')).exists()).toBe(true);
  });

test('independent cleanup inspection refuses sensitive ownership fields without exposing raw state', async () => {
  const f = await inspectionFixture();
  Object.assign(f.rendered.values.root_module.resources[0].sensitive_values, { id: true });
  await expect(readCaptureCleanupAttemptResourceFields(f.input)).rejects.toThrow();
  expect(await Bun.file(join(f.lock, 'capture-unresolved.json')).exists()).toBe(true);
});

test('independent cleanup inspection permits an empty original state as evidence without deletion authority', async () => {
  const f = await inspectionFixture();
  const path = join(f.dir, 'terraform.tfstate');
  const state = {
    version: 4,
    terraform_version: '1.16.6',
    lineage: 'example-lineage',
    serial: 2,
    resources: [],
    outputs: {},
  };
  await writeFile(path, JSON.stringify(state), { mode: 0o600 });
  f.input.inputs['terraform.tfstate'] = await f.binding(path);
  f.input.execute = async (request) => {
    f.calls.push(request.args);
    return {
      code: 0,
      stdout: JSON.stringify(
        request.args[0] === 'version' ? { terraform_version: '1.16.6' } : { format_version: '1.0' },
      ),
    };
  };
  const result = await readCaptureCleanupAttemptResourceFields(f.input);
  expect(result.resources).toEqual({ 'terraform_data.one': null });
  expect(result.serial).toBe(2);
  expect(f.calls.map((args) => args[0])).toEqual(['version', 'show']);
  expect(await Bun.file(join(f.lock, 'capture-unresolved.json')).exists()).toBe(true);
});

test('independent cleanup inspection rejects state replacement during the rendered state read', async () => {
  const f = await inspectionFixture();
  const execute = f.input.execute;
  f.input.execute = async (request) => {
    const result = await execute(request);
    if (request.args[0] === 'show') {
      const path = join(f.dir, 'terraform.tfstate'),
        raw = await readFile(path);
      await rename(path, `${path}.original`);
      await writeFile(path, raw, { mode: 0o600 });
    }
    return result;
  };
  await expect(readCaptureCleanupAttemptResourceFields(f.input)).rejects.toThrow();
  expect(f.calls.map((args) => args[0])).toEqual(['version', 'show']);
  expect(await Bun.file(join(f.lock, 'capture-unresolved.json')).exists()).toBe(true);
});

test('independent cleanup inspection requires every original failed-lock binding before executor access', async () => {
  const f = await inspectionFixture();
  delete f.input.inputs['lock:lifetime.json'];
  await expect(readCaptureCleanupAttemptResourceFields(f.input)).rejects.toThrow();
  expect(f.calls).toHaveLength(0);
});
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

async function originalEmptyFixture() {
  const f = await inspectionFixture();
  const state = {
    version: 4,
    terraform_version: '1.16.6',
    lineage: 'example-lineage',
    serial: 1,
    resources: [],
    outputs: {},
  };
  const raw = JSON.stringify(state);
  await writeFile(join(f.dir, 'terraform.tfstate'), raw, { mode: 0o600 });
  const folder = join(f.dir, 'capture-cleanup-verification', 'original-empty');
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const checkpointPath = join(folder, 'original-empty-create.private.json');
  const planPath = join(folder, 'saved-create.tfplan');
  await writeFile(checkpointPath, await readFile(join(f.dir, 'plan-receipt.json')), { mode: 0o400 });
  await writeFile(planPath, await readFile(join(f.dir, 'saved.tfplan')), { mode: 0o400 });
  const emptyOriginal = {
    schemaVersion: 1 as const,
    kind: 'original-empty-create-state-verification' as const,
    checkpoint: await f.binding(checkpointPath),
    savedPlan: await f.binding(planPath),
    receipt: f.input.receipt,
  };
  const recovery = {
    ...f.recovery,
    resources: [],
    state: { sha256: hash(raw), lineage: state.lineage, serial: state.serial },
    emptyOriginal,
  };
  return { ...f, recovery, checkpointPath, planPath };
}

test('original empty capture cleanup admits only read-only recovery and preserves its failed lock', async () => {
  const f = await originalEmptyFixture();
  const runner = new TerraformRunner(f.root, f.execute, f.recovery);
  await runner.resume('cleanup-fixture');
  expect(f.calls).toHaveLength(0);
  await expect(runner.apply(f.input.receipt, {})).rejects.toThrow();
  await expect(runner.plan({})).rejects.toThrow('cleanup');
  expect(f.calls).toHaveLength(0);
  expect(await Bun.file(join(f.lock, 'capture-unresolved.json')).exists()).toBe(true);
});

for (const mode of ['missing-proof', 'planned', 'foreign-owner', 'replaced-plan', 'unexpected-resources'] as const)
  test(`original empty capture cleanup refuses invalid review bindings: ${mode}`, async () => {
    const f = await originalEmptyFixture();
    if (mode === 'missing-proof') Object.assign(f.recovery, { emptyOriginal: undefined });
    if (mode === 'planned' || mode === 'foreign-owner') {
      const row = JSON.parse(await readFile(f.checkpointPath, 'utf8'));
      if (mode === 'planned') row.state = 'planned';
      else row.receipt.deploymentId = 'foreign';
      const wrongPath = join(dirname(f.checkpointPath), `wrong-${mode}.private.json`);
      await writeFile(wrongPath, JSON.stringify(row), { mode: 0o400, flag: 'wx' });
      f.recovery.emptyOriginal.checkpoint = await f.binding(wrongPath);
    }
    if (mode === 'replaced-plan') {
      const raw = await readFile(f.planPath);
      await rename(f.planPath, `${f.planPath}.original`);
      await writeFile(f.planPath, raw, { mode: 0o400 });
    }
    if (mode === 'unexpected-resources') {
      await writeFile(
        join(f.dir, 'terraform.tfstate'),
        JSON.stringify({
          version: 4,
          lineage: 'example-lineage',
          serial: 1,
          resources: [
            {
              mode: 'managed',
              type: 'terraform_data',
              name: 'foreign',
              instances: [{ attributes: { id: 'foreign' } }],
            },
          ],
          outputs: {},
        }),
        { mode: 0o600 },
      );
    }
    await expect(
      (async () => new TerraformRunner(f.root, f.execute, f.recovery).resume('cleanup-fixture'))(),
    ).rejects.toThrow();
    expect(f.calls).toHaveLength(0);
  });

test('original empty cleanup resumes twice behind a stable empty destroy without changing the original serial', async () => {
  const f = await originalEmptyFixture();
  const manifest = JSON.parse(await readFile(join(f.dir, 'deployment.json'), 'utf8'));
  const plan = Buffer.from('stable-empty-destroy-fixture');
  const receipt = {
    schemaVersion: 1,
    deploymentId: 'cleanup-fixture',
    engine: 'terraform',
    backendIdentity: manifest.backendIdentity,
    configurationSha256: manifest.configurationSha256,
    providerLockSha256: manifest.providerLockSha256,
    planSha256: hash(plan),
    operation: 'destroy',
    noChanges: true,
    changes: [],
  };
  await writeFile(join(f.dir, 'saved.tfplan'), plan, { mode: 0o600 });
  await writeFile(join(f.dir, 'plan-receipt.json'), JSON.stringify({ state: 'planned', receipt }), { mode: 0o600 });
  const failed = await readFile(join(f.lock, 'capture-unresolved.json'));
  const runner = new TerraformRunner(f.root, f.execute, f.recovery);
  for (let n = 0; n < 2; n++) {
    const result = await runner.resumeCompletedCleanupReadOnly('cleanup-fixture');
    expect(result.stateSerial).toBe(1);
    expect(result.executorSubmissions).toBe(0);
  }
  expect(f.calls).toHaveLength(0);
  expect(await readFile(join(f.lock, 'capture-unresolved.json'))).toEqual(failed);
});

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

async function reviewedInspectionFixture() {
  const f = await inspectionFixture();
  const data = {
    address: 'data.google_compute_image.observer',
    mode: 'data',
    type: 'google_compute_image',
    name: 'observer',
    provider_name: 'registry.terraform.io/hashicorp/google',
    schema_version: 0,
    values: {
      project: 'ubuntu-os-cloud',
      name: 'ubuntu-2404-noble-amd64-v20261021',
      image_id: '4996011480491275419',
      id: 'projects/ubuntu-os-cloud/global/images/ubuntu-2404-noble-amd64-v20261021',
    },
    sensitive_values: {},
  };
  const configuration = JSON.stringify({
    data: { google_compute_image: { observer: { project: data.values.project, name: data.values.name } } },
  });
  await writeFile(join(f.dir, 'main.tf.json'), configuration, { mode: 0o600 });
  const manifest = JSON.parse(await readFile(join(f.dir, 'deployment.json'), 'utf8'));
  manifest.configurationSha256 = hash(configuration);
  await writeFile(join(f.dir, 'deployment.json'), JSON.stringify(manifest), { mode: 0o600 });
  f.input.receipt.configurationSha256 = manifest.configurationSha256;
  await writeFile(join(f.dir, 'plan-receipt.json'), JSON.stringify({ state: 'applying', receipt: f.input.receipt }), {
    mode: 0o600,
  });
  const raw = JSON.parse(await readFile(join(f.dir, 'terraform.tfstate'), 'utf8'));
  raw.resources.push({
    mode: 'data',
    type: data.type,
    name: data.name,
    provider: 'provider["registry.terraform.io/hashicorp/google"]',
    instances: [{ schema_version: 0, attributes: data.values, sensitive_attributes: [] }],
  });
  await writeFile(join(f.dir, 'terraform.tfstate'), JSON.stringify(raw), { mode: 0o600 });
  for (const name of ['main.tf.json', 'deployment.json', 'plan-receipt.json', 'terraform.tfstate'])
    f.input.inputs[name] = await f.binding(join(f.dir, name));
  const rendered = {
    ...f.rendered,
    values: { root_module: { resources: [...f.rendered.values.root_module.resources, data] } },
  };
  const plan = { format_version: '1.2', terraform_version: manifest.terraformVersion, planned_values: rendered.values };
  f.input.execute = async (request) => {
    f.calls.push(request.args);
    return {
      code: 0,
      stdout: JSON.stringify(
        request.args[0] === 'version'
          ? { terraform_version: manifest.terraformVersion }
          : request.args[2] === 'saved.tfplan'
            ? plan
            : rendered,
      ),
    };
  };
  return { ...f, plan, originalRaw: JSON.stringify(raw) };
}

test('original interrupted reader joins declared data to its saved plan while preserving failed locks', async () => {
  const f = await reviewedInspectionFixture();
  const failed = await readFile(join(f.lock, 'capture-unresolved.json'));
  const result = await readCaptureCleanupAttemptResourceFields(f.input);
  expect(result.resources).toEqual({ 'terraform_data.one': { id: 'example-owned-id' } });
  expect(f.calls).toEqual([
    ['version', '-json'],
    ['show', '-json', 'terraform.tfstate'],
    ['show', '-json', 'saved.tfplan'],
  ]);
  expect(await readFile(join(f.lock, 'capture-unresolved.json'))).toEqual(failed);
  expect(await readFile(join(f.dir, 'terraform.tfstate'), 'utf8')).toBe(f.originalRaw);
});

for (const mode of ['wrong-image', 'wrong-plan-version', 'plan-replaced', 'state-replaced', 'closure-changed'] as const)
  test(`locked image inspection refuses ${mode} without reclaiming original locks`, async () => {
    const f = await reviewedInspectionFixture();
    const originalExecute = f.input.execute;
    const failed = await readFile(join(f.lock, 'capture-unresolved.json'));
    f.input.execute = async (request) => {
      const result = await originalExecute(request);
      if (request.args[2] === 'saved.tfplan') {
        if (mode === 'wrong-image') {
          const plan = JSON.parse(result.stdout);
          plan.planned_values.root_module.resources[1].values.image_id = '123';
          return { ...result, stdout: JSON.stringify(plan) };
        }
        if (mode === 'wrong-plan-version')
          return { ...result, stdout: JSON.stringify({ ...f.plan, terraform_version: '0.0.0' }) };
        if (mode === 'plan-replaced' || mode === 'state-replaced') {
          const path = join(f.dir, mode === 'plan-replaced' ? 'saved.tfplan' : 'terraform.tfstate');
          const bytes = await readFile(path);
          await rename(path, `${path}.original`);
          await writeFile(path, bytes, { mode: 0o600 });
        }
        if (mode === 'closure-changed')
          f.input.assertIndependentClosure = async () => {
            throw new Error('Foreign closure');
          };
      }
      return result;
    };
    // The inspection snapshots this closure function, so model a changed closure
    // through its captured implementation rather than replacing the method.
    if (mode === 'closure-changed')
      f.input.assertIndependentClosure = async () => {
        if (f.calls.some((call) => call[2] === 'saved.tfplan')) throw new Error('Foreign closure');
      };
    await expect(readCaptureCleanupAttemptResourceFields(f.input)).rejects.toThrow();
    expect(f.calls.map((call) => call[0])).toEqual(['version', 'show', 'show']);
    expect(await readFile(join(f.lock, 'capture-unresolved.json'))).toEqual(failed);
  });
