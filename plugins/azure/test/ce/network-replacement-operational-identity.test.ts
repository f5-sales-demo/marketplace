import { expect } from 'bun:test';
import type { ExpectedCeInterface } from '../../../platform/src/ce/interface-evidence';
import { canonicalSha256 } from '../../src/ce/canonical';
import { collectAzureReplacementOperationalIdentity } from '../../src/ce/network-replacement-operational-identity';
import { observeAzureTerraformNetworkReplacementCurrent } from '../../src/ce/terraform-network-replacement-current';
import type { AzureTerraformNetworkReplacementOperationalIdentity } from '../../src/ce/terraform-network-replacement-execution';
import { azureUpgradeBinding } from '../../src/ce/terraform-upgrade';
import { test } from './owned-fixture-test';
import { networkReplacementExecutorFixture } from './terraform-network-replacement-executor-fixture';

type Runtime = Parameters<typeof collectAzureReplacementOperationalIdentity>[2];
async function fixture(ha = false, phase: 'intact' | 'launched' = 'intact') {
  const f = await networkReplacementExecutorFixture(ha),
    plan = f.input.plan;
  f.state.phase = phase;
  const current = await observeAzureTerraformNetworkReplacementCurrent(
    {
      plan,
      retainedPlan: f.network,
      binding: f.binding,
      sourceBindingSha256: canonicalSha256(f.binding),
      phase,
      ...(phase === 'launched' ? { newVmId: f.newVmId } : {}),
    },
    f.executionApi,
  );
  const identity: AzureTerraformNetworkReplacementOperationalIdentity = {
    owner: f.store.owner,
    planSha256: plan.planSha256,
    journalSha256: f.journal.journalSha256,
    sourceBindingSha256: canonicalSha256(f.binding),
    configurationSha256: f.binding.sourceConfigurationSha256,
    site: f.binding.site,
    phase,
    nodes: current.nodes,
  };
  const state = { calls: [] as string[], fault: '', links: 0, registrations: 0, sites: 0, stale: false };
  const binding = azureUpgradeBinding(plan),
    projected = {
      metadata: { name: plan.siteName, namespace: 'system' },
      system_metadata: { uid: identity.site.siteUid },
      spec: f.birth.siteConfiguration,
    },
    runtime = {
      engine: 'terraform',
      ownedSiteConfiguration(_binding: unknown, value: { spec: unknown }) {
        return value.spec;
      },
      async observeOwnedSite() {
        state.calls.push('site');
        state.sites++;
        const value = structuredClone(projected) as { system_metadata: { uid: string } };
        if (state.fault === 'site') value.system_metadata.uid = 'foreign';
        if (state.fault === 'late-cloud' && state.sites === 2)
          f.state.phase = phase === 'intact' ? 'launched' : 'intact';
        if (state.fault === 'late-config' && state.sites === 2) f.state.configuration += '\n';
        return value;
      },
      async observeRegistrations(_binding: unknown, expected: Record<string, string>) {
        state.calls.push('registrations');
        state.registrations++;
        expect(expected).toEqual(
          Object.fromEntries(
            Object.entries(identity.nodes).map(([n, vm]) => {
              if (typeof vm.vmId !== 'string') throw Error('Synthetic present UUID missing');
              return [`${plan.deploymentName}-${n}`, vm.vmId];
            }),
          ),
        );
        const rows = Object.entries(expected).map(([node, instanceId]) => ({
          node,
          instanceId,
          state: 'ONLINE',
          status: 'healthy',
          registration: `registration-${node}`,
        }));
        if (state.fault === 'registration-uuid') rows[0].instanceId = 'foreign';
        if (state.fault === 'old-uuid')
          rows[f.selected - 1].instanceId = f.binding.before.nodes[String(f.selected)].vmId;
        if (state.fault === 'registration-partial') rows.pop();
        if (state.fault === 'registration-duplicate') rows[1] = rows[0];
        if (state.fault === 'registration-race' && state.registrations === 2) rows[0].registration += '-changed';
        return {
          owner: state.fault === 'owner' ? { ...binding.owner, account: 'example-foreign' } : binding.owner,
          siteName: binding.siteName,
          status: state.fault === 'registration-unavailable' ? 'unknown' : 'healthy',
          nodes: rows,
        };
      },
      async observeAzureInterfaces(_binding: unknown, expected: ExpectedCeInterface[]) {
        state.calls.push('interfaces');
        state.links++;
        if (state.fault === 'service') throw Error('SECRET_SENTINEL');
        if (state.fault === 'cancel') return new Promise(() => {});
        const rows = expected.map((row) => ({
          ...row,
          device: row.role === 'slo' ? 'eth0' : 'eth1',
          interfaceName: `${row.node}-${row.role}`,
          mtu: 1500,
          linkUp: true,
          ipv4: null,
        }));
        if (state.fault === 'partial') rows.pop();
        if (state.fault === 'duplicate') rows[1] = rows[0];
        if (state.fault === 'mac') rows[0].mac = '02:00:00:00:00:99';
        if (state.fault === 'node') rows[0].node = 'foreign';
        if (state.fault === 'role') rows[0].role = 'data';
        if (state.fault === 'device') rows[1].device = rows[0].device;
        if (state.fault === 'object') rows[1].interfaceName = rows[0].interfaceName;
        if (state.fault === 'link') Object.assign(rows[0], { linkUp: undefined });
        if (state.fault === 'down') {
          const sli = rows.find((row) => row.role === 'sli');
          if (!sli) throw Error('Synthetic SLI missing');
          sli.linkUp = false;
        }
        if (state.fault === 'links-race' && state.links === 2) rows[0].interfaceName += '-changed';
        return {
          status: state.fault === 'unavailable' ? 'unknown' : state.fault === 'down' ? 'down' : 'observed',
          interfaces: state.fault === 'unavailable' ? [] : rows,
          observedAt: '2020-01-01T00:00:00Z',
          privateRaw: 'SECRET_SENTINEL',
          freshness: 'unqualified',
          canSatisfyInterfaceMutationGate: true,
        };
      },
    } as unknown as Runtime;
  const dependencies = { loaders: f.loaders, qualifyHistorical: f.dependencies.qualifyHistorical };
  const run = (signal?: AbortSignal, purpose: 'preflight' | 'final' = phase === 'intact' ? 'preflight' : 'final') =>
    collectAzureReplacementOperationalIdentity(
      plan,
      identity,
      runtime,
      f.executionApi,
      f.store,
      f.session,
      dependencies,
      purpose,
      signal,
    );
  return {
    ...f,
    plan,
    identity,
    runtime,
    observationState: state,
    observationDependencies: dependencies,
    collect: run,
  };
}
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
