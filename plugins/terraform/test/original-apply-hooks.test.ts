import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { linuxMonotonicMs } from '../src/linux-clock';
import type { OriginalExecutionOutput, OriginalOutputChunk } from '../src/original-output-stream';
import type { PlanReceipt } from '../src/runner';
import { type ExecutionCaptureAdmission, signalFreeTerraformExecutor } from '../src/signal-free-executor';
import * as hooks from '../src/terraform-apply-hooks';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
const hash = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const binding = {
  terraformVersion: '1.17.2',
  providerLockSha256: 'ddd3bbbad292cc08b82014de3060fcf800c02fb2113311c06f50720c1075d615',
};
const plan: PlanReceipt = {
  schemaVersion: 1,
  deploymentId: 'fixture',
  engine: 'terraform',
  backendIdentity: 'local:fixture',
  configurationSha256: hash('{}'),
  providerLockSha256: binding.providerLockSha256,
  planSha256: hash('saved-plan'),
  changes: [{ address: 'google_compute_instance.node', type: 'google_compute_instance', actions: ['create'] }],
  noChanges: false,
};
const resource = {
  addr: 'google_compute_instance.node',
  module: '',
  resource: 'google_compute_instance.node',
  implied_provider: 'google',
  resource_type: 'google_compute_instance',
  resource_name: 'node',
  resource_key: null,
};
const line = (type: string, fields: object = {}) =>
  `${JSON.stringify({
    '@level': 'info',
    '@message': 'synthetic UI',
    '@module': 'terraform.ui',
    '@timestamp': '2026-11-15T00:00:00Z',
    type,
    ...fields,
  })}\n`;
const version = line('version', { terraform: '1.17.2', ui: '1.3' });
const start = line('apply_start', { hook: { resource, action: 'create' } });
const complete = line('apply_complete', {
  hook: {
    resource,
    action: 'create',
    elapsed_seconds: 1,
    id_key: 'id',
    id_value: 'projects/example-project/zones/us-central1-a/instances/node',
  },
});

// Real descriptor/executor provenance; the emitted UI bytes are explicitly simulated.
async function withOutput(
  check: (
    output: OriginalExecutionOutput,
    stdout: OriginalOutputChunk[],
    stderr: OriginalOutputChunk[],
    admission: ExecutionCaptureAdmission,
  ) => Promise<void>,
) {
  const root = await mkdtemp(join(tmpdir(), 'owned-apply-hooks-'));
  roots.push(root);
  const python = await realpath(process.env.CE_TEST_PYTHON ?? Bun.which('python3') ?? '');
  const executable = { path: python, sha256: hash(await readFile(python)) };
  const script = join(root, 'synthetic-ui.py');
  const raw = Buffer.from(version + start + complete).toString('hex');
  await writeFile(
    script,
    `import sys\nsys.stdout.buffer.write(bytes.fromhex("${raw}"))\nsys.stderr.buffer.write(b"synthetic stderr\\n")\n`,
    { mode: 0o600 },
  );
  let admission: ExecutionCaptureAdmission | undefined;
  const clock = linuxMonotonicMs();
  const execute = signalFreeTerraformExecutor({
    python: executable,
    executable,
    originalStartMs: clock,
    originalDeadlineMs: clock + 7200000,
    assertOriginal: async () => {},
    beforeRelease: async (value) => {
      admission = value;
    },
    finalCapture: async () => {
      if (!admission) throw new Error('Original descriptor admission required');
      const stdout: OriginalOutputChunk[] = [],
        stderr: OriginalOutputChunk[] = [];
      for (const [channel, chunks] of [
        ['stdout', stdout],
        ['stderr', stderr],
      ] as const) {
        for (;;) {
          const chunk = await admission.output.read(channel);
          if (!chunk) break;
          chunks.push(chunk);
        }
      }
      await check(admission.output, stdout, stderr, admission);
    },
  });
  expect((await execute({ cwd: root, args: [script], env: {} })).code).toBe(0);
}

test('original apply hooks bind exact executor stdout, completion, plan and event time', async () => {
  expect(typeof hooks.readOriginalTerraformApplyHookSource).toBe('function');
  await withOutput(async (output, stdout, _stderr, admission) => {
    const parser = new hooks.TerraformApplyHookParser(plan, binding);
    const values = stdout.flatMap((chunk) => parser.pushOriginal(output, chunk));
    expect(values).toHaveLength(2);
    await expect(hooks.readOriginalTerraformApplyHookSource(values[0])).rejects.toThrow('completion');
    const completion = await output.finish();
    expect(parser.finishOriginal(output, completion).applySuccessful).toBe(true);
    const source = await hooks.readOriginalTerraformApplyHookSource(values[0]);
    expect(source.executor).toEqual(admission.identity);
    expect(source.directory).toBe(admission.directory);
    expect(source.planSha256).toBe(plan.planSha256);
    expect(source.rawLineSha256).toBe(hash(start));
    expect(source.eventEpochMs).toBe(Date.parse('2026-11-15T00:00:00Z'));
    expect(source.stdoutSha256).toBe(completion.stdout.sha256);
    expect(source.applyRpcQualified).toBe(false);
    await expect(hooks.readOriginalTerraformApplyHookSource({ ...values[0] })).rejects.toThrow('Original');
  });
});

test('copied or wrong-channel chunks and replayed offsets cannot become original apply hooks', async () => {
  expect(typeof hooks.readOriginalTerraformApplyHookSource).toBe('function');
  await withOutput(async (output, stdout, stderr) => {
    for (const value of [{ ...stdout[0] }, stderr[0]]) {
      const parser = new hooks.TerraformApplyHookParser(plan, binding);
      expect(() => parser.pushOriginal(output, value)).toThrow('original');
      expect(() => parser.pushOriginal(output, stdout[0])).toThrow('failed');
    }
    const replay = new hooks.TerraformApplyHookParser(plan, binding);
    replay.pushOriginal(output, stdout[0]);
    expect(() => replay.pushOriginal(output, stdout[0])).toThrow('gap');
  });
});

test('owned apply streams reject plaintext mixing, copied completion and ordinary finish', async () => {
  expect(typeof hooks.readOriginalTerraformApplyHookSource).toBe('function');
  await withOutput(async (output, stdout) => {
    const completion = await output.finish();
    for (const changed of ['mixed', 'completion', 'finish']) {
      const parser = new hooks.TerraformApplyHookParser(plan, binding);
      for (const chunk of stdout) parser.pushOriginal(output, chunk);
      if (changed === 'mixed') expect(() => parser.push(Buffer.from(complete))).toThrow('unowned');
      if (changed === 'completion') expect(() => parser.finishOriginal(output, { ...completion })).toThrow('original');
      if (changed === 'finish') expect(() => parser.finish()).toThrow('completion');
      expect(() => parser.pushOriginal(output, stdout[0])).toThrow('failed');
    }
  });
});

test('pure UI parser candidates cannot acquire descriptor source authority', async () => {
  expect(typeof hooks.readOriginalTerraformApplyHookSource).toBe('function');
  const parser = new hooks.TerraformApplyHookParser(plan, binding);
  const [candidate] = parser.push(Buffer.from(version + start + complete));
  parser.finish();
  await expect(hooks.readOriginalTerraformApplyHookSource(candidate)).rejects.toThrow('Original');
});

test('impossible calendar timestamps cannot become original UI event evidence', () => {
  const parser = new hooks.TerraformApplyHookParser(plan, binding);
  expect(() => parser.push(Buffer.from(version.replace('2026-11-15', '2026-02-30')))).toThrow();
});
