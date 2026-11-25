import { expect, test } from 'bun:test';
import { runIsolatedClockFixture } from './isolated-clock-fixture';

test('installed final dispatcher invariants hold on a fresh runner', async () => {
  const result = await runIsolatedClockFixture('installed-final-capture.fixture.ts');
  expect(result.exitCode).toBe(0);
  expect(result.stderr).toContain('9 pass');
  expect(result.stderr).toContain('0 fail');
}, 30000);

test('unadmitted native startup retains its safe refusal reason without granting final invocation authority', async () => {
  const { InstalledCaptureInvocations, finalizeInstalledCapture } = await import('../src/installed-final-capture');
  let persisted = 0;
  let verified = 0;
  let inputs = 0;
  let failure: unknown;
  try {
    await finalizeInstalledCapture(
      new InstalledCaptureInvocations(),
      {
        pid: 123,
        submitted: false,
        actualExitCode: 73,
        reason: 'startup',
        signalsSent: false,
        invocationStartedMs: 100,
        originalDeadlineMs: 7200000,
        finalStartedMs: 200,
        finalDeadlineMs: 300200,
        finishedMs: 300,
        stdoutPath: '/example/stdout',
        stderrPath: '/example/stderr',
        originalGroupClosed: true,
      },
      {
        persist: async () => {
          persisted++;
        },
        verify: async () => {
          verified++;
        },
        assertInputs: async () => {
          inputs++;
        },
      },
    );
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(AggregateError);
  expect(
    (failure as AggregateError).errors.some((error: Error) => error.message.includes('after native startup refusal')),
  ).toBe(true);
  expect(persisted).toBe(1);
  expect(verified).toBe(0);
  expect(inputs).toBe(1);
});

test('missing-identity diagnostics never echo an unrecognized native reason', async () => {
  const { InstalledCaptureInvocations } = await import('../src/installed-final-capture');
  let failure: unknown;
  try {
    new InstalledCaptureInvocations().find({ pid: 123, reason: 'private-refusal-canary' } as never);
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(Error);
  expect(String(failure)).not.toContain('private-refusal-canary');
  expect(JSON.stringify(failure)).not.toContain('private-refusal-canary');
});
