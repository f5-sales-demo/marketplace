import { expect, test } from 'bun:test';
import type { AwsGreBinding } from '../../../platform/src/ce/wire-routing';
import { configureAwsRouting } from '../../src/ce/routing-apply';
import type { AwsCeCheckpoint, AwsCePlan } from '../../src/ce/types';

test('configures XC from observed AWS endpoints and authoritative XC interface objects while BGP is still down', async () => {
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
  const runtime = {
    observeAwsInterfaces: async () => ({
      status: 'observed',
      interfaces: [{ node: 'demo-1', mac, role: 'slo', interfaceName: 'realized-eth-interface', mtu: 1500 }],
    }),
    ensureAwsRouting: async (
      _binding: unknown,
      _local: number,
      _remote: number,
      interfaces: AwsGreBinding[],
      checkpoint: (value: unknown) => Promise<void>,
    ) => {
      configured = interfaces;
      await checkpoint({ name: 'demo-gre-1', uid: 'uid-one' });
    },
  };
  await configureAwsRouting(runtime as never, plan, state, api, async () => {
    persisted++;
  });
  expect(configured[0].interfaceName).toBe('realized-eth-interface');
  expect(configured[0].awsBgpAddresses).toEqual(['169.254.10.2', '169.254.10.3']);
  expect(state.resolvedValues.__XC_ROUTING_demo_gre_1__).toBeUndefined();
  expect(state.resolvedValues['__XC_ROUTING_demo-gre-1__']).toBe('uid-one');
  expect(persisted).toBe(1);
});
