import { expect, test } from 'bun:test';
import type { AzExecApi } from '../../src/az/exec';
import { compileAzureCePlan } from '../../src/ce/planner';
import { collectAzureRouteServerHealth, discoverAzureRouteServerIdentity } from '../../src/ce/route-server-health';
import { intent, observation } from './fixtures';

function fixture(destinationCidrs = ['10.250.0.10/32']) {
  const plan = compileAzureCePlan(
    {
      ...intent,
      routing: { mode: 'route-server', destinationCidrs, localAsn: 64512 },
    },
    observation,
  );
  const action = (kind: string) => {
    const matches = plan.actions.filter((candidate) => candidate.kind === kind);
    if (matches.length !== 1 || !matches[0].resourceId) throw new Error(`missing ${kind}`);
    return matches[0];
  };
  const server = action('route-server-create');
  const peer = action('route-server-peer-create');
  const nic = action('nic-create');
  const vm = action('vm-create');
  const peerIp = '10.20.0.4';
  const tags = {
    'xcsh-managed-by': 'azure-ce',
    'xcsh-deployment-id': plan.deploymentName,
    'xcsh-execution-engine': plan.engine,
    'xcsh-plan-sha256': plan.planSha256,
  };
  let learned: unknown = {
    RouteServiceRole_IN_0: destinationCidrs.map((network) => ({ network, nextHop: peerIp })),
    RouteServiceRole_IN_1: destinationCidrs.map((network) => ({ network, nextHop: peerIp })),
  };
  let routeServerTags: Record<string, string> = tags;
  const api: AzExecApi = {
    async exec(_command, args) {
      let value: unknown;
      if (args[0] === 'vm')
        value = {
          id: vm.resourceId,
          provisioningState: 'Succeeded',
          tags,
          networkProfile: { networkInterfaces: [{ id: nic.resourceId }] },
        };
      else if (args[0] === 'network' && args[1] === 'nic')
        value = {
          id: nic.resourceId,
          provisioningState: 'Succeeded',
          tags,
          virtualMachine: { id: vm.resourceId },
          macAddress: '00-11-22-33-44-55',
          ipConfigurations: [
            {
              primary: true,
              privateIPAddressVersion: 'IPv4',
              privateIPAddress: peerIp,
              subnet: { id: plan.nics[0].subnet.resourceId },
            },
          ],
        };
      else if (args.includes('list-learned-routes')) value = learned;
      else if (args.includes('peering'))
        value = {
          id: peer.resourceId,
          name: `${plan.deploymentName}-1`,
          provisioningState: 'Succeeded',
          peerAsn: plan.routing.localAsn,
          peerIp,
        };
      else
        value = {
          id: server.resourceId,
          location: plan.region,
          provisioningState: 'Succeeded',
          virtualRouterAsn: 65515,
          virtualRouterIps: ['10.255.0.4', '10.255.0.5'],
          tags: routeServerTags,
        };
      return { exitCode: 0, stderr: '', stdout: JSON.stringify(value) };
    },
  };
  return {
    plan,
    api,
    setLearned(value: unknown) {
      learned = value;
    },
    setRouteServerTags(value: Record<string, string>) {
      routeServerTags = value;
    },
  };
}

test('binds both Route Server service-role route exchanges to the authoritative SLO address', async () => {
  const { plan, api } = fixture();
  expect(await discoverAzureRouteServerIdentity(plan, api)).toEqual({
    routeServerId: plan.actions.find((action) => action.kind === 'route-server-create')?.resourceId,
    asn: 65515,
    serviceAddresses: ['10.255.0.4', '10.255.0.5'],
  });
  expect(await collectAzureRouteServerHealth(plan, api)).toMatchObject({
    status: 'healthy',
    routeExchange: 'healthy',
    sessions: 'unknown',
    sessionReason: 'platform-bgp-session-evidence-required',
    effectiveRoutes: 'unknown',
    traffic: 'unknown',
    serviceAddresses: ['10.255.0.4', '10.255.0.5'],
    peers: [
      {
        node: 1,
        peerIp: '10.20.0.4',
        peerAsn: 64512,
        roles: [
          { role: 'RouteServiceRole_IN_0', matchedPrefixes: ['10.250.0.10/32'] },
          { role: 'RouteServiceRole_IN_1', matchedPrefixes: ['10.250.0.10/32'] },
        ],
      },
    ],
  });
});

test('keeps partial roles, wrong next hops, and foreign ownership unknown', async () => {
  const partial = fixture();
  partial.setLearned({ RouteServiceRole_IN_0: [{ network: '10.250.0.10/32', nextHop: '10.20.0.4' }] });
  expect(await collectAzureRouteServerHealth(partial.plan, partial.api)).toMatchObject({
    status: 'unknown',
    reason: 'route-server-evidence-unavailable',
  });
  const wrongHop = fixture();
  wrongHop.setLearned({
    RouteServiceRole_IN_0: [{ network: '10.250.0.10/32', nextHop: '10.20.0.9' }],
    RouteServiceRole_IN_1: [{ network: '10.250.0.10/32', nextHop: '10.20.0.9' }],
  });
  expect(await collectAzureRouteServerHealth(wrongHop.plan, wrongHop.api)).toMatchObject({
    status: 'unknown',
    reason: 'route-server-evidence-unavailable',
  });
  const foreign = fixture();
  foreign.setRouteServerTags({ 'xcsh-managed-by': 'azure-ce' });
  expect(await collectAzureRouteServerHealth(foreign.plan, foreign.api)).toMatchObject({
    status: 'unknown',
    reason: 'route-server-evidence-unavailable',
  });
});

test('does not claim health without an expected learned prefix', async () => {
  const { plan, api } = fixture([]);
  expect(await collectAzureRouteServerHealth(plan, api)).toMatchObject({
    status: 'unknown',
    reason: 'expected-learned-prefixes-unavailable',
    sessions: 'unknown',
  });
});
