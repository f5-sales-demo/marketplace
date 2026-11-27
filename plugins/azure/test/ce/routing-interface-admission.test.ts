import { expect, test } from 'bun:test';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { AzExecApi } from '../../src/az/exec';
import { compileAzureCePlan } from '../../src/ce/planner';
import { configureAzureRouteServerRouting } from '../../src/ce/routing-workflow';
import { intent, observation } from './fixtures';

type MutableObservation = {
  status: string;
  freshness?: string;
  canSatisfyInterfaceMutationGate?: boolean;
  observedAt: string;
  interfaces: Array<{
    node: string;
    role: string;
    mac: string;
    device: string;
    interfaceName: string;
    mtu: number;
    linkUp?: boolean;
    ipv4: null;
  }>;
};

function cloudFixture() {
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

function fixture(change: (value: MutableObservation) => void = () => {}) {
  const { plan, api } = cloudFixture();
  const expected = [{ node: plan.deploymentName + '-1', role: 'slo' as const, mac: '00:11:22:33:44:55' }];
  const reported: MutableObservation = {
    status: 'observed',
    freshness: 'verified',
    canSatisfyInterfaceMutationGate: true,
    observedAt: '2026-10-29T00:00:00Z',
    interfaces: expected.map((v) => ({
      ...v,
      device: 'eth0',
      interfaceName: 'authoritative-slo',
      mtu: 1500,
      linkUp: true,
      ipv4: null,
    })),
  };
  change(reported);
  let mutations = 0;
  let writes = 0;
  const runtime = {
    observeAzureInterfaces: async () => reported,
    ensureAzureRouting: async () => {
      mutations++;
    },
    observeBgpSessions: async () => ({ status: 'healthy' }),
    observeBgpRoutes: async () => ({ status: 'observed' }),
  } as unknown as Pick<
    CeRuntime,
    'observeAzureInterfaces' | 'ensureAzureRouting' | 'observeBgpSessions' | 'observeBgpRoutes'
  >;
  return {
    run: () =>
      configureAzureRouteServerRouting(
        plan,
        expected,
        runtime,
        {
          verify: async () => {},
          write: async () => {
            writes++;
          },
        },
        api,
      ),
    effects: () => ({ mutations, writes }),
  };
}
test('trusted qualified explicit up joins can reach Azure Route Server routing mutation', async () => {
  const f = fixture();
  await f.run();
  expect(f.effects().mutations).toBe(1);
});
for (const [name, change] of [
  [
    'unqualified up',
    (v: MutableObservation) => {
      v.freshness = 'unqualified';
      v.canSatisfyInterfaceMutationGate = false;
    },
  ],
  [
    'missing freshness',
    (v: MutableObservation) => {
      delete v.freshness;
    },
  ],
  [
    'missing eligibility',
    (v: MutableObservation) => {
      delete v.canSatisfyInterfaceMutationGate;
    },
  ],
  [
    'closed eligibility',
    (v: MutableObservation) => {
      v.canSatisfyInterfaceMutationGate = false;
    },
  ],
  [
    'unqualified with forged eligibility',
    (v: MutableObservation) => {
      v.freshness = 'unqualified';
    },
  ],
  [
    'published down',
    (v: MutableObservation) => {
      v.status = 'down';
      v.interfaces[0].linkUp = false;
    },
  ],
  [
    'up status with down link',
    (v: MutableObservation) => {
      v.interfaces[0].linkUp = false;
    },
  ],
  [
    'missing explicit link',
    (v: MutableObservation) => {
      delete v.interfaces[0].linkUp;
    },
  ],
  [
    'partial interfaces',
    (v: MutableObservation) => {
      v.interfaces = [];
    },
  ],
  [
    'duplicate interfaces',
    (v: MutableObservation) => {
      v.interfaces.push({ ...v.interfaces[0] });
    },
  ],
  [
    'foreign MAC',
    (v: MutableObservation) => {
      v.interfaces[0].mac = '02:ff:ee:dd:cc:bb';
    },
  ],
  [
    'foreign node',
    (v: MutableObservation) => {
      v.interfaces[0].node = 'foreign-1';
    },
  ],
  [
    'missing device',
    (v: MutableObservation) => {
      v.interfaces[0].device = '';
    },
  ],
  [
    'missing object identity',
    (v: MutableObservation) => {
      v.interfaces[0].interfaceName = '';
    },
  ],
] as const)
  test('Azure Route Server rejects ' + name + ' before writes', async () => {
    const f = fixture(change);
    await expect(f.run()).rejects.toThrow();
    expect(f.effects()).toEqual({ mutations: 0, writes: 0 });
  });
