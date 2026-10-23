import { canonicalSha256 } from '../../src/ce/canonical';
import { powerIdentityFixture } from './whole-site-power-fixtures';

export function connectPowerFixture(engine: 'native' | 'terraform' = 'native', siteName = 'site') {
  const f = powerIdentityFixture(engine);
  const { planSha256: _sha, planId: _id, ...body } = f.base;
  const gateway = 'tgw-12345678',
    table = 'tgw-rtb-12345678',
    transport = 'tgw-attach-11111111',
    attachment = 'tgw-attach-22222222',
    peer = 'tgw-connect-peer-33333333',
    vpc = 'vpc-12345678';
  const routing = {
    profile: 'tgw-connect' as const,
    customerAsn: 65010,
    transitGatewayAsn: 64512,
    transitGatewayId: gateway,
    transitGatewayRouteTableId: table,
    associations: [table],
    propagations: [table],
    destinationCidrs: ['10.200.0.0/16'],
    connectPeers: [{ node: 1, transportInterfaceIndex: 1, insideCidr: '169.254.10.0/29' }],
  };
  body.intent = {
    ...body.intent,
    routing,
    brownfield: { ...body.intent.brownfield, resourceIds: [gateway], transitGatewayRouteTableIds: [table] },
  };
  body.routing = routing;
  body.actions = [
    {
      id: 'connect',
      kind: 'tgw-connect-attachment-create',
      phase: 'routing',
      description: 'owned Connect',
      mutates: true,
      destructive: false,
      args: [
        'ec2',
        'create-transit-gateway-connect',
        '--transport-transit-gateway-attachment-id',
        '__TGW_TRANSPORT_ATTACHMENT__',
        '--options',
        'Protocol=gre',
      ],
      capture: {
        placeholder: '__TGW_CONNECT_ATTACHMENT_1_1__',
        path: 'TransitGatewayConnect.TransitGatewayAttachmentId',
      },
    },
    {
      id: 'peer',
      kind: 'tgw-connect-peer-create',
      phase: 'routing',
      description: 'owned peer',
      mutates: true,
      destructive: false,
      node: 1,
      args: [
        'ec2',
        'create-transit-gateway-connect-peer',
        '--transit-gateway-attachment-id',
        '__TGW_CONNECT_ATTACHMENT_1_1__',
        '--peer-address',
        '__NODE_1_SLI_IP__',
        '--inside-cidr-blocks',
        '169.254.10.0/29',
      ],
      capture: { placeholder: '__TGW_CONNECT_PEER_1__', path: 'TransitGatewayConnectPeer.TransitGatewayConnectPeerId' },
    },
  ];
  body.intent = { ...body.intent, siteName, topology: { nodeCount: 1, sites: [{ name: siteName, nodeIndexes: [1] }] } };
  body.siteName = siteName;
  body.topology = body.intent.topology;
  const sha = canonicalSha256(body),
    base = { ...body, planSha256: sha, planId: `aws-ce-${sha.slice(0, 24)}` };
  const values = {
    ...f.resolved,
    __VPC_ID__: vpc,
    __TGW_TRANSPORT_ATTACHMENT__: transport,
    __TGW_CONNECT_ATTACHMENT_1_1__: attachment,
    __TGW_CONNECT_PEER_1__: peer,
    __NODE_1_SLI_IP__: '10.0.2.10',
  };
  const tags = Object.entries({
    'xcsh-managed-by': 'aws-ce',
    'xcsh-deployment-id': base.deploymentName,
    'xcsh-execution-engine': engine,
    'xcsh-plan-sha256': sha,
  }).map(([Key, Value]) => ({ Key, Value }));
  const nic = {
    ...f.enis[1],
    VpcId: vpc,
    SubnetId: 'subnet-22222222',
    PrivateIpAddress: values.__NODE_1_SLI_IP__,
    TagSet: [...tags, { Key: 'xcsh-node-index', Value: '1' }, { Key: 'xcsh-interface-index', Value: '1' }],
  };
  const data: Record<string, Record<string, unknown>> = {
    'get-caller-identity': { Account: base.accountId },
    'describe-transit-gateway-vpc-attachments': {
      TransitGatewayVpcAttachments: [
        {
          TransitGatewayAttachmentId: transport,
          TransitGatewayId: gateway,
          VpcId: vpc,
          VpcOwnerId: base.accountId,
          State: 'available',
          Options: { ApplianceModeSupport: 'enable' },
          SubnetIds: ['subnet-22222222'],
          Tags: tags,
        },
      ],
    },
    'describe-transit-gateway-connects': {
      TransitGatewayConnects: [
        {
          TransitGatewayAttachmentId: attachment,
          TransportTransitGatewayAttachmentId: transport,
          TransitGatewayId: gateway,
          State: 'available',
          Options: { Protocol: 'gre' },
          Tags: tags,
        },
      ],
    },
    'describe-transit-gateway-attachments': {
      TransitGatewayAttachments: [
        {
          TransitGatewayAttachmentId: attachment,
          TransitGatewayId: gateway,
          ResourceOwnerId: base.accountId,
          ResourceType: 'connect',
          State: 'available',
          Tags: tags,
        },
      ],
    },
    'describe-transit-gateway-connect-peers': {
      TransitGatewayConnectPeers: [
        {
          TransitGatewayAttachmentId: attachment,
          TransitGatewayConnectPeerId: peer,
          State: 'available',
          Tags: [...tags, { Key: 'xcsh-node-index', Value: '1' }],
          ConnectPeerConfiguration: {
            Protocol: 'gre',
            PeerAddress: values.__NODE_1_SLI_IP__,
            TransitGatewayAddress: '100.64.0.1',
            InsideCidrBlocks: ['169.254.10.0/29'],
            BgpConfigurations: [2, 3].map((last) => ({
              TransitGatewayAddress: `169.254.10.${last}`,
              PeerAddress: '169.254.10.1',
              TransitGatewayAsn: 64512,
              PeerAsn: 65010,
              BgpStatus: 'up',
            })),
          },
        },
      ],
    },
    'describe-network-interfaces': { NetworkInterfaces: [nic] },
    'describe-transit-gateway-route-tables': {
      TransitGatewayRouteTables: [{ TransitGatewayRouteTableId: table, TransitGatewayId: gateway, State: 'available' }],
    },
    'get-transit-gateway-route-table-associations': {
      Associations: [{ TransitGatewayAttachmentId: attachment, State: 'associated' }],
    },
    'get-transit-gateway-route-table-propagations': {
      TransitGatewayRouteTablePropagations: [{ TransitGatewayAttachmentId: attachment, State: 'enabled' }],
    },
  };
  let routes: unknown[] = [
    {
      DestinationCidrBlock: '10.200.0.0/16',
      Type: 'propagated',
      State: 'active',
      TransitGatewayAttachments: [{ TransitGatewayAttachmentId: attachment, ResourceType: 'connect' }],
    },
  ];
  let partial = false,
    unavailable = false;
  const calls: string[][] = [];
  const api = {
    exec: async (_cmd: string, args: string[]) => {
      calls.push(args);
      const op = args[1];
      let response: unknown = data[op];
      if (op === 'search-transit-gateway-routes') {
        const filter = args[args.indexOf('--filters') + 1];
        response = {
          AdditionalRoutesAvailable: partial,
          Routes: routes.filter((raw) => {
            const route = raw as { DestinationCidrBlock: string };
            return filter.includes('exact-match')
              ? route.DestinationCidrBlock === '10.200.0.0/16'
              : filter.includes('subnet-of-match')
                ? route.DestinationCidrBlock.startsWith('10.200.')
                : route.DestinationCidrBlock === '10.0.0.0/8';
          }),
        };
      }
      if (response === undefined) throw Error('unhandled fixture operation ' + op);
      return { exitCode: unavailable ? 1 : 0, stdout: JSON.stringify(response), stderr: '' };
    },
  };
  return {
    base,
    values,
    data,
    api,
    calls,
    routes: (v: unknown[]) => {
      routes = v;
    },
    partial: () => {
      partial = true;
    },
    unavailable: () => {
      unavailable = true;
    },
  };
}
