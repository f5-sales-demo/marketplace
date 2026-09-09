import { expect, test } from 'bun:test';
import { canonicalSha256 } from '../../src/ce/canonical';
import { collectAwsFailoverBgpHealth } from '../../src/ce/failover-health';
import { collectAwsNetworkHealth } from '../../src/ce/network-health';
import type { AwsCeCheckpoint, AwsCePlan } from '../../src/ce/types';
import { AWS_CE_SCHEMA_VERSION } from '../../src/ce/types';

const tags = [
  { Key: 'xcsh-managed-by', Value: 'aws-ce' },
  { Key: 'xcsh-deployment-id', Value: 'demo' },
  { Key: 'xcsh-execution-engine', Value: 'native' },
];
function fixture() {
  const values: Record<string, string> = { __TGW_CONNECT_ATTACHMENT__: 'tgw-attach-0123456789abcdef0' };
  const peers = Array.from({ length: 6 }, (_, index) => {
    const id = `tgw-connect-peer-${String(index + 1).repeat(17)}`;
    const node = Math.floor(index / 2) + 1;
    values[`__PEER_${index}__`] = id;
    values[`__NODE_${node}_SLI_IP__`] = `10.0.0.${node}`;
    return {
      TransitGatewayConnectPeerId: id,
      TransitGatewayAttachmentId: values.__TGW_CONNECT_ATTACHMENT__,
      State: 'available',
      Tags: tags,
      ConnectPeerConfiguration: {
        PeerAddress: `10.0.0.${node}`,
        TransitGatewayAddress: `100.64.0.${index + 1}`,
        InsideCidrBlocks: [`169.254.${index + 10}.0/29`],
        Protocol: 'gre',
        BgpConfigurations: [2, 3].map((last) => ({
          TransitGatewayAddress: `169.254.${index + 10}.${last}`,
          PeerAddress: `169.254.${index + 10}.1`,
          PeerAsn: 65010,
          TransitGatewayAsn: 64512,
          BgpStatus: 'up',
        })),
      },
    };
  });
  const plan = {
    accountId: '123456789012',
    region: 'us-east-1',
    deploymentName: 'demo',
    siteName: 'site-a',
    engine: 'native',
    intent: { partition: 'aws' },
    topology: { nodeCount: 3 },
    routing: { customerAsn: 65010, transitGatewayAsn: 64512 },
    actions: peers.map((_, index) => ({
      kind: 'tgw-connect-peer-create',
      node: Math.floor(index / 2) + 1,
      capture: { placeholder: `__PEER_${index}__` },
      args: ['--inside-cidr-blocks', `169.254.${index + 10}.0/29`],
    })),
  } as AwsCePlan;
  const calls: string[][] = [];
  const api = {
    exec: async (_command: string, args: string[]) => {
      calls.push(args);
      return {
        exitCode: 0,
        stderr: '',
        stdout: JSON.stringify(args[0] === 'sts' ? { Account: plan.accountId } : { TransitGatewayConnectPeers: peers }),
      };
    },
  };
  return { plan, checkpoint: { resolvedValues: values } as AwsCeCheckpoint, api, peers, calls };
}
test('derives twelve sessions from six exact peers and measures outage to eight separately from packet evidence', async () => {
  const f = fixture();
  const healthy = await collectAwsNetworkHealth('bgp', f.plan, f.checkpoint, f.api);
  expect(healthy.expectedSessions).toBe(12);
  expect(healthy.establishedSessions).toBe(12);
  expect(healthy.status).toBe('healthy');
  expect(healthy.packetTtlEvidence).toBe('unknown');
  expect(healthy.traffic).toBe('unknown');
  for (const peer of f.peers.slice(0, 2))
    for (const session of peer.ConnectPeerConfiguration.BgpConfigurations) session.BgpStatus = 'down';
  const outage = await collectAwsNetworkHealth('bgp', f.plan, f.checkpoint, f.api);
  expect(outage.establishedSessions).toBe(8);
  expect(outage.status).toBe('degraded');
  expect(f.calls.find((args) => args[1] === 'describe-transit-gateway-connect-peers')).toContain(
    '--transit-gateway-connect-peer-ids',
  );
});
test('duplicate endpoints and foreign peer identities never produce healthy session counts', async () => {
  const f = fixture();
  f.peers[0].ConnectPeerConfiguration.BgpConfigurations[1].TransitGatewayAddress =
    f.peers[0].ConnectPeerConfiguration.BgpConfigurations[0].TransitGatewayAddress;
  expect((await collectAwsNetworkHealth('bgp', f.plan, f.checkpoint, f.api)).status).toBe('unknown');
  f.peers[0].TransitGatewayConnectPeerId = 'tgw-connect-peer-fffffffffffffffff';
  expect((await collectAwsNetworkHealth('bgp', f.plan, f.checkpoint, f.api)).status).toBe('unknown');
});
test('NLB health requires exact owned target membership and never establishes traffic delivery', async () => {
  const f = fixture();
  const arn = 'arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/demo/abc';
  f.checkpoint.resolvedValues.__NLB_TARGET_GROUP_ARN__ = arn;
  const targets = [1, 2, 3].map((node) => {
    const address = `10.0.1.${node}`;
    f.checkpoint.resolvedValues[`__NODE_${node}_SLI_IP__`] = address;
    return { Target: { Id: address, Port: 443 }, TargetHealth: { State: 'healthy' } };
  });
  const api = {
    exec: async (_command: string, args: string[]) => ({
      exitCode: 0,
      stderr: '',
      stdout: JSON.stringify(
        args[0] === 'sts'
          ? { Account: f.plan.accountId }
          : args[1] === 'describe-tags'
            ? { TagDescriptions: [{ ResourceArn: arn, Tags: tags }] }
            : { TargetHealthDescriptions: targets },
      ),
    }),
  };
  const health = await collectAwsNetworkHealth('nlb', f.plan, f.checkpoint, api);
  expect(health.status).toBe('healthy');
  expect(health.traffic).toBe('unknown');
  targets[1].Target.Id = targets[0].Target.Id;
  expect((await collectAwsNetworkHealth('nlb', f.plan, f.checkpoint, api)).status).toBe('unknown');
});

test('TGW route health binds exact associations, propagations and static routes to checkpoint identities', async () => {
  const f = fixture();
  const tableId = 'tgw-rtb-0123456789abcdef0';
  const attachmentId = f.checkpoint.resolvedValues.__TGW_CONNECT_ATTACHMENT__;
  const destination = '10.30.0.0/16';
  f.plan.actions.push(
    {
      kind: 'tgw-associate',
      args: [
        '--transit-gateway-route-table-id',
        tableId,
        '--transit-gateway-attachment-id',
        '__TGW_CONNECT_ATTACHMENT__',
      ],
    },
    {
      kind: 'tgw-propagate',
      args: [
        '--transit-gateway-route-table-id',
        tableId,
        '--transit-gateway-attachment-id',
        '__TGW_CONNECT_ATTACHMENT__',
      ],
    },
    {
      kind: 'tgw-route-create',
      args: [
        '--transit-gateway-route-table-id',
        tableId,
        '--destination-cidr-block',
        destination,
        '--transit-gateway-attachment-id',
        '__TGW_CONNECT_ATTACHMENT__',
      ],
    },
  );
  let propagationState = 'enabled';
  let additionalRoutes = false;
  const api = {
    exec: async (_command: string, args: string[]) => {
      const operation = args[1];
      const value =
        args[0] === 'sts'
          ? { Account: f.plan.accountId }
          : operation === 'get-transit-gateway-route-table-associations'
            ? { Associations: [{ TransitGatewayAttachmentId: attachmentId, State: 'associated' }] }
            : operation === 'get-transit-gateway-route-table-propagations'
              ? {
                  TransitGatewayRouteTablePropagations: [
                    { TransitGatewayAttachmentId: attachmentId, State: propagationState },
                  ],
                }
              : {
                  AdditionalRoutesAvailable: additionalRoutes,
                  Routes: [
                    {
                      DestinationCidrBlock: destination,
                      State: 'active',
                      Type: 'static',
                      TransitGatewayAttachments: [{ TransitGatewayAttachmentId: attachmentId }],
                    },
                  ],
                };
      return { exitCode: 0, stderr: '', stdout: JSON.stringify(value) };
    },
  };
  const healthy = await collectAwsNetworkHealth('routes', f.plan, f.checkpoint, api);
  expect(healthy.status).toBe('healthy');
  expect(healthy.expectedAssociations).toBe(1);
  expect(healthy.expectedPropagations).toBe(1);
  expect(healthy.expectedRoutes).toBe(1);
  expect(healthy.traffic).toBe('unknown');
  propagationState = 'enabling';
  expect((await collectAwsNetworkHealth('routes', f.plan, f.checkpoint, api)).status).toBe('degraded');
  propagationState = 'enabled';
  additionalRoutes = true;
  expect((await collectAwsNetworkHealth('routes', f.plan, f.checkpoint, api)).status).toBe('unknown');
});

test('mismatched inside CIDRs and out-of-tunnel BGP addresses remain unknown', async () => {
  const cidr = fixture();
  cidr.peers[0].ConnectPeerConfiguration.InsideCidrBlocks = ['169.254.99.0/29'];
  expect((await collectAwsNetworkHealth('bgp', cidr.plan, cidr.checkpoint, cidr.api)).status).toBe('unknown');
  const endpoint = fixture();
  endpoint.peers[0].ConnectPeerConfiguration.BgpConfigurations[0].TransitGatewayAddress = '169.254.99.2';
  expect((await collectAwsNetworkHealth('bgp', endpoint.plan, endpoint.checkpoint, endpoint.api)).status).toBe(
    'unknown',
  );
});

function failoverFixture() {
  const f = fixture();
  f.plan.schemaVersion = AWS_CE_SCHEMA_VERSION;
  f.plan.intent = {
    ...f.plan.intent,
    schemaVersion: AWS_CE_SCHEMA_VERSION,
    engine: f.plan.engine,
    siteName: f.plan.siteName,
    topology: { ...f.plan.topology, sites: [1, 2, 3].map((node) => ({ name: `site-${node}`, nodeIndexes: [node] })) },
  };
  f.plan.planSha256 = canonicalSha256(f.plan);
  f.plan.planId = `aws-ce-${f.plan.planSha256.slice(0, 24)}`;
  Object.assign(f.checkpoint, {
    schemaVersion: f.plan.schemaVersion,
    engine: f.plan.engine,
    planId: f.plan.planId,
    planSha256: f.plan.planSha256,
  });
  return f;
}

test('failover collects exact selected-node withdrawal and restoration, not merely matching counts', async () => {
  const f = failoverFixture();
  const collect = (phase: 'outage' | 'recovered') => collectAwsFailoverBgpHealth(f.plan, f.checkpoint, 1, phase, f.api);
  expect((await collect('recovered')).acceptance).toBe('passed');
  expect((await collect('outage')).acceptance).toBe('pending');
  for (const peer of f.peers.slice(2, 4))
    for (const session of peer.ConnectPeerConfiguration.BgpConfigurations) session.BgpStatus = 'down';
  const wrongNode = await collect('outage');
  expect(wrongNode.expectedEstablishedSessions).toBe(8);
  expect(wrongNode.acceptance).toBe('pending');
  for (const [index, peer] of f.peers.entries())
    for (const session of peer.ConnectPeerConfiguration.BgpConfigurations)
      session.BgpStatus = index < 2 ? 'down' : 'up';
  const outage = await collect('outage');
  expect(outage.acceptance).toBe('passed');
  expect(outage.selectedSiteName).toBe('site-1');
  expect(outage.nodeName).toBe('demo-1');
  expect(outage.planSha256).toBe(f.plan.planSha256);
  expect((await collect('recovered')).acceptance).toBe('pending');
  f.peers.pop();
  expect((await collect('outage')).acceptance).toBe('unknown');
});

test('failover refuses another engine or stale checkpoint before collecting cloud evidence', async () => {
  const f = failoverFixture();
  f.checkpoint.engine = 'terraform';
  await expect(collectAwsFailoverBgpHealth(f.plan, f.checkpoint, 1, 'outage', f.api)).rejects.toThrow();
  expect(f.calls).toHaveLength(0);
  f.checkpoint.engine = f.plan.engine;
  f.checkpoint.planSha256 = '0'.repeat(64);
  await expect(collectAwsFailoverBgpHealth(f.plan, f.checkpoint, 1, 'outage', f.api)).rejects.toThrow();
  expect(f.calls).toHaveLength(0);
});

test('failover derives six-session profiles and preserves the selected node inside a three-node site', async () => {
  const f = failoverFixture();
  f.peers.splice(0, f.peers.length, ...f.peers.filter((_, index) => index % 2 === 0));
  f.plan.actions = f.plan.actions.filter((_, index) => index % 2 === 0);
  f.plan.intent.topology.sites = [{ name: 'ha-site', nodeIndexes: [1, 2, 3] }];
  const { planId: _id, planSha256: _sha, ...draft } = f.plan;
  f.plan.planSha256 = canonicalSha256(draft);
  f.plan.planId = `aws-ce-${f.plan.planSha256.slice(0, 24)}`;
  f.checkpoint.planId = f.plan.planId;
  f.checkpoint.planSha256 = f.plan.planSha256;
  for (const session of f.peers[0].ConnectPeerConfiguration.BgpConfigurations) session.BgpStatus = 'down';
  const health = await collectAwsFailoverBgpHealth(f.plan, f.checkpoint, 1, 'outage', f.api);
  expect(health.expectedEstablishedSessions).toBe(4);
  expect(health.selectedSiteName).toBe('ha-site');
  expect(health.acceptance).toBe('passed');
});
