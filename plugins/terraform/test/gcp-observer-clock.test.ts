/** Framing/clock consistency tests only; synthetic packets grant no SSH peer. */
import { expect, test } from 'bun:test';
import * as clock from '../src/gcp-observer-clock';

const challenge = `XCSH_OBSERVER_PROBE_${'a'.repeat(64)}_123456`;
const packet = () => ({
  schemaVersion: 1,
  kind: 'gcp-observer-peer-clock',
  challenge,
  instanceId: '123456',
  platform: 'linux',
  machine: 'x86_64',
  user: 'ubuntu',
  uid: 1000,
  bootId: '11111111-2222-3333-4444-555555555555',
  monotonicMs: 20000,
  epochMs: 1794900000000,
  pythonPath: '/usr/bin/python3.12',
  pythonSha256: 'b'.repeat(64),
});
const raw = (value: unknown) => Buffer.from(`${JSON.stringify(value)}\n`);
test('one exact peer challenge carries a bounded clock candidate without minting trust', () => {
  const result = clock.inspectGcpObserverPeerClock(raw(packet()), {
    challenge,
    instanceId: '123456',
    sourceStartedMs: 10000,
    sourceFinishedMs: 11000,
  });
  expect(result.offsetMinimumMs).toBe(9000);
  expect(result.offsetMaximumMs).toBe(10000);
  expect(result.guestClientQualified).toBe(false);
  expect(Object.isFrozen(result)).toBe(true);
});
test('foreign, ambiguous and noninteger clock evidence cannot enter the peer join', () => {
  for (const change of [
    { challenge: 'foreign' },
    { instanceId: '999999' },
    { uid: 0 },
    { uid: true },
    { monotonicMs: 1.5 },
    { monotonicMs: true },
    { platform: 'darwin' },
    { user: 'root' },
    { bootId: 'foreign' },
    { pythonPath: '/tmp/foreign' },
    { pythonSha256: 'bad' },
  ])
    expect(() =>
      clock.inspectGcpObserverPeerClock(raw({ ...packet(), ...change }), {
        challenge,
        instanceId: '123456',
        sourceStartedMs: 10000,
        sourceFinishedMs: 11000,
      }),
    ).toThrow();
  const duplicate = raw(packet()).toString().replace('"schemaVersion":1', '"schemaVersion":1,"schemaVersion":1');
  expect(() =>
    clock.inspectGcpObserverPeerClock(Buffer.from(duplicate), {
      challenge,
      instanceId: '123456',
      sourceStartedMs: 10000,
      sourceFinishedMs: 11000,
    }),
  ).toThrow();
});
test('clock interval never resets the source command clock or accepts reversed/unbounded capture', () => {
  for (const range of [
    { sourceStartedMs: 11000, sourceFinishedMs: 10000 },
    { sourceStartedMs: 0, sourceFinishedMs: 60001 },
    { sourceStartedMs: 10000.5, sourceFinishedMs: 11000 },
  ])
    expect(() =>
      clock.inspectGcpObserverPeerClock(raw(packet()), { challenge, instanceId: '123456', ...range }),
    ).toThrow();
});

test('fixed observer clock command transports exact Python bytes and rejects shell input injection', () => {
  const command = clock.buildGcpObserverClockCommand(challenge, '123456');
  const python = process.env.CE_TEST_PYTHON ?? '';
  if (!python) throw new Error('Original test Python required');
  const result = Bun.spawnSync([
    python,
    '-I',
    '-B',
    '-c',
    'import shlex,json,sys;print(json.dumps(shlex.split(sys.argv[1])))',
    command,
  ]);
  expect(result.exitCode).toBe(0);
  expect(JSON.parse(result.stdout.toString())).toEqual([
    '/usr/bin/python3',
    '-I',
    '-B',
    '-c',
    clock.GCP_OBSERVER_CLOCK_SOURCE,
    challenge,
    '123456',
  ]);
  expect(() => clock.buildGcpObserverClockCommand(challenge, "123456'; exit")).toThrow();
  expect(() => clock.buildGcpObserverClockCommand('foreign', '123456')).toThrow();
});
