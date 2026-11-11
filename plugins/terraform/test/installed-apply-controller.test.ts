import { expect, test } from 'bun:test';
import {
  assertOriginalApplyCallback,
  createInstalledApplyController,
  type OriginalApplyCallbackContext,
} from '../src/installed-apply-controller';
import { createInstalledCaptureContext } from '../src/installed-capture-context';
import type { InstalledGcpCapture } from '../src/installed-runtime';
import { linuxMonotonicMs } from '../src/linux-clock';
import { admitFinalReaderReserve } from '../src/reader-final-reserve';
import type { ExecutionCaptureAdmission, FinalExecutionCapture } from '../src/signal-free-executor';

let fixturePid = 1234;
function fixture(start = 1000, failPrepare = false) {
  let now = start,
    prepareCalls = 0,
    starts = 0,
    finals = 0,
    closes = 0;
  const events: Record<string, unknown>[] = [];
  const pid = ++fixturePid;
  const identity = { pid, group: pid, start: '100', boot: '11111111-2222-3333-4444-555555555555' };
  const file = { dev: '1', ino: '2', uid: '1000', nlink: '1', mode: '33024', size: '64', mtimeNs: '1', ctimeNs: '1' };
  const parent = { dev: '1', ino: '3', uid: '1000', mode: '16832' };
  const context = createInstalledCaptureContext({
    owner: {
      provider: 'gcp',
      engine: 'terraform',
      account: 'example-project',
      region: 'us-central1',
      deploymentId: 'original',
    },
    executionDirectory: '/example/original',
    budget: { start, deadline: start + 7200000 },
    environment: {
      GOOGLE_APPLICATION_CREDENTIALS: '/example/adc',
      XCSH_API_URL: 'https://tenant.example.test',
      XCSH_API_TOKEN: 'synthetic-private-context',
    },
    authentication: { accountSha256: 'c'.repeat(64), audienceSha256: 'd'.repeat(64), snapshotSha256: 'a'.repeat(64) },
    inputs: {
      adc: { path: '/example/adc', sha256: 'a'.repeat(64), expectedIdentity: file, expectedParentIdentity: parent },
      platform: {
        path: '/example/platform',
        sha256: 'b'.repeat(64),
        expectedIdentity: { ...file, ino: '4' },
        expectedParentIdentity: parent,
      },
    },
    assertInputs: async () => {},
    assertWithinDeadline: async () => {
      if (now >= start + 7200000) throw new Error('original deadline');
    },
    readProviderInputs: async () => ({}),
  });
  let before: OriginalApplyCallbackContext | undefined, after: OriginalApplyCallbackContext | undefined;
  const worker: InstalledGcpCapture = {
    prepare: async (original) => {
      expect(original).toBe(context);
      prepareCalls++;
      if (failPrepare) throw new Error('preflight failed');
      now += 20000;
    },
    start: async (_admission, callback) => {
      starts++;
      before = callback;
    },
    assertOriginal: async () => {},
    finalCapture: async (_capture, _reserve, callback) => {
      finals++;
      after = callback;
    },
    closeAfterExecutorExit: async () => {
      closes++;
    },
  };
  const control = createInstalledApplyController(context, worker, {
    clock: () => now,
    persist: async (event) => {
      events.push(event);
    },
  });
  const admission = (): ExecutionCaptureAdmission => ({
    directory: '/example/original/executor-diagnostics/capture',
    args: ['apply'],
    identity,
    stdoutPath: '/example/stdout',
    stderrPath: '/example/stderr',
    originalStartMs: start,
    originalDeadlineMs: start + 7200000,
    startupDeadlineMs: now + 15000,
    output: {} as ExecutionCaptureAdmission['output'],
  });
  const final = (value: ExecutionCaptureAdmission): FinalExecutionCapture => ({
    identity: value.identity,
    pid: value.identity.pid,
    invocationStartedMs: start,
    finalStartedMs: now,
    finalDeadlineMs: now + 300000,
    finishedMs: now,
    originalDeadlineMs: start + 7200000,
    stdoutPath: value.stdoutPath,
    stderrPath: value.stderrPath,
    submitted: true,
    actualExitCode: 0,
    originalGroupClosed: true,
    signalsSent: false,
  });
  return {
    control,
    worker,
    context,
    identity,
    admission,
    final,
    events,
    setNow: (value: number) => {
      now = value;
    },
    now: () => now,
    counts: () => ({ prepareCalls, starts, finals, closes }),
    callbacks: () => ({ before, after }),
  };
}

test('preflight completes outside the startup gate and dynamic callback retains original context, identity and budget', async () => {
  const run = fixture();
  await Promise.all([run.control.prepare?.(run.context), run.control.prepare?.(run.context)]);
  expect(run.counts().prepareCalls).toBe(1);
  expect(run.now()).toBe(21000);
  const admission = run.admission();
  await run.control.start(admission);
  const callback = run.callbacks().before;
  if (!callback) throw new Error('Original callback required');
  expect(callback.original).toBe(run.context);
  expect(callback.execution.identity).toEqual(run.identity);
  expect(callback.original.budget.start).toBe(1000);
  await assertOriginalApplyCallback(callback);
  await expect(assertOriginalApplyCallback({ ...callback })).rejects.toThrow('Original');
  expect(JSON.stringify(run.events)).not.toContain('synthetic-private-context');
  await expect(run.control.start(admission)).rejects.toThrow('already');
});
test('unprepared or wrong-budget execution refuses before worker start', async () => {
  const run = fixture();
  await expect(run.control.start(run.admission())).rejects.toThrow('prepared');
  await run.control.prepare?.(run.context);
  await expect(run.control.start({ ...run.admission(), originalStartMs: 1001 })).rejects.toThrow('budget');
  expect(run.counts().starts).toBe(0);
});
test('failed preparation is retained and cannot silently retry', async () => {
  const run = fixture(1000, true);
  await expect(run.control.prepare?.(run.context)).rejects.toThrow('preflight failed');
  await expect(run.control.prepare?.(run.context)).rejects.toThrow('preflight failed');
  expect(run.counts().prepareCalls).toBe(1);
  expect(run.events.some((e) => e.phase === 'prepare-failed')).toBe(true);
});
test('final callback uses original five-minute reserve after operation expiry without renewing it', async () => {
  const real = linuxMonotonicMs();
  const start = real - 7200001;
  const run = fixture(start);
  await run.control.prepare?.(run.context);
  const admission = run.admission();
  await run.control.start(admission);
  run.setNow(real);
  const finished = run.final(admission);
  const reserve = admitFinalReaderReserve({
    identity: run.identity,
    originalStartMs: start,
    originalDeadlineMs: start + 7200000,
    finalStartedMs: real,
    finalDeadlineMs: real + 300000,
    assertOriginal: async () => {},
  });
  await run.control.finalCapture(finished, reserve);
  const callback = run.callbacks().after;
  if (!callback) throw new Error('Original final callback required');
  await assertOriginalApplyCallback(callback);
  expect(callback.original).toBe(run.context);
  expect(callback.reserve).toBe(reserve);
  expect(callback.original.budget.deadline).toBe(start + 7200000);
  await expect(run.control.finalCapture(finished, reserve)).rejects.toThrow('already');
  await run.control.closeAfterExecutorExit();
  expect(run.counts().closes).toBe(1);
});
test('wrong final identity and unresolved group cannot redirect or dispose original capture', async () => {
  const run = fixture();
  await run.control.prepare?.(run.context);
  const admission = run.admission();
  await run.control.start(admission);
  await expect(
    run.control.finalCapture({ ...run.final(admission), identity: { ...run.identity, start: '101' } }),
  ).rejects.toThrow('identity');
  await expect(run.control.closeAfterExecutorExit()).rejects.toThrow('closure');
  expect(run.counts().closes).toBe(0);
});

test('late startup completion cannot publish a successful before callback', async () => {
  const run = fixture();
  run.worker.start = async () => {
    run.setNow(50000);
  };
  const events: Record<string, unknown>[] = [];
  const control = createInstalledApplyController(run.context, run.worker, {
    clock: run.now,
    persist: async (e) => {
      events.push(e);
    },
  });
  await control.prepare?.(run.context);
  const admission = run.admission();
  await expect(control.start(admission)).rejects.toThrow('startup deadline');
  expect(events.some((e) => e.phase === 'before-complete')).toBe(false);
});
test('preparation failure and failed evidence retention both survive', async () => {
  const run = fixture(1000, true);
  const control = createInstalledApplyController(run.context, run.worker, {
    clock: run.now,
    persist: async (e) => {
      if (e.phase === 'prepare-failed') throw new Error('retention failed');
    },
  });
  try {
    await control.prepare?.(run.context);
    throw new Error('failure expected');
  } catch (error) {
    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors.map((e) => (e as Error).message)).toEqual([
      'preflight failed',
      'retention failed',
    ]);
  }
});

test('final capture still runs when its original journal write fails', async () => {
  const real = linuxMonotonicMs(),
    start = real - 7200001,
    run = fixture(start);
  const control = createInstalledApplyController(run.context, run.worker, {
    clock: run.now,
    persist: async (e) => {
      if (e.phase === 'final-start') throw new Error('final retention failed');
    },
  });
  await control.prepare?.(run.context);
  const admission = run.admission();
  await control.start(admission);
  run.setNow(real);
  const finished = run.final(admission);
  const reserve = admitFinalReaderReserve({
    identity: run.identity,
    originalStartMs: start,
    originalDeadlineMs: start + 7200000,
    finalStartedMs: real,
    finalDeadlineMs: real + 300000,
    assertOriginal: async () => {},
  });
  await expect(control.finalCapture(finished, reserve)).rejects.toThrow('final retention failed');
  expect(run.counts().finals).toBe(1);
});
