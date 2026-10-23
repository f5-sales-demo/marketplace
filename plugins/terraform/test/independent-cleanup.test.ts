import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  encode,
  executableIdentity,
  hash,
  inputDigests,
  inspectEmptyPlan,
  inspectEmptyState,
} from '../src/cleanup-verifier-worker';
import { cleanupRequest, executeIndependentCleanup, validateIndependentCleanup } from '../src/independent-cleanup';
import { TerraformRunner } from '../src/runner';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
const version = '1.16.5';
const state = { format_version: '1.0', terraform_version: version, values: { root_module: {} } };
const plan = {
  format_version: '1.2',
  terraform_version: version,
  errored: false,
  complete: true,
  applyable: false, // codespell:ignore applyable
  planned_values: { root_module: {} },
};

test('separate verifier accepts only complete empty original state and ordinary final plan', () => {
  expect(() => inspectEmptyState(state, version)).not.toThrow();
  expect(() => inspectEmptyPlan(plan, version)).not.toThrow();
});
for (const [name, override] of [
  ['missing values', { values: undefined }],
  ['output', { values: { outputs: { retained: {} } } }],
  ['resource', { values: { root_module: { resources: [{}] } } }],
  ['partial module', { values: { root_module: { child_modules: 'unknown' } } }],
  ['wrong version', { terraform_version: '1.0.0' }],
  ['wrong format', { format_version: null }],
] as const)
  test(`independent state rejects ${name}`, () => {
    expect(() => inspectEmptyState({ ...state, ...override }, version)).toThrow();
  });
for (const [name, override] of [
  ['incomplete', { complete: false }],
  ['errored', { errored: true }],
  ['action', { action_invocations: [{}] }],
  ['deferred', { deferred_changes: [{}] }],
  ['resource change', { resource_changes: [{}] }],
  ['output change', { output_changes: { retained: {} } }],
  ['planned resource', { planned_values: { root_module: { resources: [{}] } } }],
  ['prior resource', { prior_state: { values: { root_module: { resources: [{}] } } } }],
  ['missing values', { planned_values: undefined }],
  ['wrong version', { terraform_version: '1.0.0' }],
] as const)
  test(`independent plan rejects ${name}`, () => {
    expect(() => inspectEmptyPlan({ ...plan, ...override }, version)).toThrow();
  });
test('original input inventory binds present bytes and missing local state', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cleanup-inputs-'));
  roots.push(root);
  for (const name of [
    'main.tf.json',
    '.terraform.lock.hcl',
    'deployment.tfrc',
    'deployment.json',
    'plan-receipt.json',
    'saved.tfplan',
  ])
    await writeFile(join(root, name), name, { mode: 0o600 });
  const before = await inputDigests(root);
  expect(before['terraform.tfstate']).toBeNull();
  await writeFile(join(root, 'terraform.tfstate'), 'original', { mode: 0o600 });
  expect((await inputDigests(root))['terraform.tfstate']).toBe(createHash('sha256').update('original').digest('hex'));
  await writeFile(join(root, 'saved.tfplan'), 'changed', { mode: 0o600 });
  expect(await inputDigests(root)).not.toEqual(before);
  expect(await readFile(join(root, 'main.tf.json'), 'utf8')).toBe('main.tf.json');
});
test('missing, malformed and replayed independent response cannot authorize deletion', () => {
  for (const response of [undefined, {}, { schemaVersion: 1, status: 'verified', nonce: 'old' }])
    expect(() => validateIndependentCleanup(response, {} as never)).toThrow();
});

test.skipIf(!Bun.which('terraform'))(
  'actual separate Terraform process verifies original local workspace before sensitive retirement',
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'cleanup-real-'));
    roots.push(root);
    const runner = new TerraformRunner(root);
    await runner.prepare({
      schemaVersion: 1,
      deploymentId: 'local-cleanup',
      engine: 'terraform',
      scope: { cloud: 'aws', account: 'example-account', region: 'us-east-1' },
      terraformVersion: '1.16.5',
      configuration: '{"terraform":{"required_version":"= 1.16.5"}}',
      providerLock: '# no external providers',
      backendIdentity: 'local:local-cleanup',
    });
    const receipt = await runner.plan({ ...process.env });
    const result = await runner.retireArtifacts(receipt, 'a'.repeat(64), { ...process.env });
    expect(result.status).toBe('runner-artifacts-retired');
    const marker = JSON.parse(await readFile(join(root, 'local-cleanup', 'artifact-retirement.json'), 'utf8'));
    expect(marker.independentCleanup.executorPid).not.toBe(process.pid);
    expect(marker.independentCleanup.terraformVersion).toBe('1.16.5');
    expect(marker.independentCleanup.commands.some((args: string[]) => args.includes('-refresh=true'))).toBe(true);
  },
  30000,
);

test.skipIf(!Bun.which('terraform'))(
  'actual original previously applied state is empty and retired only after separate execution',
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'cleanup-applied-'));
    roots.push(root);
    const runner = new TerraformRunner(root);
    const empty = '{"terraform":{"required_version":"= 1.16.5"}}';
    await runner.prepare({
      schemaVersion: 1,
      deploymentId: 'local-applied',
      engine: 'terraform',
      scope: { cloud: 'aws', account: 'example-account', region: 'us-east-1' },
      terraformVersion: '1.16.5',
      configuration:
        '{"terraform":{"required_version":"= 1.16.5"},"resource":{"terraform_data":{"fixture":{"input":"SYNTHETIC_PRIVATE_STAGING"}}}}',
      providerLock: '# no external providers',
      backendIdentity: 'local:local-applied',
    });
    const env = { ...process.env };
    const created = await runner.plan(env);
    await runner.apply(created, env);
    await runner.reviseConfiguration(created.configurationSha256, empty);
    const destroyed = await runner.plan(env);
    await runner.apply(destroyed, env);
    const receipt = await runner.plan(env);
    const original = JSON.parse(await readFile(join(root, 'local-applied', 'terraform.tfstate'), 'utf8'));
    expect(original.resources).toEqual([]);
    const result = await runner.retireArtifacts(receipt, 'a'.repeat(64), env);
    expect(result.status).toBe('runner-artifacts-retired');
    const marker = JSON.parse(await readFile(join(root, 'local-applied', 'artifact-retirement.json'), 'utf8'));
    expect(marker.independentCleanup.executorPid).not.toBe(process.pid);
    expect(JSON.stringify(marker.independentCleanup)).not.toContain('SYNTHETIC_PRIVATE_STAGING');
  },
  60000,
);

async function hangingRequest() {
  const root = await mkdtemp(join(tmpdir(), 'cleanup-hang-'));
  roots.push(root);
  const executable = join(root, 'terraform');
  await writeFile(
    executable,
    '#!/bin/sh\ntrap "" TERM\nprintf "%s\\n" "$$" > hang.pid\n/bin/sleep 60 &\nprintf "%s\\n" "$!" >> hang.pid\nwait\n',
    { mode: 0o700 },
  );
  const terraform = await executableIdentity(executable);
  const config = '{"terraform":{"required_version":"= 1.16.5"}}',
    lock = '# synthetic';
  const manifest = {
    schemaVersion: 1,
    engine: 'terraform',
    deploymentId: 'hang-test',
    backendIdentity: 'local:hang-test',
    terraformVersion: version,
    configurationSha256: hash(config),
    providerLockSha256: hash(lock),
  };
  const receipt = {
    schemaVersion: 1,
    engine: 'terraform',
    deploymentId: manifest.deploymentId,
    backendIdentity: manifest.backendIdentity,
    configurationSha256: manifest.configurationSha256,
    providerLockSha256: manifest.providerLockSha256,
    planSha256: hash('synthetic-plan'),
    noChanges: true,
    changes: [],
  };
  const files = {
    'main.tf.json': config,
    '.terraform.lock.hcl': lock,
    'deployment.tfrc': 'synthetic config',
    'deployment.json': JSON.stringify(manifest),
    'saved.tfplan': 'synthetic-plan',
    'plan-receipt.json': JSON.stringify({
      state: 'planned',
      receipt,
      execution: {
        terraform,
        planArgs: ['plan', '-input=false', '-lock=true', '-lock-timeout=60s', '-refresh=true', '-out=saved.tfplan'],
      },
    }),
  };
  for (const [name, bytes] of Object.entries(files)) await writeFile(join(root, name), bytes, { mode: 0o600 });
  return {
    root,
    request: await cleanupRequest(root, {
      manifestSha256: hash(encode(manifest)),
      evidenceSha256: 'a'.repeat(64),
      finalPlanSha256: receipt.planSha256,
      planReceiptSha256: hash(encode(receipt)),
      terraform,
    }),
  };
}
async function assertNoLiveDescendants(root: string) {
  const pids = (await readFile(join(root, 'hang.pid'), 'utf8')).trim().split('\n');
  expect(pids).toHaveLength(2);
  for (const pid of pids) {
    const child = Bun.spawn(['/bin/ps', '-o', 'stat=', '-p', pid], { stdout: 'pipe', stderr: 'ignore' });
    const state = (await new Response(child.stdout).text()).trim();
    await child.exited;
    expect(state === '' || state.startsWith('Z')).toBe(true);
  }
}
test('separate verification deadline kills owned hanging executor and descendants', async () => {
  const { root, request } = await hangingRequest();
  request.deadline = new Date(Date.now() + 1500).toISOString();
  await expect(executeIndependentCleanup(request, { ...process.env })).rejects.toThrow('verification failed');
  await assertNoLiveDescendants(root);
  expect(await readFile(join(root, 'saved.tfplan'), 'utf8')).toBe('synthetic-plan');
}, 10000);
test('separate verification abort kills owned hanging executor and descendants', async () => {
  const { root, request } = await hangingRequest(),
    controller = new AbortController();
  const pending = executeIndependentCleanup(request, { ...process.env }, controller.signal);
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      if ((await readFile(join(root, 'hang.pid'), 'utf8')).trim().split('\n').length === 2) break;
    } catch {}
    await Bun.sleep(20);
  }
  controller.abort();
  await expect(pending).rejects.toThrow('verification failed');
  await assertNoLiveDescendants(root);
}, 10000);
