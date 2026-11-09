import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { linuxMonotonicMs } from '../src/linux-clock';
import { admitFinalReaderReserve, inspectFinalReaderReserve } from '../src/reader-final-reserve';
import {
  type FinalExecutionCapture,
  signalFreeFinalReaderExecutor,
  signalFreeTerraformExecutor,
} from '../src/signal-free-executor';

const python = process.env.CE_TEST_PYTHON ?? Bun.which('python3') ?? '';
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
let fixtureSequence = 0;
async function fixture(body = 'print("final-reader-complete")\n') {
  fixtureSequence++;
  const identity = Object.freeze({
    pid: 1001 + fixtureSequence,
    group: 1001 + fixtureSequence,
    start: String(123 + fixtureSequence),
    boot: '00000000-0000-0000-0000-000000000001',
  });
  const root = await mkdtemp(join(tmpdir(), 'ce-final-reader-'));
  const script = join(root, 'reader.py');
  await writeFile(script, body, { flag: 'wx', mode: 0o400 });
  const now = linuxMonotonicMs();
  const originalDeadlineMs = now - 100;
  const originalStartMs = originalDeadlineMs - 7_200_000;
  const finalStartedMs = now - 50;
  const finalDeadlineMs = finalStartedMs + 300_000;
  const captures: FinalExecutionCapture[] = [];
  let guards = 0;
  const reserve = admitFinalReaderReserve({
    identity,
    originalStartMs,
    originalDeadlineMs,
    finalStartedMs,
    finalDeadlineMs,
    assertOriginal: async () => {
      guards++;
    },
  });
  const executable = { path: python, sha256: hash(await readFile(python)) };
  const policy = {
    python: executable,
    executable,
    originalStartMs,
    originalDeadlineMs,
    assertOriginal: async () => {},
    finalCapture: async (capture: FinalExecutionCapture) => {
      captures.push(capture);
    },
  };
  return { root, script, captures, reserve, policy, finalStartedMs, finalDeadlineMs, guards: () => guards };
}

test('final reader executes after operation expiry without renewing either original clock', async () => {
  const run = await fixture();
  const invocation = { cwd: run.root, args: ['-I', '-B', run.script], env: {} };
  await expect(signalFreeTerraformExecutor(run.policy)(invocation)).rejects.toThrow('deadline');
  const execute = signalFreeFinalReaderExecutor(run.policy, run.reserve);
  const result = await execute(invocation);
  expect(result.code).toBe(0);
  expect(result.stdout.trim()).toBe('final-reader-complete');
  expect(run.captures).toHaveLength(1);
  expect(run.captures[0].originalDeadlineMs).toBe(run.policy.originalDeadlineMs);
  expect(run.captures[0].finalStartedMs).toBe(run.finalStartedMs);
  expect(run.captures[0].finalDeadlineMs).toBe(run.finalDeadlineMs);
  expect(run.captures[0].originalGroupClosed).toBe(true);
  expect(run.guards()).toBeGreaterThan(2);
}, 30_000);

test('serialized or cloned reserves cannot grant final reader execution', async () => {
  const run = await fixture();
  for (const value of [JSON.parse(JSON.stringify(run.reserve)), { ...run.reserve }]) {
    expect(() => signalFreeFinalReaderExecutor(run.policy, value)).toThrow('admitted');
  }
});

test('the same original actor cannot renew its final window through a new admission', async () => {
  const run = await fixture();
  const original = inspectFinalReaderReserve(run.reserve);
  expect(() =>
    admitFinalReaderReserve({
      ...original,
      finalStartedMs: original.finalStartedMs + 1,
      finalDeadlineMs: original.finalDeadlineMs + 1,
      assertOriginal: async () => {},
    }),
  ).toThrow('renewed');
  expect(() =>
    admitFinalReaderReserve({
      ...original,
      originalStartMs: original.originalStartMs + 1,
      originalDeadlineMs: original.originalDeadlineMs + 1,
      assertOriginal: async () => {},
    }),
  ).toThrow('renewed');
  const same = admitFinalReaderReserve({ ...original, assertOriginal: async () => {} });
  expect(inspectFinalReaderReserve(same).finalDeadlineMs).toBe(original.finalDeadlineMs);
});

test('a delayed final reader failure cannot reset the inherited recovery or closure deadline', async () => {
  const run = await fixture('import time\ntime.sleep(1)\nprint("natural-completion")\n');
  const execute = signalFreeFinalReaderExecutor({ ...run.policy, timeoutMs: 700 }, run.reserve);
  const result = await execute({ cwd: run.root, args: ['-I', '-B', run.script], env: {} });
  expect(result.code).toBe(1);
  expect(run.captures[0].reason).toBe('deadline');
  expect(run.captures[0].actualExitCode).toBeNull();
  expect(run.captures[0].finalStartedMs).toBe(run.finalStartedMs);
  expect(run.captures[0].finalDeadlineMs).toBe(run.finalDeadlineMs);
  const { readdir } = await import('node:fs/promises');
  const diagnostics = join(run.root, 'executor-diagnostics');
  const directories = await readdir(diagnostics);
  expect(directories).toHaveLength(1);
  const completion = JSON.parse(await readFile(join(diagnostics, directories[0], 'completion.private.json'), 'utf8'));
  expect(completion.actualExitCode).toBe(0);
  expect(completion.originalGroupClosed).toBe(true);
  expect(completion.finalDeadlineMs).toBe(run.finalDeadlineMs);
}, 30_000);

test('final reader authority refuses Terraform, changed budgets and excessive command limits', async () => {
  const run = await fixture();
  expect(() =>
    signalFreeFinalReaderExecutor(
      { ...run.policy, executable: { ...run.policy.executable, path: '/example/terraform' } },
      run.reserve,
    ),
  ).toThrow('interpreter');
  expect(() =>
    signalFreeFinalReaderExecutor(
      {
        ...run.policy,
        originalStartMs: run.policy.originalStartMs + 1,
        originalDeadlineMs: run.policy.originalDeadlineMs + 1,
      },
      run.reserve,
    ),
  ).toThrow(/[Oo]riginal/);
  expect(() => signalFreeFinalReaderExecutor({ ...run.policy, timeoutMs: 60_001 }, run.reserve)).toThrow('sixty');
  const execute = signalFreeFinalReaderExecutor(run.policy, run.reserve);
  await expect(execute({ cwd: run.root, args: ['-c', 'print("unexpected")'], env: {} })).rejects.toThrow('isolated');
});

test('changed original guards or an exhausted inherited reserve refuse before submission', async () => {
  const run = await fixture();
  const values = inspectFinalReaderReserve(run.reserve);
  const changed = admitFinalReaderReserve({
    ...values,
    assertOriginal: async () => {
      throw new Error('original parent inputs changed');
    },
  });
  await expect(
    signalFreeFinalReaderExecutor(run.policy, changed)({ cwd: run.root, args: ['-I', '-B', run.script], env: {} }),
  ).rejects.toThrow('inputs changed');
  expect(() =>
    admitFinalReaderReserve({
      ...values,
      finalStartedMs: values.finalStartedMs - 300_001,
      finalDeadlineMs: values.finalDeadlineMs - 300_001,
      assertOriginal: async () => {},
    }),
  ).toThrow('exhausted');
  expect(() =>
    admitFinalReaderReserve({ ...values, finalDeadlineMs: values.finalDeadlineMs + 1, assertOriginal: async () => {} }),
  ).toThrow('fixed');
});
