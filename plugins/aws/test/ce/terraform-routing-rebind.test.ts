import { expect, test } from 'bun:test';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { TerraformSession } from '../../../terraform/src/service';
import { canonicalSha256 } from '../../src/ce/canonical';
import type { AwsRoutingRebind } from '../../src/ce/routing-apply';
import { configureAwsTerraformRouting } from '../../src/ce/terraform-routing';
import type { AwsCeCheckpoint, AwsCePlan } from '../../src/ce/types';
import { foundationPlan } from './terraform-fixtures';

function fixture() {
  const { planId: _id, planSha256: _sha, ...base } = foundationPlan();
  const actions = [1, 2, 3].flatMap((node) =>
    [0, 1].map((role) => {
      const index = (node - 1) * 2 + role + 1;
      return {
        kind: 'tgw-connect-peer-create',
        node,
        capture: { placeholder: `__PEER_${index}__`, path: 'id' },
        args: [
          '--peer-address',
          `__NODE_${node}_${role ? 'SLI' : 'SLO'}_IP__`,
          '--inside-cidr-blocks',
          `169.254.${index + 10}.0/29`,
          '--transit-gateway-attachment-id',
          `__TGW_CONNECT_ATTACHMENT_${role}_1__`,
        ],
      };
    }),
  );
  const draft = {
    ...base,
    deploymentName: 'ce',
    accountId: '123456789012',
    region: 'us-east-1',
    siteName: 'site',
    topology: base.intent.topology,
    routing: { profile: 'tgw-connect', customerAsn: 65010, transitGatewayAsn: 64512 },
    actions,
  };
  const hash = canonicalSha256(draft);
  const plan = { ...draft, planSha256: hash, planId: `aws-ce-${hash.slice(0, 24)}` } as AwsCePlan;
  const tags = { 'xcsh-managed-by': 'aws-ce', 'xcsh-execution-engine': 'terraform', 'xcsh-deployment-id': 'ce' };
  const enis = actions.map((action, index) => {
    const role = index % 2;
    return {
      NetworkInterfaceId: `eni-${String(index + 1).repeat(8)}`,
      OwnerId: plan.accountId,
      VpcId: 'vpc-12345678',
      SubnetId: `subnet-${String(index + 1).repeat(8)}`,
      AvailabilityZone: `us-east-1${'abc'[action.node - 1]}`,
      MacAddress: `02:00:00:00:00:0${index + 1}`,
      PrivateIpAddress: `10.0.${index + 1}.4`,
      Status: 'in-use',
      SourceDestCheck: false,
      Attachment: { InstanceId: `i-${String(action.node).repeat(8)}`, DeviceIndex: role },
      TagSet: Object.entries({
        ...tags,
        'xcsh-plan-sha256': hash,
        'ves-io-site-name': `site-${action.node}`,
        'xcsh-node-index': String(action.node),
        'xcsh-interface-index': String(role),
      }).map(([Key, Value]) => ({ Key, Value })),
    };
  });
  const peers = actions.map((_action, index) => ({
    TransitGatewayConnectPeerId: `tgw-connect-peer-${String(index + 1).repeat(8)}`,
    TransitGatewayAttachmentId: `tgw-attach-${String((index % 2) + 1).repeat(8)}`,
    State: 'available',
    Tags: Object.entries(tags).map(([Key, Value]) => ({ Key, Value })),
    ConnectPeerConfiguration: {
      PeerAddress: enis[index].PrivateIpAddress,
      TransitGatewayAddress: `100.64.0.${index + 1}`,
      InsideCidrBlocks: [`169.254.${index + 11}.0/29`],
      Protocol: 'gre',
      BgpConfigurations: [2, 3].map((last) => ({
        TransitGatewayAddress: `169.254.${index + 11}.${last}`,
        PeerAddress: `169.254.${index + 11}.1`,
        PeerAsn: 65010,
        TransitGatewayAsn: 64512,
        BgpStatus: 'up',
      })),
    },
  }));
  const outputs = {
    ce_vpc_id: 'vpc-12345678',
    ce_transport_attachment: 'tgw-attach-12345678',
    ce_instances: Object.fromEntries(
      [1, 2, 3].map((node) => [
        String(node),
        {
          id: `i-${String(node).repeat(8)}`,
          site_name: `site-${node}`,
          hostname: `ce-${node}`,
        },
      ]),
    ),
    ce_interfaces: Object.fromEntries(
      enis.map((eni, index) => [
        `${actions[index].node}:${index % 2}`,
        {
          id: eni.NetworkInterfaceId,
          subnet_id: eni.SubnetId,
          node: actions[index].node,
          index: index % 2,
          role: index % 2 ? 'sli' : 'slo',
          site_name: `site-${actions[index].node}`,
          mac: eni.MacAddress,
          private_ip: eni.PrivateIpAddress,
        },
      ]),
    ),
    ce_connect_peers: Object.fromEntries(
      peers.map((peer, index) => [
        String(index + 1),
        {
          id: peer.TransitGatewayConnectPeerId,
          node: actions[index].node,
          transport_interface_index: index % 2,
          attachment_id: peer.TransitGatewayAttachmentId,
        },
      ]),
    ),
  };
  const values = Object.fromEntries(
    [1, 2, 3].flatMap((node) => [
      [`__XC_ROUTING_ce-gre-${node * 2 - 1}__`, `gre-${node * 2 - 1}`],
      [`__XC_ROUTING_ce-gre-${node * 2}__`, `gre-${node * 2}`],
      [`__XC_ROUTING_site-${node}-tgw-bgp__`, `bgp-${node}`],
    ]),
  );
  const checkpoint = {
    schemaVersion: 2,
    engine: 'terraform',
    planId: plan.planId,
    planSha256: hash,
    resolvedValues: values,
  } as AwsCeCheckpoint;
  const saved: AwsCeCheckpoint[] = [];
  let failWrite = false;
  const storage = {
    verify: async () => {},
    write: async (_name: string, cp: unknown) => {
      if (failWrite) throw new Error('checkpoint unavailable');
      saved.push(structuredClone(cp) as AwsCeCheckpoint);
    },
  };
  const calls: Parameters<CeRuntime['ensureAwsRouting']>[] = [];
  const runtime = {
    engine: 'terraform',
    observeAwsInterfaces: async (binding, expected) => {
      expect(binding.siteName).toBe('site-2');
      return {
        status: 'observed',
        interfaces: expected.map((item) => ({
          ...item,
          interfaceName: item.role === 'slo' ? 'ens5' : 'ens6',
          mtu: 1500,
        })),
      };
    },
    ensureAwsRouting: async (...args) => {
      calls.push(args);
      for (const resource of args[6]?.resources ?? []) await args[4]({ ...resource, phase: 'rebind-pending' });
    },
  } as Pick<CeRuntime, 'engine' | 'observeAwsInterfaces' | 'ensureAwsRouting'>;
  const api = {
    exec: async (_command: string, args: string[]) => {
      expect(args[args.indexOf('--profile') + 1]).toBe('ce-profile');
      const result =
        args[0] === 'sts'
          ? { Account: plan.accountId }
          : args[1] === 'describe-network-interfaces'
            ? { NetworkInterfaces: enis }
            : { TransitGatewayConnectPeers: peers };
      return { exitCode: 0, stdout: JSON.stringify(result), stderr: '' };
    },
  };
  const session = { readOutputs: async () => structuredClone(outputs) } as unknown as TerraformSession;
  const rebind = { siteName: 'site-2', siteUid: 'replacement-site-2', checkpoint, contract: {} } as AwsRoutingRebind;
  const run = () =>
    configureAwsTerraformRouting(plan, session, runtime as CeRuntime, storage, api, {}, undefined, rebind);
  return {
    run,
    calls,
    saved,
    checkpoint,
    peers,
    outputs,
    enis,
    fail: () => {
      failWrite = true;
    },
    recover: () => {
      failWrite = false;
    },
  };
}

test('Terraform rebind rediscovers attachments, restores only the selected site and retains all recorded routing UIDs', async () => {
  const f = fixture();
  f.fail();
  await expect(f.run()).rejects.toThrow('checkpoint unavailable');
  expect(f.calls).toHaveLength(0);
  f.recover();
  const observed = await f.run();
  expect(observed.establishedSessions).toBe(12);
  expect(f.calls).toHaveLength(1);
  expect(f.calls[0][0].siteName).toBe('site-2');
  expect(f.calls[0][6]?.siteUid).toBe('replacement-site-2');
  expect(f.calls[0][6]?.resources.map((r) => r.uid)).toEqual(['gre-3', 'gre-4', 'bgp-2']);
  expect(f.calls[0][3].map((item) => [item.node, item.interfaceName])).toEqual([
    ['ce-2', 'ens5'],
    ['ce-2', 'ens6'],
  ]);
  for (const [key, value] of Object.entries(f.checkpoint.resolvedValues))
    expect(f.saved.at(-1)?.resolvedValues[key]).toBe(value);
  for (const peer of f.peers.slice(2, 4))
    for (const session of peer.ConnectPeerConfiguration.BgpConfigurations) session.BgpStatus = 'down';
  expect((await f.run()).status).toBe('degraded');
});

test('Terraform rebind rejects stale replacement attachment outputs before writing routing checkpoints', async () => {
  const f = fixture();
  f.outputs.ce_instances['2'].id = 'i-99999999';
  await expect(f.run()).rejects.toThrow('attachment identity differs');
  expect(f.saved).toHaveLength(0);
  expect(f.calls).toHaveLength(0);
});
