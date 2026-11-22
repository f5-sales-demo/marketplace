import { expect } from 'bun:test';
import { createHash } from 'node:crypto';
import type { ObservedCeInterface } from '../../../platform/src/ce/interface-evidence';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import { canonicalSha256 } from '../../src/ce/canonical';
import { collectAzureReplacementBgp } from '../../src/ce/network-replacement-bgp';
import { compileAzureCePlan } from '../../src/ce/planner';
import { compileAzureTerraformNetworkUpdatePlan } from '../../src/ce/terraform-network-plan';
import { compileAzureTerraformNetworkReplacementPlan } from '../../src/ce/terraform-network-replacement-plan';
import { azureUpgradeBinding } from '../../src/ce/terraform-upgrade';
import { replacementOperationalIdentityFixture } from './network-replacement-operational-identity-fixture';
import { test } from './owned-fixture-test';
import { terraformNetworkSourceFixture } from './terraform-network-source-fixture';

async function fixture(ha = false) {
  const f = await replacementOperationalIdentityFixture(ha);
  const birth = await terraformNetworkSourceFixture(ha, false, {
    mode: 'route-server',
    localAsn: 64512,
    destinationCidrs: ['203.0.113.0/24'],
  });
  const retained = compileAzureTerraformNetworkUpdatePlan(birth.plan, birth.original);
  const plan = compileAzureTerraformNetworkReplacementPlan(
    compileAzureCePlan({ ...retained.intent, operation: 'replace-node', replacementNode: ha ? 2 : 1 }, birth.current),
    retained,
    birth.original,
  );
  const source = {
      ...structuredClone(f.binding),
      planSha256: plan.planSha256,
      originalPlanSha256: birth.original.planSha256,
      retainedPlanSha256: retained.planSha256,
    },
    identity = { ...structuredClone(f.identity), planSha256: plan.planSha256 };
  // Synthetic authenticated input only. This fixture is not saved-plan or live provenance.
  const configuration = JSON.parse(source.source);
  const tags = {
    'xcsh-managed-by': 'azure-ce',
    'xcsh-execution-engine': 'terraform',
    'xcsh-deployment-id': plan.deploymentName,
    'xcsh-plan-sha256': birth.original.planSha256,
  };
  configuration.resource.azurerm_route_server = { ce: { tags } };
  source.source = JSON.stringify(configuration);
  source.sourceConfigurationSha256 = createHash('sha256').update(source.source).digest('hex');
  identity.sourceBindingSha256 = canonicalSha256(source);
  const binding = azureUpgradeBinding(plan),
    addresses = ['10.0.2.4', '10.0.2.5'];
  const physical: ObservedCeInterface[] = binding.nodes.flatMap((node, i) =>
    plan.nics.map((nic) => {
      if (nic.role !== 'slo' && nic.role !== 'sli') throw Error('Synthetic physical role missing');
      return {
        node,
        role: nic.role,
        mac: identity.nodes[String(i + 1)].nics[String(nic.index)].mac,
        device: nic.role === 'slo' ? 'eth0' : 'eth1',
        interfaceName: node + '-' + nic.role,
        linkUp: true,
        mtu: 1500,
        ipv4: null,
      };
    }),
  );
  const state = { fault: '', cloudCalls: 0, ceCalls: 0, peerReads: 0, serverReads: 0 };
  const serverId =
    '/subscriptions/' +
    plan.subscription.id +
    '/resourceGroups/' +
    plan.intent.resourceGroup +
    '/providers/Microsoft.Network/virtualHubs/' +
    plan.deploymentName +
    '-rs';
  const cloud = {
    async exec(_bin: string, args: string[], options?: { signal?: AbortSignal }) {
      state.cloudCalls++;
      if (state.fault === 'auth') return { exitCode: 1, stdout: 'BGP_PRIVATE_SENTINEL', stderr: '' };
      if (state.fault === 'cancel') return new Promise<never>(() => {});
      options?.signal?.throwIfAborted();
      const name = args[args.indexOf('--name') + 1],
        node = Number(name.split('-').at(-1));
      const slo = plan.nics.find((nic) => nic.role === 'slo');
      if (!slo) throw Error('SLO absent');
      let value: Record<string, unknown>;
      if (args[2] === 'show') {
        state.serverReads++;
        value = {
          id: serverId,
          location: plan.region,
          provisioningState: 'Succeeded',
          virtualRouterAsn: 65515,
          virtualRouterIps: addresses,
          tags: structuredClone(tags),
        };
        if (state.fault === 'server-owner') value.tags = { ...tags, 'xcsh-plan-sha256': 'f'.repeat(64) };
        if (state.fault === 'server-id' || (state.fault === 'late-server' && state.serverReads > 1))
          value.id = 'foreign';
        if (state.fault === 'server-address') value.virtualRouterIps = [addresses[0], addresses[0]];
      } else if (args[3] === 'show') {
        state.peerReads++;
        value = {
          id: serverId + '/bgpConnections/' + name,
          name,
          provisioningState: 'Succeeded',
          peerAsn: plan.routing.localAsn,
          peerIp: identity.nodes[String(node)].nics[String(slo.index)].privateIp,
        };
        if (state.fault === 'peer-id' || (state.fault === 'late-peer' && state.ceCalls > 0)) value.id = 'foreign';
        if (state.fault === 'peer-ip') value.peerIp = '192.0.2.99';
        if (state.fault === 'peer-asn') value.peerAsn = 1;
      } else {
        const routes = plan.routing.destinationCidrs.map((network) => ({
          network,
          nextHop: identity.nodes[String(node)].nics[String(slo.index)].privateIp,
        }));
        value = { RouteServiceRole_IN_0: structuredClone(routes), RouteServiceRole_IN_1: structuredClone(routes) };
        if (state.fault === 'role-missing') delete value.RouteServiceRole_IN_1;
        if (state.fault === 'learned-partial') value.nextLink = 'private-next';
        if (state.fault === 'learned-duplicate') value.RouteServiceRole_IN_0 = [...routes, routes[0]];
        if (state.fault === 'learned-malformed')
          value.RouteServiceRole_IN_0 = [...routes, { network: 'bad', nextHop: '10.0.0.1' }];
        if (state.fault === 'learned-missing') value.RouteServiceRole_IN_0 = [];
      }
      if (state.fault === 'callback')
        runtime.observeBgpRoutes = async () => {
          throw Error('changed');
        };
      if (state.fault === 'source-race') source.source += ' ';
      return { exitCode: 0, stdout: JSON.stringify(value), stderr: '' };
    },
  };
  const runtime: Partial<Pick<CeRuntime, 'observeBgpSessions' | 'observeBgpRoutes'>> = {
    async observeBgpSessions(_binding, wanted) {
      state.ceCalls++;
      if (state.fault === 'service') throw Error('BGP_PRIVATE_SENTINEL');
      const sessions = wanted.map((target) => ({
        ...target,
        state: 'Established',
        receivedPrefixCount: 1,
        advertisedPrefixCount: 1,
        stateChangedAt: '2020-01-01T00:00:00Z',
      }));
      if (state.fault === 'session-partial') sessions.pop();
      if (state.fault === 'session-duplicate') sessions[1] = sessions[0];
      if (state.fault === 'session-interface') sessions[0].interfaceName = 'foreign';
      if (state.fault === 'session-peer') sessions[0].peerAddress = '192.0.2.99';
      if (state.fault === 'session-state') sessions[0].state = 'Bogus';
      if (state.fault === 'session-unknown') sessions[0].state = 'Unknown';
      if (state.fault === 'session-down') sessions[0].state = 'Idle';
      if (state.fault === 'session-count') sessions[0].receivedPrefixCount = -1;
      if (state.fault === 'session-time') sessions[0].stateChangedAt = 'bad';
      const established = sessions.filter((row) => row.state === 'Established').length;
      return {
        owner:
          state.fault === 'session-owner' ? { ...binding.owner, account: 'example-foreign-account' } : binding.owner,
        siteName: binding.siteName,
        status: established === wanted.length ? 'healthy' : 'degraded',
        expectedSessions: wanted.length,
        establishedSessions: established,
        sessions,
        source: 'synthetic',
        observedAt: new Date().toISOString(),
        contractFingerprint: 'synthetic',
      };
    },
    async observeBgpRoutes() {
      state.ceCalls++;
      if (state.fault === 'route-service') throw Error('BGP_PRIVATE_SENTINEL');
      const nodes = binding.nodes.map((node) => ({
        node,
        routingInstances: [
          {
            name: 'default',
            tables: [
              {
                name: 'inet.0',
                imported: ['192.0.2.0/24'],
                exported: ['203.0.113.0/24'],
              },
            ],
          },
        ],
      }));
      if (state.fault === 'route-node') nodes[0].node = 'foreign';
      if (state.fault === 'route-partial') nodes.pop();
      if (state.fault === 'route-empty') nodes[0].routingInstances = [];
      if (state.fault === 'route-duplicate') nodes[0].routingInstances.push(nodes[0].routingInstances[0]);
      if (state.fault === 'route-table') nodes[0].routingInstances[0].tables = [];
      if (state.fault === 'route-prefix') nodes[0].routingInstances[0].tables[0].imported.push('bad');
      if (state.fault === 'route-prefix-duplicate')
        nodes[0].routingInstances[0].tables[0].exported.push('203.0.113.0/24');
      return {
        owner: state.fault === 'route-owner' ? { ...binding.owner, account: 'example-foreign-account' } : binding.owner,
        siteName: binding.siteName,
        status: 'observed',
        nodes,
        source: 'synthetic',
        observedAt: new Date().toISOString(),
        contractFingerprint: 'synthetic',
        pathInventory: {
          status: 'unknown',
          reason: 'synthetic',
          scope: 'unqualified',
          freshness: 'unqualified',
          traffic: 'unknown',
        },
      };
    },
  };
  const run = (signal?: AbortSignal) =>
    collectAzureReplacementBgp(plan, identity, source, physical, cloud, runtime, signal);
  return { ...f, plan, source, identity, physical, runtime, cloud, state, run };
}

for (const ha of [false, true])
  test(`replacement BGP ${ha ? 'HA' : 'single'} joins every SLO and both service roles without operational promotion`, async () => {
    const f = await fixture(ha),
      result = await f.run();
    expect(result).toMatchObject({
      status: 'observed',
      originalSampleFreshness: 'unqualified',
      traffic: 'unknown',
      operationalAcceptance: 'unknown',
      routeExchange: { status: 'healthy' },
      sessions: { status: 'healthy', expectedSessions: ha ? 6 : 2 },
      routes: { status: 'observed' },
    });
    expect(f.state.peerReads).toBe(2 * f.plan.topology.nodeCount);
    expect(JSON.stringify(result)).not.toContain('BGP_PRIVATE_SENTINEL');
  }, 60000);

for (const fault of [
  'server-owner',
  'server-id',
  'server-address',
  'peer-id',
  'peer-ip',
  'peer-asn',
  'role-missing',
  'learned-partial',
  'learned-duplicate',
  'learned-malformed',
  'learned-missing',
  'late-server',
  'late-peer',
  'session-owner',
  'session-partial',
  'session-duplicate',
  'session-interface',
  'session-peer',
  'session-state',
  'session-unknown',
  'session-down',
  'session-count',
  'session-time',
  'route-owner',
  'route-node',
  'route-partial',
  'route-empty',
  'route-duplicate',
  'route-table',
  'route-prefix',
  'route-prefix-duplicate',
  'auth',
  'service',
  'route-service',
])
  test(`replacement BGP ${fault} stays unknown`, async () => {
    const f = await fixture();
    f.state.fault = fault;
    const result = await f.run();
    expect(result.status).toBe('unknown');
    expect(result.operationalAcceptance).toBe('unknown');
    expect(JSON.stringify(result)).not.toContain('BGP_PRIVATE_SENTINEL');
  }, 60000);

for (const fault of [
  'source-hash',
  'source-site',
  'physical-mac',
  'physical-partial',
  'physical-device',
  'callback',
  'source-race',
])
  test(`replacement BGP rejects ${fault}`, async () => {
    const f = await fixture();
    if (fault === 'source-hash') f.identity.sourceBindingSha256 = 'f'.repeat(64);
    else if (fault === 'source-site') {
      f.source.site.siteUid = 'foreign';
      f.identity.sourceBindingSha256 = canonicalSha256(f.source);
    } else if (fault === 'physical-mac') f.physical[0].mac = '02:00:00:00:00:99';
    else if (fault === 'physical-partial') f.physical.pop();
    else if (fault === 'physical-device') f.physical[1].device = f.physical[0].device;
    else f.state.fault = fault;
    await expect(f.run()).rejects.toThrow();
    if (!['callback', 'source-race'].includes(fault)) expect(f.state.cloudCalls).toBe(0);
  }, 60000);

test('replacement BGP aborts an ignored cloud read and rejects an already aborted request', async () => {
  const f = await fixture();
  f.state.fault = 'cancel';
  const abort = new AbortController();
  const promise = f.run(abort.signal);
  setTimeout(() => abort.abort(Error('cancelled')), 20);
  await expect(promise).rejects.toThrow('cancelled');
  const calls = f.state.cloudCalls;
  await expect(f.run(abort.signal)).rejects.toThrow('cancelled');
  expect(f.state.cloudCalls).toBe(calls);
}, 60000);
