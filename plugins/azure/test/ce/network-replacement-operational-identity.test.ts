import { expect } from 'bun:test';
import { canonicalSha256 } from '../../src/ce/canonical';
import { replacementOperationalIdentityFixture as fixture } from './network-replacement-operational-identity-fixture';
import { test } from './owned-fixture-test';

for (const ha of [false, true])
  for (const phase of ['intact', 'launched'] as const)
    test(`replacement ${ha ? 'six-interface HA' : 'single'} ${phase} binds complete journal/source/configuration and generation`, async () => {
      const f = await fixture(ha, phase),
        result = await f.collect();
      expect(result).toMatchObject({
        status: 'observed',
        phase,
        purpose: phase === 'intact' ? 'preflight' : 'final',
        journalSha256: f.identity.journalSha256,
        sourceBindingSha256: f.identity.sourceBindingSha256,
        configurationSha256: f.identity.configurationSha256,
        expectedIdentitySha256: canonicalSha256(f.identity),
        scope: 'replacement-registration-interface-identity',
        operationalAcceptance: 'unknown',
        freshness: 'unqualified',
        nodeHealth: 'unknown',
        routing: 'unknown',
        traffic: 'unknown',
        canSatisfyInterfaceMutationGate: false,
      });
      expect(result.interfaces).toHaveLength(ha ? 6 : 2);
      if (!('registrations' in result)) throw Error('Synthetic registrations missing');
      expect(
        result.registrations.nodes.find((row) => row.node === `${f.plan.deploymentName}-${f.selected}`)?.instanceId,
      ).toBe(phase === 'launched' ? f.newVmId : f.binding.before.nodes[String(f.selected)].vmId);
      expect(JSON.stringify(result)).not.toContain('SECRET_SENTINEL');
      expect(JSON.stringify(result)).not.toContain('2020-01-01');
      expect(f.state.applies).toBe(0);
      expect(f.state.bootstraps).toBe(0);
    }, 60000);
test('replacement retains same SLI identity across up/down/up while acceptance stays unknown', async () => {
  const f = await fixture(true, 'launched'),
    up = await f.collect();
  f.observationState.fault = 'down';
  const down = await f.collect();
  f.observationState.fault = '';
  const restored = await f.collect();
  expect([up.interfaceState, down.interfaceState, restored.interfaceState]).toEqual(['observed', 'down', 'observed']);
  const selected = up.interfaces.find((row) => row.role === 'sli');
  if (!selected) throw Error('Synthetic SLI missing');
  expect(down.interfaces.find((row) => row.interfaceName === selected.interfaceName)).toEqual({
    ...selected,
    linkUp: false,
  });
  expect(restored.interfaces).toEqual(up.interfaces);
  expect(down.canSatisfyInterfaceMutationGate).toBe(false);
}, 60000);
test('replacement rejects foreign, partial, malformed, unavailable and racing runtime evidence without mutation', async () => {
  const f = await fixture(true, 'launched');
  for (const fault of [
    'partial',
    'duplicate',
    'mac',
    'node',
    'role',
    'device',
    'object',
    'link',
    'unavailable',
    'service',
    'owner',
    'registration-uuid',
    'old-uuid',
    'registration-partial',
    'registration-duplicate',
    'registration-race',
    'links-race',
    'site',
  ]) {
    Object.assign(f.observationState, { fault, links: 0, registrations: 0, sites: 0 });
    const result = await f.collect();
    expect(result.status).toBe('unknown');
    expect(result.canSatisfyInterfaceMutationGate).toBe(false);
    expect(JSON.stringify(result)).not.toContain('SECRET_SENTINEL');
  }
  expect(f.state.applies).toBe(0);
  expect(f.state.bootstraps).toBe(0);
}, 180000);
test('replacement preserves explicit down separately from unavailable registrations', async () => {
  const f = await fixture();
  f.observationState.fault = 'down';
  f.runtime.observeRegistrations = async () => ({ status: 'unknown' });
  expect(await f.collect()).toMatchObject({
    status: 'unknown',
    interfaceState: 'down',
    canSatisfyInterfaceMutationGate: false,
  });
}, 60000);
test('replacement rejects unresolved identities, absent nodes and mismatched phase/purpose before observation', async () => {
  const f = await fixture(),
    saved = structuredClone(f.identity);
  for (const name of ['journalSha256', 'sourceBindingSha256', 'configurationSha256'] as const) {
    f.identity[name] = '__UNRESOLVED__';
    await expect(f.collect()).rejects.toThrow(/resolved/);
    Object.assign(f.identity, structuredClone(saved));
  }
  f.identity.nodes['1'].vmState = 'absent';
  await expect(f.collect()).rejects.toThrow(/present/);
  Object.assign(f.identity, structuredClone(saved));
  await expect(f.collect(undefined, 'final')).rejects.toThrow(/purpose/);
  expect(f.observationState.calls).toEqual([]);
}, 60000);
test('replacement rejects foreign journal/source/configuration before CE observation', async () => {
  const f = await fixture(),
    saved = structuredClone(f.identity);
  for (const name of ['journalSha256', 'sourceBindingSha256', 'configurationSha256'] as const) {
    f.identity[name] = 'f'.repeat(64);
    await expect(f.collect()).rejects.toThrow();
    Object.assign(f.identity, structuredClone(saved));
  }
  expect(f.observationState.calls).toEqual([]);
  expect(f.state.applies).toBe(0);
}, 60000);
test('replacement does not hide changed final configuration behind unknown observation', async () => {
  const f = await fixture();
  f.observationState.fault = 'late-config';
  await expect(f.collect()).rejects.toThrow(/configuration/);
  expect(f.state.applies).toBe(0);
}, 60000);
test('replacement detects changed final cloud generation without accepting stale registrations', async () => {
  const f = await fixture();
  f.observationState.fault = 'late-cloud';
  expect(await f.collect()).toMatchObject({ status: 'unknown', reason: 'final-cloud-identity-unverified' });
  expect(f.state.applies).toBe(0);
}, 60000);
test('replacement bounds cancellation ignored by runtime without restarting collection', async () => {
  const f = await fixture(),
    controller = new AbortController();
  f.observationState.fault = 'cancel';
  const pending = f.collect(controller.signal);
  const timer = setInterval(() => {
    if (f.observationState.calls.includes('interfaces')) controller.abort(Error('cancelled'));
  }, 10);
  try {
    await expect(pending).rejects.toThrow('cancelled');
  } finally {
    clearInterval(timer);
  }
  expect(f.state.applies).toBe(0);
}, 60000);
test('replacement seals identity mutation and callback replacement during observation', async () => {
  const f = await fixture();
  const original = f.runtime.observeOwnedSite;
  f.runtime.observeOwnedSite = async (...args) => {
    const value = await original(...args);
    f.identity.journalSha256 = 'f'.repeat(64);
    return value;
  };
  await expect(f.collect()).rejects.toThrow(/context changed/);
  const g = await fixture(),
    read = g.runtime.observeOwnedSite;
  g.runtime.observeOwnedSite = async (...args) => {
    const value = await read(...args);
    g.runtime.observeRegistrations = async () => ({ status: 'unknown' });
    return value;
  };
  await expect(g.collect()).rejects.toThrow(/context changed/);
}, 60000);
