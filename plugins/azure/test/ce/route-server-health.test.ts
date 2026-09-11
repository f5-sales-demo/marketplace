import { expect, test } from 'bun:test';
import type { AzExecApi } from '../../src/az/exec';
import { compileAzureCePlan } from '../../src/ce/planner';
import {
  captureAzureRouteServerOwnership,
  collectAzureRouteServerHealth,
  discoverAzureRouteServerIdentity,
} from '../../src/ce/route-server-health';
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
  let peerId = peer.resourceId as string;
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
          id: peerId,
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
    setPeerId(value: string) {
      peerId = value;
    },
  };
}

test('captures exact retained Route Server ownership and peer IDs case-insensitively', async () => {
  const selected = fixture();
  const serverId = selected.plan.actions.find((action) => action.kind === 'route-server-create')?.resourceId;
  const peerId = selected.plan.actions.find((action) => action.kind === 'route-server-peer-create')?.resourceId;
  if (!serverId || !peerId) throw new Error('Route Server fixture is incomplete');
  selected.setPeerId(peerId.toUpperCase());
  expect(await captureAzureRouteServerOwnership(selected.plan, selected.api)).toEqual({
    routeServerId: serverId,
    ownerPlanSha256: selected.plan.planSha256,
    peerIds: { '1': peerId },
  });
  selected.setPeerId(`${serverId}/bgpConnections/substituted`);
  await expect(captureAzureRouteServerOwnership(selected.plan, selected.api)).rejects.toThrow(/peer identity/);
});

test('captures all three retained Terraform Route Server peer IDs before HA replacement', async () => {
  const observed = structuredClone(observation);
  observed.regions[0].quotaAvailable = 24;
  const plan = compileAzureCePlan(
    {
      ...intent,
      engine: 'terraform',
      topology: { ha: true },
      routing: { mode: 'route-server', destinationCidrs: ['10.250.0.10/32'], localAsn: 64512 },
    },
    observed,
  );
  const server = plan.actions.find((action) => action.kind === 'route-server-create');
  const peers = plan.actions.filter((action) => action.kind === 'route-server-peer-create');
  if (!server?.resourceId || peers.length !== 3) throw new Error('HA Route Server fixture is incomplete');
  const api: AzExecApi = {
    async exec(_command, args) {
      if (args.includes('peering')) {
        const name = args[args.indexOf('--name') + 1];
        const peer = peers.find((action) => action.resourceId?.endsWith(`/bgpConnections/${name}`));
        return {
          exitCode: 0,
          stderr: '',
          stdout: JSON.stringify({
            id: peer?.resourceId?.toUpperCase(),
            name,
            provisioningState: 'Succeeded',
            peerAsn: plan.routing.localAsn,
          }),
        };
      }
      return {
        exitCode: 0,
        stderr: '',
        stdout: JSON.stringify({
          id: server.resourceId.toUpperCase(),
          location: plan.region,
          provisioningState: 'Succeeded',
          virtualRouterAsn: 65515,
          tags: {
            'xcsh-managed-by': 'azure-ce',
            'xcsh-execution-engine': 'terraform',
            'xcsh-deployment-id': plan.deploymentName,
            'xcsh-plan-sha256': 'a'.repeat(64),
          },
        }),
      };
    },
  };
  expect(await captureAzureRouteServerOwnership(plan, api)).toEqual({
    routeServerId: server.resourceId,
    ownerPlanSha256: 'a'.repeat(64),
    peerIds: Object.fromEntries(peers.map((peer) => [String(peer.node), peer.resourceId])),
  });
});

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
