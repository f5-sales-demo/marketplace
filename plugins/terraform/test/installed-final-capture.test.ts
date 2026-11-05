import { expect, test } from 'bun:test';
import { finalizeInstalledCapture, InstalledCaptureInvocations } from '../src/installed-final-capture';
import type { FinalExecutionCapture } from '../src/signal-free-executor';

const identity = { pid: 12345, group: 12345, start: '987654', boot: '00000000-0000-4000-8000-000000000001' };

function groupInputs(directory: string) {
  const file = { dev: '1', ino: '2', uid: '1000', nlink: '1', mode: '33024', size: '1', mtimeNs: '1', ctimeNs: '1' };
  const parent = { dev: '1', ino: '1', uid: '1000', mode: '16832' };
  return Object.fromEntries(
    ['claim', 'lifetime'].map((name) => [
      name,
      {
        path: `${directory}/${name}.json`,
        sha256: 'a'.repeat(64),
        expectedIdentity: { ...file },
        expectedParentIdentity: { ...parent },
      },
    ]),
  );
}

function finished(): FinalExecutionCapture {
  return {
    identity,
    pid: identity.pid,
    invocationStartedMs: 1000,
    finalStartedMs: 2000,
    finalDeadlineMs: 302000,
    finishedMs: 2010,
    originalDeadlineMs: 7201000,
    stdoutPath: '/example/stdout',
    stderrPath: '/example/stderr',
    submitted: true,
    actualExitCode: null,
    originalGroupClosed: false,
    signalsSent: false,
    reason: 'deadline',
  };
}
function setup() {
  const events: string[] = [];
  const invocations = new InstalledCaptureInvocations();
  invocations.admit({
    identity,
    groupDirectory: '/example/group',
    groupInputs: groupInputs('/example/group'),
    capture: {
      finalCapture: async (value) => {
        expect(value.identity).toEqual(identity);
        events.push('capture');
      },
    },
  });
  return {
    events,
    invocations,
    hooks: {
      persist: async () => {
        events.push('persist');
      },
      verify: async () => {
        events.push('verify');
      },
      assertInputs: async () => {
        events.push('inputs');
      },
    },
  };
}

test('a surviving original executor cannot suppress the final capture reserve', async () => {
  const { events, invocations, hooks } = setup();
  await finalizeInstalledCapture(invocations, finished(), hooks);
  expect(events).toEqual(['persist', 'verify', 'capture', 'inputs', 'verify']);
});

test('failed persistence and ownership checks still invoke matching final capture', async () => {
  const { events, invocations, hooks } = setup();
  hooks.persist = async () => {
    events.push('persist');
    throw new Error('private disk unavailable');
  };
  hooks.verify = async () => {
    events.push('verify');
    throw new Error('original group metadata changed');
  };
  await expect(finalizeInstalledCapture(invocations, finished(), hooks)).rejects.toThrow(AggregateError);
  expect(events).toEqual(['persist', 'verify', 'capture', 'inputs', 'verify']);
});

test('failed capture cannot skip the final input and ownership checks', async () => {
  const { events, invocations, hooks } = setup();
  const value = invocations.find(finished());
  const second = new InstalledCaptureInvocations();
  second.admit({
    ...value,
    capture: {
      finalCapture: async () => {
        events.push('capture');
        throw new Error('reader remains unresolved');
      },
    },
  });
  await expect(finalizeInstalledCapture(second, finished(), hooks)).rejects.toThrow(AggregateError);
  expect(events).toEqual(['persist', 'verify', 'capture', 'inputs', 'verify']);
});

test('later invocations cannot receive an earlier apply final capture', async () => {
  const { events, invocations, hooks } = setup();
  const later = { ...identity, pid: 23456, group: 23456, start: '987655' };
  invocations.admit({ identity: later, groupDirectory: '/example/later', groupInputs: groupInputs('/example/later') });
  await finalizeInstalledCapture(invocations, { ...finished(), identity: later, pid: later.pid }, hooks);
  expect(events).toEqual(['persist', 'verify', 'inputs', 'verify']);
  await finalizeInstalledCapture(invocations, finished(), hooks);
  expect(events.filter((value) => value === 'capture')).toHaveLength(1);
});

test('reused PID and changed boot identities cannot adopt another invocation', async () => {
  const { events, invocations, hooks } = setup();
  await expect(
    finalizeInstalledCapture(
      invocations,
      {
        ...finished(),
        identity: { ...identity, start: '987656' },
      },
      hooks,
    ),
  ).rejects.toThrow(AggregateError);
  expect(events).toEqual(['persist', 'inputs']);
});

test('duplicate admission and mutation of admitted values cannot redirect capture', () => {
  const invocations = new InstalledCaptureInvocations();
  const original = { ...identity };
  const value = {
    identity: original,
    groupDirectory: '/example/original',
    groupInputs: groupInputs('/example/original'),
  };
  invocations.admit(value);
  original.start = 'changed';
  value.groupDirectory = '/example/changed';
  expect(invocations.find(finished()).groupDirectory).toBe('/example/original');
  expect(() => invocations.admit({ ...value, identity })).toThrow('already admitted');
});
