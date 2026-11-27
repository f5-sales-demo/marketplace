/** Explicit offline stage workers; real original callback and reserve issuers. */
import { expect, test } from 'bun:test';
import { createInstalledApplyController } from '../src/installed-apply-controller';
import { createInstalledCaptureContext } from '../src/installed-capture-context';
import { createInstalledCaptureCoordinator } from '../src/installed-capture-coordinator';
import type { InstalledGcpCapture } from '../src/installed-runtime';
import { admitFinalReaderReserve } from '../src/reader-final-reserve';
import type { ExecutionCaptureAdmission, FinalExecutionCapture } from '../src/signal-free-executor';

function fixture(
  failStart = '',
  failFinal = '',
  failClose = '',
  lateStart = false,
  orderedClose = false,
  failPrepare = '',
) {
  const start = 1000;
  let now = start,
    prepared = 0;
  const calls: string[] = [],
    events: Record<string, unknown>[] = [];
  const identity = { pid: 4567, group: 4567, start: '100', boot: '11111111-2222-3333-4444-555555555555' };
  const metadata = {
    dev: '1',
    ino: '2',
    uid: '1000',
    nlink: '1',
    mode: '33024',
    size: '64',
    mtimeNs: '1',
    ctimeNs: '1',
  };
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
      XCSH_API_URL: 'https://tenant.example.test',
      XCSH_API_TOKEN: 'synthetic-private',
      GOOGLE_APPLICATION_CREDENTIALS: '/example/adc',
    },
    authentication: { accountSha256: 'a'.repeat(64), audienceSha256: 'b'.repeat(64), snapshotSha256: 'c'.repeat(64) },
    inputs: {
      adc: { path: '/example/adc', sha256: 'c'.repeat(64), expectedIdentity: metadata, expectedParentIdentity: parent },
      platform: {
        path: '/example/platform',
        sha256: 'd'.repeat(64),
        expectedIdentity: { ...metadata, ino: '4' },
        expectedParentIdentity: parent,
      },
    },
    assertInputs: async () => {},
    assertWithinDeadline: async () => {
      if (now >= start + 7200000) throw new Error('original operation expired');
    },
    readProviderInputs: async () => ({}),
  });
  const worker = (name: string): InstalledGcpCapture => ({
    prepare: async (value) => {
      expect(value).toBe(context);
      calls.push(`prepare:${name}`);
      if (name === failPrepare) throw new Error(`prepare ${name}`);
    },
    start: async (_value, callback) => {
      expect(callback?.original).toBe(context);
      calls.push(`start:${name}`);
      if (lateStart && name === 'bootstrap') now += 15000;
      if (name === failStart) throw new Error(`start ${name}`);
    },
    assertOriginal: async () => {
      calls.push(`guard:${name}`);
    },
    finalCapture: async (capture, reserve, callback) => {
      expect(callback?.reserve).toBe(reserve);
      expect(capture.finalDeadlineMs).toBe(start + 300000);
      calls.push(`final:${name}`);
      if (name === failFinal) throw new Error(`final ${name}`);
    },
    closeAfterExecutorExit: async () => {
      if (orderedClose && name === 'vm') await new Promise((resolve) => setTimeout(resolve, 20));
      calls.push(`close:${name}`);
      if (orderedClose && name === 'bootstrap' && !calls.includes('close:guest'))
        throw new Error('shared bootstrap source closed before guest settlement');
      if (orderedClose && name === 'guest' && !calls.includes('close:vm'))
        throw new Error('guest source closed before VM settlement');
      if (name === failClose) throw new Error(`close ${name}`);
    },
  });
  const coordinator = createInstalledCaptureCoordinator(context, {
    stages: async () => {
      prepared++;
      now += 20000;
      return [
        { name: 'bootstrap', worker: worker('bootstrap'), ...(orderedClose ? { closeAfter: ['guest'] } : {}) },
        { name: 'vm', worker: worker('vm') },
        { name: 'guest', worker: worker('guest'), finalAfter: ['vm'], ...(orderedClose ? { closeAfter: ['vm'] } : {}) },
      ];
    },
    persist: async (event) => {
      events.push(event);
    },
  });
  const control = createInstalledApplyController(context, coordinator, { clock: () => now, persist: async () => {} });
  const admission = (): ExecutionCaptureAdmission => ({
    identity,
    directory: context.executionDirectory,
    args: ['apply'],
    stdoutPath: '/example/stdout',
    stderrPath: '/example/stderr',
    output: {} as ExecutionCaptureAdmission['output'],
    originalStartMs: start,
    originalDeadlineMs: start + 7200000,
    startupDeadlineMs: now + 15000,
  });
  const capture: FinalExecutionCapture = {
    identity,
    pid: identity.pid,
    invocationStartedMs: start,
    finalStartedMs: start,
    finalDeadlineMs: start + 300000,
    originalDeadlineMs: start + 7200000,
    finishedMs: start + 1,
    stdoutPath: '/example/stdout',
    stderrPath: '/example/stderr',
    submitted: false,
    actualExitCode: 73,
    originalGroupClosed: true,
    signalsSent: false,
    reason: 'startup',
  };
  const reserve = admitFinalReaderReserve(
    {
      identity,
      originalStartMs: start,
      originalDeadlineMs: start + 7200000,
      finalStartedMs: start,
      finalDeadlineMs: start + 300000,
      assertOriginal: async () => {},
    },
    { clock: () => now },
  );
  return {
    context,
    coordinator,
    control,
    calls,
    events,
    admission,
    capture,
    reserve,
    prepared: () => prepared,
    now: () => now,
    setNow: (value: number) => {
      now = value;
    },
  };
}

test('stage preparation occurs once outside startup and copies cannot start any stage', async () => {
  const run = fixture();
  await run.coordinator.assertOriginal();
  expect(run.prepared()).toBe(0);
  await Promise.all([run.control.prepare?.(run.context), run.control.prepare?.(run.context)]);
  expect(run.prepared()).toBe(1);
  expect(run.now()).toBe(21000);
  await expect(
    run.coordinator.start(run.admission(), { phase: 'before', original: run.context } as never),
  ).rejects.toThrow('Original');
  expect(run.calls.filter((value) => value.startsWith('start:'))).toEqual([]);
  expect(JSON.stringify(run.events)).not.toContain('synthetic-private');
});

test('startup failure cannot replay and still captures every prepared companion stage', async () => {
  const run = fixture('vm');
  await run.control.prepare?.(run.context);
  await expect(run.control.start(run.admission())).rejects.toThrow('start vm');
  await expect(run.control.start(run.admission())).rejects.toThrow();
  await run.control.finalCapture(run.capture, run.reserve);
  expect(run.calls.filter((value) => value.startsWith('start:'))).toEqual(['start:bootstrap', 'start:vm']);
  expect(run.calls.filter((value) => value.startsWith('final:')).sort()).toEqual([
    'final:bootstrap',
    'final:guest',
    'final:vm',
  ]);
  expect(run.calls.indexOf('final:guest')).toBeGreaterThan(run.calls.indexOf('final:vm'));
  await run.control.closeAfterExecutorExit();
  expect(run.calls.filter((value) => value.startsWith('close:')).sort()).toEqual([
    'close:bootstrap',
    'close:guest',
    'close:vm',
  ]);
});

test('a final-stage refusal cannot suppress dependent final capture or independent closure checks', async () => {
  const run = fixture('', 'vm', 'bootstrap');
  await run.control.prepare?.(run.context);
  await run.control.start(run.admission());
  await expect(run.control.finalCapture(run.capture, run.reserve)).rejects.toThrow('capture');
  expect(run.calls.filter((value) => value.startsWith('final:')).sort()).toEqual([
    'final:bootstrap',
    'final:guest',
    'final:vm',
  ]);
  await expect(run.coordinator.closeAfterExecutorExit()).rejects.toThrow('closure');
  expect(run.calls.filter((value) => value.startsWith('close:')).sort()).toEqual([
    'close:bootstrap',
    'close:guest',
    'close:vm',
  ]);
});

test('a delayed stage startup preserves the original release deadline and final reserve', async () => {
  const run = fixture('', '', '', true);
  await run.control.prepare?.(run.context);
  const admission = run.admission();
  await expect(run.control.start(admission)).rejects.toThrow('startup');
  expect(run.calls.filter((value) => value.startsWith('start:'))).toEqual(['start:bootstrap']);
  await run.control.finalCapture(run.capture, run.reserve);
  expect(run.capture.finalDeadlineMs).toBe(301000);
});

test('concurrent startup calls have only one admitted stage submission', async () => {
  const run = fixture();
  await run.control.prepare?.(run.context);
  const admission = run.admission();
  const results = await Promise.allSettled([run.control.start(admission), run.control.start(admission)]);
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
  expect(run.calls.filter((value) => value.startsWith('start:')).sort()).toEqual([
    'start:bootstrap',
    'start:guest',
    'start:vm',
  ]);
  await run.control.finalCapture(run.capture, run.reserve);
  await run.control.closeAfterExecutorExit();
});

test('an equivalent-looking admission cannot borrow the actual original callback', async () => {
  const run = fixture();
  await run.control.prepare?.(run.context);
  let rejectedCopy = false;
  const original = run.coordinator.start.bind(run.coordinator);
  const controller = createInstalledApplyController(
    run.context,
    {
      ...run.coordinator,
      start: async (admission, callback) => {
        await expect(original({ ...admission }, callback)).rejects.toThrow('Original');
        rejectedCopy = true;
        await original(admission, callback);
      },
    },
    { clock: run.now, persist: async () => {} },
  );
  await controller.prepare?.(run.context);
  await controller.start(run.admission());
  expect(rejectedCopy).toBe(true);
  await controller.finalCapture(run.capture, run.reserve);
  await controller.closeAfterExecutorExit();
});

test('shared stage sources remain open until dependent closure settles', async () => {
  const run = fixture('', '', '', false, true);
  await run.control.prepare?.(run.context);
  await run.control.start(run.admission());
  await run.control.finalCapture(run.capture, run.reserve);
  await run.control.closeAfterExecutorExit();
  expect(run.calls.filter((value) => value.startsWith('close:'))).toEqual([
    'close:vm',
    'close:guest',
    'close:bootstrap',
  ]);
});

test('a failed prerequisite still settles before dependent closure and cannot replay', async () => {
  const run = fixture('', '', 'vm', false, true);
  await run.control.prepare?.(run.context);
  await run.control.start(run.admission());
  await run.control.finalCapture(run.capture, run.reserve);
  await expect(run.coordinator.closeAfterExecutorExit()).rejects.toThrow('closure');
  expect(run.calls.filter((value) => value.startsWith('close:'))).toEqual([
    'close:vm',
    'close:guest',
    'close:bootstrap',
  ]);
  await expect(run.coordinator.closeAfterExecutorExit()).rejects.toThrow('closure');
  expect(run.calls.filter((value) => value.startsWith('close:'))).toHaveLength(3);
});

test('cyclic or missing closure dependencies are refused before any stage preparation', async () => {
  for (const invalid of ['cycle', 'missing']) {
    const run = fixture();
    let prepared = 0;
    const worker: InstalledGcpCapture = {
      prepare: async () => {
        prepared++;
      },
      start: async () => {},
      assertOriginal: async () => {},
      finalCapture: async () => {},
      closeAfterExecutorExit: async () => {},
    };
    const coordinator = createInstalledCaptureCoordinator(run.context, {
      stages: async () => [
        { name: 'source', worker, closeAfter: [invalid === 'cycle' ? 'guest' : 'missing'] },
        { name: 'guest', worker, closeAfter: ['source'] },
      ],
      persist: async () => {},
    });
    await expect(coordinator.prepare?.(run.context)).rejects.toThrow('closure');
    expect(prepared).toBe(0);
  }
});

test('failed preflight closes prepared shared sources without inventing an executor or final reserve', async () => {
  const run = fixture('', '', '', false, true, 'vm');
  await expect(run.control.prepare?.(run.context)).rejects.toThrow('prepare vm');
  expect(run.calls.filter((value) => value.startsWith('start:'))).toEqual([]);
  await run.control.closeAfterExecutorExit();
  expect(run.calls.filter((value) => value.startsWith('close:'))).toEqual([
    'close:vm',
    'close:guest',
    'close:bootstrap',
  ]);
  expect(run.calls.filter((value) => value.startsWith('final:'))).toEqual([]);
  await expect(run.control.start(run.admission())).rejects.toThrow();
});
