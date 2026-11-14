import { expect, test } from 'bun:test';
import type { AwsGreBinding } from '../../../platform/src/ce/wire-routing';
import { configureAwsRouting } from '../../src/ce/routing-apply';
import type { AwsCeCheckpoint, AwsCePlan } from '../../src/ce/types';

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

function fixture(change: (value: MutableObservation) => void = () => {}) {
  const id = 'tgw-connect-peer-0123456789abcdef0';
  const attachment = 'tgw-attach-0123456789abcdef0';
  const mac = 'aa:bb:cc:dd:ee:ff';
  const plan = {
    accountId: '123456789012',
    region: 'us-east-1',
    deploymentName: 'demo',
    siteName: 'site-a',
    engine: 'native',
    topology: { nodeCount: 1 },
    intent: { siteName: 'site-a', topology: { nodeCount: 1 } },
    routing: { customerAsn: 65010, transitGatewayAsn: 64512 },
    actions: [
      {
        kind: 'tgw-connect-peer-create',
        node: 1,
        capture: { placeholder: '__PEER__' },
        args: [
          'ec2',
          'create-transit-gateway-connect-peer',
          '--inside-cidr-blocks',
          '169.254.10.0/29',
          '--peer-address',
          '__NODE_1_SLO_IP__',
          '--transit-gateway-attachment-id',
          '__ATTACHMENT__',
        ],
      },
    ],
  } as AwsCePlan;
  const state = {
    resolvedValues: { __PEER__: id, __ATTACHMENT__: attachment, __NODE_1_SLO_IP__: '10.0.0.1', __ENI_1_0_MAC__: mac },
  } as unknown as AwsCeCheckpoint;
  const tags = [
    { Key: 'xcsh-managed-by', Value: 'aws-ce' },
    { Key: 'xcsh-deployment-id', Value: 'demo' },
    { Key: 'xcsh-execution-engine', Value: 'native' },
  ];
  const api = {
    exec: async (_command: string, args: string[]) => ({
      exitCode: 0,
      stderr: '',
      stdout: JSON.stringify(
        args[0] === 'sts'
          ? { Account: plan.accountId }
          : {
              TransitGatewayConnectPeers: [
                {
                  TransitGatewayConnectPeerId: id,
                  TransitGatewayAttachmentId: attachment,
                  State: 'available',
                  Tags: tags,
                  ConnectPeerConfiguration: {
                    PeerAddress: '10.0.0.1',
                    TransitGatewayAddress: '100.64.0.1',
                    Protocol: 'gre',
                    InsideCidrBlocks: ['169.254.10.0/29'],
                    BgpConfigurations: [2, 3].map((last) => ({
                      TransitGatewayAddress: `169.254.10.${last}`,
                      PeerAddress: '169.254.10.1',
                      TransitGatewayAsn: 64512,
                      PeerAsn: 65010,
                      BgpStatus: 'down',
                    })),
                  },
                },
              ],
            },
      ),
    }),
  };
  let configured: AwsGreBinding[] = [];
  let persisted = 0;
  const reported: MutableObservation = {
    status: 'observed',
    freshness: 'verified',
    canSatisfyInterfaceMutationGate: true,
    observedAt: '2026-10-29T00:00:00Z',
    interfaces: [
      {
        node: 'demo-1',
        role: 'slo',
        mac,
        device: 'ens5',
        interfaceName: 'realized-eth-interface',
        mtu: 1500,
        linkUp: true,
        ipv4: null,
      },
    ],
  };
  change(reported);
  const runtime = {
    observeAwsInterfaces: async () => reported,
    ensureAwsRouting: async (
      _binding: unknown,
      _local: number,
      _remote: number,
      interfaces: AwsGreBinding[],
      deniedExportPrefixes: string[],
      checkpoint: (value: unknown) => Promise<void>,
    ) => {
      configured = interfaces;
      expect(deniedExportPrefixes).toEqual(plan.routing.destinationCidrs);
      await checkpoint({ name: 'demo-gre-1', uid: 'uid-one' });
    },
  };
  return {
    run: () =>
      configureAwsRouting(runtime as never, plan, state, api, async () => {
        persisted++;
      }),
    writes: () => ({ configured: configured.length, persisted }),
  };
}
test('trusted qualified explicit up joins can reach AWS routing mutation', async () => {
  const f = fixture();
  await f.run();
  expect(f.writes()).toEqual({ configured: 1, persisted: 1 });
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
  test('AWS routing rejects ' + name + ' before writes', async () => {
    const f = fixture(change);
    await expect(f.run()).rejects.toThrow();
    expect(f.writes()).toEqual({ configured: 0, persisted: 0 });
  });
