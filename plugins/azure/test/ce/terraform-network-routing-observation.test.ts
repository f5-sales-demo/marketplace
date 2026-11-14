import { expect, test } from 'bun:test';
import type { AzExecApi } from '../../src/az/exec';
import { captureAzureNetworkUpdateInventory } from '../../src/ce/network-update';
import { prepareAzureTerraformNetworkRouting } from '../../src/ce/terraform-network-routing';
import { collectAzureTerraformNetworkRoutingConfiguration } from '../../src/ce/terraform-network-routing-observation';
import { networkUpdateFixture } from './network-update-fixture';

async function fixture(mode: 'udr' | 'route-server' = 'udr', state: 'prior' | 'current' | 'mixed' = 'current') {
  const routing =
    mode === 'udr'
      ? {
          mode,
          destinationCidrs: ['10.253.0.0/24', '10.254.0.0/24'],
          udr: { subnetNames: ['slo'], nextHop: { node: 1, nicIndex: 1 } },
        }
      : { mode, destinationCidrs: ['10.253.0.0/24'], localAsn: 65010 };
  const f = networkUpdateFixture(true, 'terraform', true, false, routing);
  const before = await captureAzureNetworkUpdateInventory(f.plan, f.api),
    source = f.source();
  const prepared = prepareAzureTerraformNetworkRouting(f.plan, source, before, 1);
  for (const nic of f.nics.values())
    if (String(nic.id).includes('-1-nic')) {
      const ip = f.config(nic);
      if (String(nic.id).endsWith('nic1')) {
        ip.privateIPAddress = '10.20.2.5';
        ip.subnet = { id: f.target };
      } else if (mode === 'route-server') ip.privateIPAddress = '10.20.0.15';
    }
  const current = await captureAzureNetworkUpdateInventory(f.plan, f.api),
    config = JSON.parse(source);
  const parents = new Map<string, Record<string, unknown>>(),
    rows = new Map<string, Record<string, unknown>>();
  for (const [index, dependency] of prepared.dependencies.entries()) {
    const udr = mode === 'udr',
      parentId = dependency.resourceId.slice(
        0,
        dependency.resourceId.lastIndexOf(udr ? '/routes/' : '/bgpConnections/'),
      );
    const parent = config.resource[udr ? 'azurerm_route_table' : 'azurerm_route_server'].ce;
    parents.set(parentId, {
      id: parentId,
      name: parent.name,
      location: f.plan.region,
      tags: structuredClone(parent.tags),
      provisioningState: 'Succeeded',
    });
    const configured = config.resource[dependency.address.split('.')[0]][dependency.address.split('.')[1]];
    const ip =
      state === 'prior' || (state === 'mixed' && index === 0)
        ? dependency.previousIp
        : current.nodes['1'].nics[String(dependency.nicIndex)].privateIp;
    rows.set(dependency.resourceId, {
      id: dependency.resourceId,
      name: configured.name,
      provisioningState: 'Succeeded',
      ...(udr
        ? { addressPrefix: configured.address_prefix, nextHopType: 'VirtualAppliance', nextHopIpAddress: ip }
        : { peerIp: ip, peerAsn: configured.peer_asn }),
    });
  }
  const control = { unavailable: false, malformed: false, reads: 0, changeAfterRead: false };
  const commands: string[][] = [];
  const api: AzExecApi = {
    async exec(command, args, options) {
      commands.push([...args]);
      const prefix = args.slice(0, 3).join(' ');
      const parent = prefix === `network ${mode === 'udr' ? 'route-table' : 'routeserver'} show`;
      const item =
        prefix === `network ${mode === 'udr' ? 'route-table route' : 'routeserver peering'}` && args[3] === 'show';
      if (!parent && !item) return await f.api.exec(command, args, options);
      control.reads++;
      if (control.unavailable) return { exitCode: 1, stdout: '', stderr: 'synthetic-private-marker' };
      if (control.malformed) return { exitCode: 0, stdout: 'synthetic-private-marker', stderr: '' };
      const id = args[args.indexOf('--ids') + 1],
        value = (parent ? parents : rows).get(id);
      const stdout = value === undefined ? 'null' : JSON.stringify(value);
      if (control.changeAfterRead && item && value) value[mode === 'udr' ? 'nextHopIpAddress' : 'peerIp'] = '10.99.0.5';
      return { exitCode: 0, stdout, stderr: '' };
    },
  };
  const applied = f.plan.nics.map((nic) => `1:${nic.index}`),
    controller = new AbortController();
  const observe = () =>
    collectAzureTerraformNetworkRoutingConfiguration(
      f.plan,
      source,
      before,
      current,
      1,
      applied,
      api,
      controller.signal,
    );
  return {
    ...f,
    before,
    current,
    source,
    prepared,
    parents,
    rows,
    control,
    commands,
    api,
    applied,
    controller,
    observe,
  };
}
for (const mode of ['udr', 'route-server'] as const)
  for (const state of ['prior', 'current'] as const)
    test(`${mode} reports exact current owned ${state} configuration without claiming operational health`, async () => {
      const f = await fixture(mode, state),
        result = await f.observe();
      expect(result.status).toBe('observed');
      expect(result.configurationState).toBe(state);
      expect(result.rows).toHaveLength(mode === 'udr' ? 2 : 1);
      expect(result.forwarding).toBe('unknown');
      expect(result.interfaceState).toBe('unknown');
      expect(result.bgpExchange).toBe('unknown');
      expect(result.nodeHealth).toBe('unknown');
      expect(result.freshness).toBe('unqualified');
      expect(f.mutations()).toBe(0);
      expect(f.control.reads).toBe(mode === 'udr' ? 6 : 4);
      const rowReads = f.commands.filter((args) => args[3] === 'show');
      for (const args of rowReads)
        expect(args.slice(-4)).toEqual(['--subscription', f.plan.subscription.id, '--output', 'json']);
      for (const row of result.rows) expect(row.nic).toEqual(f.current.nodes['1'].nics[String(row.nicIndex)]);
    });
test('complete current UDR observations preserve mixed prior/current installation state', async () => {
  const f = await fixture('udr', 'mixed'),
    result = await f.observe();
  expect(result.status).toBe('observed');
  expect(result.configurationState).toBe('mixed');
  expect(result.rows.map((row) => row.state)).toEqual(['prior', 'current']);
});
for (const mode of ['udr', 'route-server'] as const)
  for (const target of ['parent', 'row'] as const)
    for (const [key, value] of Object.entries({
      id: 'foreign',
      name: 'foreign',
      provisioningState: 'Updating',
      error: {},
      nextLink: '/next-page',
    }))
      test(`${mode} rejects ${target} ${key} evidence`, async () => {
        const f = await fixture(mode),
          selected = (target === 'parent' ? f.parents : f.rows).values().next().value;
        expect(selected).toBeDefined();
        (selected as Record<string, unknown>)[key] = value;
        const result = await f.observe();
        expect(result.status).toBe('unknown');
        expect(result.rows).toEqual([]);
      });
for (const mode of ['udr', 'route-server'] as const)
  for (const [key, value] of Object.entries({
    'xcsh-managed-by': 'foreign',
    'xcsh-execution-engine': 'native',
    'xcsh-deployment-id': 'foreign',
    'xcsh-plan-sha256': 'f'.repeat(64),
  }))
    test(`${mode} rejects foreign parent ${key} owner`, async () => {
      const f = await fixture(mode),
        parent = f.parents.values().next().value as Record<string, unknown>;
      (parent.tags as Record<string, unknown>)[key] = value;
      expect((await f.observe()).status).toBe('unknown');
    });
for (const mode of ['udr', 'route-server'] as const)
  for (const label of [
    'missingParent',
    'missingRow',
    'unavailable',
    'malformed',
    'changedRead',
    'foreignCloud',
    'foreignAddress',
    'missingAddress',
    'wrongPrefixOrAsn',
  ])
    test(`${mode} rejects ${label} with sanitized unknown evidence`, async () => {
      const f = await fixture(mode),
        row = f.rows.values().next().value as Record<string, unknown>;
      if (label === 'missingParent') f.parents.clear();
      if (label === 'missingRow') f.rows.clear();
      if (label === 'unavailable') f.control.unavailable = true;
      if (label === 'malformed') f.control.malformed = true;
      if (label === 'changedRead') f.control.changeAfterRead = true;
      if (label === 'foreignCloud') f.state.wrongAccount = true;
      if (label === 'foreignAddress') row[mode === 'udr' ? 'nextHopIpAddress' : 'peerIp'] = '10.99.0.5';
      if (label === 'missingAddress') delete row[mode === 'udr' ? 'nextHopIpAddress' : 'peerIp'];
      if (label === 'wrongPrefixOrAsn')
        row[mode === 'udr' ? 'addressPrefix' : 'peerAsn'] = mode === 'udr' ? '10.99.0.0/24' : 64555;
      const result = await f.observe();
      expect(result.status).toBe('unknown');
      expect(result.configurationState).toBe('unknown');
      expect(JSON.stringify(result)).not.toContain('synthetic-private-marker');
      expect(f.mutations()).toBe(0);
    });
for (const label of ['originalInputs', 'executor', 'newCloudIdentity'])
  test(`current routing observation rejects ${label} change during collection`, async () => {
    const f = await fixture(),
      original = f.api.exec;
    let replacementCalls = 0;
    f.api.exec = async (command, args, options) => {
      const result = await original(command, args, options);
      if (args.slice(0, 3).join(' ') === 'network route-table show') {
        if (label === 'originalInputs') f.current.nodes['1'].nics['1'].privateIp = '10.20.2.88';
        if (label === 'executor')
          f.api.exec = async () => {
            replacementCalls++;
            return result;
          };
        if (label === 'newCloudIdentity') f.config(f.sliNic).privateIPAddress = '10.20.2.88';
      }
      return result;
    };
    const result = await f.observe();
    expect(result.status).toBe('unknown');
    expect(result.rows).toEqual([]);
    expect(replacementCalls).toBe(0);
  });
test('routing configuration cancellation races an Azure executor that ignores its signal', async () => {
  const f = await fixture(),
    original = f.api.exec;
  f.api.exec = async (command, args, options) => {
    if (args.slice(0, 3).join(' ') === 'network route-table show') {
      expect(options?.signal?.aborted).toBe(false);
      f.controller.abort(Error('synthetic cancellation'));
      return await new Promise<never>(() => {});
    }
    return await original(command, args, options);
  };
  await expect(f.observe()).rejects.toThrow('synthetic cancellation');
  expect(f.mutations()).toBe(0);
});
test('missing expected routing dependencies are explicit not-required after current cloud identity checks', async () => {
  const f = networkUpdateFixture(false, 'terraform', false, false),
    before = await captureAzureNetworkUpdateInventory(f.plan, f.api);
  const result = await collectAzureTerraformNetworkRoutingConfiguration(
    f.plan,
    f.source(),
    before,
    before,
    1,
    [],
    f.api,
  );
  expect(result.status).toBe('not-required');
  expect(result.configurationState).toBe('not-required');
  expect(result.rows).toEqual([]);
  expect(result.forwarding).toBe('unknown');
  expect(f.mutations()).toBe(0);
});

for (const mode of ['udr', 'route-server'] as const)
  for (const label of [
    'ipv6',
    'unresolvedIp',
    'missingState',
    'lowercaseState',
    'wrongRegion',
    'missingOwner',
    'wrongTypeOrStringAsn',
  ])
    test(`${mode} rejects ${label} exact configuration spelling or identity`, async () => {
      const f = await fixture(mode),
        row = f.rows.values().next().value as Record<string, unknown>,
        parent = f.parents.values().next().value as Record<string, unknown>;
      if (label === 'ipv6') row[mode === 'udr' ? 'nextHopIpAddress' : 'peerIp'] = '2001:db8::1';
      if (label === 'unresolvedIp') row[mode === 'udr' ? 'nextHopIpAddress' : 'peerIp'] = '__IP__';
      if (label === 'missingState') delete row.provisioningState;
      if (label === 'lowercaseState') row.provisioningState = 'succeeded';
      if (label === 'wrongRegion') parent.location = 'foreign';
      if (label === 'missingOwner') delete parent.tags;
      if (label === 'wrongTypeOrStringAsn')
        row[mode === 'udr' ? 'nextHopType' : 'peerAsn'] = mode === 'udr' ? 'Internet' : '65010';
      const result = await f.observe();
      expect(result.status).toBe('unknown');
      expect(result.rows).toEqual([]);
    });
for (const target of ['plannedProgress', 'malformedSource', 'unqualifiedSource'] as const)
  test(`routing observation refuses ${target} before cloud reads`, async () => {
    const f = await fixture();
    f.commands.length = 0;
    if (target === 'plannedProgress') f.applied.splice(1, 1);
    const source =
      target === 'malformedSource'
        ? 'synthetic-private-marker'
        : target === 'unqualifiedSource'
          ? f.source.replace('ce-route-1', 'foreign')
          : f.source;
    await expect(
      collectAzureTerraformNetworkRoutingConfiguration(f.plan, source, f.before, f.current, 1, f.applied, f.api),
    ).rejects.toThrow();
    expect(f.commands).toEqual([]);
    expect(f.mutations()).toBe(0);
  });
test('returned routing collection time never establishes original heartbeat freshness', async () => {
  const f = await fixture(),
    row = f.rows.values().next().value as Record<string, unknown>;
  row.timestamp = new Date().toISOString();
  row.createdAt = new Date().toISOString();
  const result = await f.observe();
  expect(result.status).toBe('observed');
  expect(result.freshness).toBe('unqualified');
  expect(result.rows.every((value) => !('timestamp' in value) && !('createdAt' in value))).toBe(true);
});

test('Route Server complete peer set cannot disappear into not-required evidence', async () => {
  const f = await fixture('route-server'),
    source = JSON.parse(f.source);
  delete source.resource.azurerm_route_server_bgp_connection;
  delete source.output.ce_route_server_peers;
  f.commands.length = 0;
  await expect(
    collectAzureTerraformNetworkRoutingConfiguration(
      f.plan,
      JSON.stringify(source),
      f.before,
      f.current,
      1,
      f.applied,
      f.api,
    ),
  ).rejects.toThrow('complete retained CE peer set required');
  expect(f.commands).toEqual([]);
});
