import { expect } from 'bun:test';
import { replacementOperationalReadingsFixture as fixture } from './network-replacement-operational-readings-fixture';
import { test } from './owned-fixture-test';

for (const ha of [false, true])
  test(`replacement ${ha ? 'six-interface HA' : 'single'} collects a fresh challenged traffic sample without full acceptance`, async () => {
    const f = await fixture(ha),
      first = await f.run(),
      second = await f.run();
    expect(first).toMatchObject({
      scope: 'current-replacement-operational-readings',
      status: 'observed',
      operationalAcceptance: 'unknown',
      traffic: { status: 'healthy', scope: 'reviewed-vm-http-content-probe' },
    });
    expect(first.traffic.sampleId).not.toBe(second.traffic.sampleId);
    expect(f.state.commands).toBe(2);
    expect(f.state.writes).toBe(6);
    expect(JSON.stringify(first)).not.toContain('TRAFFIC_PRIVATE_SENTINEL');
  }, 180000);

for (const fault of ['stale', 'unqualified', 'gate', 'down', 'partial', 'foreign'])
  test(`replacement ${fault} cannot admit a traffic probe or write`, async () => {
    const f = await fixture();
    f.state.fault = fault;
    const result = await f.run();
    expect(result.traffic.status).toBe('unknown');
    expect(f.state.commands).toBe(0);
    expect(f.state.writes).toBe(0);
  }, 60000);

test('replacement read-only request and absent reviewed ingress perform zero traffic writes or commands', async () => {
  const configured = await fixture();
  expect((await configured.run(false)).traffic.status).toBe('unknown');
  expect(configured.state.commands).toBe(0);
  expect(configured.state.writes).toBe(0);
  const absent = await fixture(false, false);
  expect((await absent.run()).traffic.status).toBe('unknown');
  expect(absent.state.commands).toBe(0);
  expect(absent.state.writes).toBe(0);
}, 60000);

for (const fault of [
  'tenant',
  'source-backref',
  'late-source',
  'http',
  'body',
  'stderr',
  'replay',
  'authorization',
  'late-down',
  'generation',
])
  test(`replacement current traffic ${fault} remains unknown and never promotes acceptance`, async () => {
    const f = await fixture();
    f.state.fault = fault;
    const result = await f.run();
    expect(result.traffic.status).toBe('unknown');
    expect(result.operationalAcceptance).toBe('unknown');
    expect(JSON.stringify(result)).not.toContain('TRAFFIC_PRIVATE_SENTINEL');
  }, 60000);

for (const fault of ['configuration', 'callback', 'request', 'late-device'])
  test(`replacement traffic rejects ${fault} drift`, async () => {
    const f = await fixture();
    f.state.fault = fault;
    await expect(f.run()).rejects.toThrow();
  }, 60000);

test('replacement traffic aborts an ignored guest command and an already cancelled request without publishing completion', async () => {
  const f = await fixture();
  f.state.fault = 'ignored-cancel';
  const abort = new AbortController();
  const promise = f.run(true, abort.signal);
  const timer = setInterval(() => {
    if (f.state.commands) abort.abort(Error('cancelled'));
  }, 10);
  try {
    await expect(promise).rejects.toThrow('cancelled');
  } finally {
    clearInterval(timer);
  }
  expect(f.state.writes).toBe(1);
  const commands = f.state.commands;
  await expect(f.run(true, abort.signal)).rejects.toThrow('cancelled');
  expect(f.state.commands).toBe(commands);
}, 60000);
