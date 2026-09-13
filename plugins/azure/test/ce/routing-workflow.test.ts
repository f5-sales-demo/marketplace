import { expect, test } from 'bun:test';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { AzExecApi } from '../../src/az/exec';
import { compileAzureCePlan } from '../../src/ce/planner';
import { collectAzureRouteServerFailoverHealth } from '../../src/ce/route-server-health';
import { configureAzureRouteServerRouting } from '../../src/ce/routing-workflow';
import { intent, observation } from './fixtures';

function fixture() {
  const plan = compileAzureCePlan(
    { ...intent, routing: { mode: 'route-server', destinationCidrs: ['10.250.0.10/32'], localAsn: 64512 } },
    observation,
  );
  const action = (kind: string) => {
    const selected = plan.actions.find((candidate) => candidate.kind === kind);
    if (!selected?.resourceId) throw new Error(`missing ${kind}`);
    return selected;
  };
  const server = action('route-server-create');
  const peer = action('route-server-peer-create');
  const nic = action('nic-create');
  const vm = action('vm-create');
  const tags = {
    'xcsh-managed-by': 'azure-ce',
    'xcsh-deployment-id': plan.deploymentName,
    'xcsh-execution-engine': plan.engine,
    'xcsh-plan-sha256': plan.planSha256,
  };
  const api: AzExecApi = {
    async exec(_command, args) {
      const peerIp = '10.20.0.4';
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
              subnet: {
                id:
                  plan.nics[0].subnet.resourceId ??
                  plan.actions.find(
                    (action) => action.kind === 'subnet-create' && action.resourceId?.endsWith('/subnets/slo'),
                  )?.resourceId,
              },
            },
          ],
        };
      else if (args.includes('list-learned-routes'))
        value = {
          RouteServiceRole_IN_0: [{ network: '10.250.0.10/32', nextHop: peerIp }],
          RouteServiceRole_IN_1: [{ network: '10.250.0.10/32', nextHop: peerIp }],
        };
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
          tags,
        };
      return { exitCode: 0, stderr: '', stdout: JSON.stringify(value) };
    },
  };
  return { plan, api };
}

test('discovers SLO objects and Route Server addresses before durable BGP creation and session collection', async () => {
  const { plan, api } = fixture();
  const events: string[] = [];
  const runtime = {
    async observeAzureInterfaces(_binding: unknown, expected: Array<{ node: string; role: string; mac: string }>) {
      events.push('interfaces');
      return {
        status: 'observed',
        observedAt: '2026-09-10T12:00:00Z',
        interfaces: expected.map((item) => ({
          ...item,
          device: item.role === 'slo' ? 'eth0' : 'eth1',
          interfaceName: item.role === 'slo' ? 'authoritative-slo' : 'authoritative-sli',
          mtu: 1500,
          linkUp: true,
          ipv4: null,
        })),
      };
    },
    async ensureAzureRouting(
      _binding: unknown,
      localAsn: number,
      remoteAsn: number,
      interfaces: unknown,
      addresses: unknown,
      checkpoint: (record: Record<string, unknown>) => Promise<void>,
    ) {
      events.push('ensure');
      expect({ localAsn, remoteAsn, interfaces, addresses }).toEqual({
        localAsn: 64512,
        remoteAsn: 65515,
        interfaces: [{ node: `${plan.deploymentName}-1`, interfaceName: 'authoritative-slo' }],
        addresses: ['10.255.0.4', '10.255.0.5'],
      });
      await checkpoint({ kind: 'bgp', uid: 'routing-uid' });
    },
    async observeBgpSessions(_binding: unknown, expected: unknown[]) {
      events.push('sessions');
      expect(expected).toHaveLength(2);
      return { status: 'healthy', establishedSessions: 2, expectedSessions: 2, sessions: expected };
    },
    async observeBgpRoutes() {
      events.push('routes');
      return { status: 'observed', nodes: [{ node: `${plan.deploymentName}-1`, routingInstances: [] }] };
    },
  } as unknown as Pick<
    CeRuntime,
    'observeAzureInterfaces' | 'ensureAzureRouting' | 'observeBgpSessions' | 'observeBgpRoutes'
  >;
  const storage = {
    async verify() {
      events.push('verify');
    },
    async write(name: string) {
      events.push(`write:${name}`);
    },
  };
  const result = await configureAzureRouteServerRouting(
    plan,
    [{ node: `${plan.deploymentName}-1`, role: 'slo', mac: '00:11:22:33:44:55' }],
    runtime,
    storage,
    api,
  );
  expect(result).toMatchObject({
    status: 'healthy',
    sessions: { establishedSessions: 2 },
    routeExchange: 'healthy',
    effectiveRoutes: { status: 'observed' },
  });
  expect(events).toEqual([
    'verify',
    'interfaces',
    'ensure',
    'write:platform-routing.json',
    'sessions',
    'routes',
    'write:route-server-health.json',
  ]);
});

test('proves exact three-node Route Server withdrawal and restoration from both service roles', async () => {
  const selected = structuredClone(intent);
  selected.topology.ha = true;
  selected.routing = { mode: 'route-server', destinationCidrs: ['10.250.0.10/32'], localAsn: 64512 };
  const observed = structuredClone(observation);
  observed.regions[0].quotaAvailable = 24;
  const plan = compileAzureCePlan(selected, observed);
  const server = plan.actions.find((action) => action.kind === 'route-server-create');
  if (!server?.resourceId) throw new Error('missing Route Server');
  const tags = {
    'xcsh-managed-by': 'azure-ce',
    'xcsh-deployment-id': plan.deploymentName,
    'xcsh-execution-engine': plan.engine,
    'xcsh-plan-sha256': plan.planSha256,
  };
  let phase: 'outage' | 'recovered' = 'outage';
  let staleSelected = false;
  const api: AzExecApi = {
    async exec(_command, args) {
      const idIndex = args.indexOf('--ids');
      const nameIndex = args.indexOf('--name');
      const target = String(idIndex >= 0 ? args[idIndex + 1] : nameIndex >= 0 ? args[nameIndex + 1] : '');
      const node = Number(new RegExp(`${plan.deploymentName}-(\\d+)`).exec(target)?.[1]);
      const vm = plan.actions.find((action) => action.kind === 'vm-create' && action.node === node);
      const nic = plan.actions.find((action) => action.kind === 'nic-create' && action.node === node);
      const peer = plan.actions.find((action) => action.kind === 'route-server-peer-create' && action.node === node);
      const peerIp = `10.20.0.${node + 3}`;
      let value: unknown;
      if (args[0] === 'vm')
        value = {
          id: vm?.resourceId,
          provisioningState: 'Succeeded',
          tags,
          networkProfile: { networkInterfaces: [{ id: nic?.resourceId }] },
        };
      else if (args[0] === 'network' && args[1] === 'nic')
        value = {
          id: nic?.resourceId,
          provisioningState: 'Succeeded',
          tags,
          virtualMachine: { id: vm?.resourceId },
          macAddress: `00-11-22-33-44-0${node}`,
          ipConfigurations: [
            {
              primary: true,
              privateIPAddressVersion: 'IPv4',
              privateIPAddress: peerIp,
              subnet: { id: plan.nics[0].subnet.resourceId },
            },
          ],
        };
      else if (args.includes('list-learned-routes')) {
        const present = phase === 'recovered' || node !== 1 || staleSelected;
        const routes = present ? [{ network: '10.250.0.10/32', nextHop: peerIp }] : [];
        value = { RouteServiceRole_IN_0: routes, RouteServiceRole_IN_1: routes };
      } else if (args.includes('peering'))
        value = {
          id: peer?.resourceId,
          name: `${plan.deploymentName}-${node}`,
          provisioningState: 'Succeeded',
          peerAsn: 64512,
          peerIp,
        };
      else
        value = {
          id: server.resourceId,
          location: plan.region,
          provisioningState: 'Succeeded',
          virtualRouterAsn: 65515,
          virtualRouterIps: ['10.255.0.4', '10.255.0.5'],
          tags,
        };
      return { exitCode: 0, stderr: '', stdout: JSON.stringify(value) };
    },
  };
  const outage = await collectAzureRouteServerFailoverHealth(plan, 1, 'outage', api);
  expect(outage).toMatchObject({ status: 'healthy', expectedEstablishedSessions: 4 });
  expect(outage.peers[0]).toMatchObject({
    node: 1,
    roles: [{ matchedPrefixes: [] }, { matchedPrefixes: [] }],
  });
  phase = 'recovered';
  expect(await collectAzureRouteServerFailoverHealth(plan, 1, 'recovered', api)).toMatchObject({
    status: 'healthy',
    expectedEstablishedSessions: 6,
  });
  phase = 'outage';
  staleSelected = true;
  await expect(collectAzureRouteServerFailoverHealth(plan, 1, 'outage', api)).rejects.toThrow(/has not converged/);
});
