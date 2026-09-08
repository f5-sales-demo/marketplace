import { expect, it } from 'bun:test';
import { discoverAwsTerraformInterfaces } from '../../src/ce/terraform-identities';
import type { AwsCePlan } from '../../src/ce/types';

const plan = {
  engine: 'terraform',
  accountId: '123456789012',
  region: 'us-east-1',
  deploymentName: 'ce',
  planSha256: 'a'.repeat(64),
  intent: {
    awsProfile: 'ce-profile',
    siteName: 'site',
    topology: { nodeCount: 1 },
    interfaces: [{ index: 0, role: 'slo', subnets: [{ availabilityZone: 'us-east-1a' }] }],
  },
} as unknown as AwsCePlan;
const tags = {
  'xcsh-managed-by': 'aws-ce',
  'xcsh-execution-engine': 'terraform',
  'xcsh-deployment-id': 'ce',
  'xcsh-plan-sha256': plan.planSha256,
  'ves-io-site-name': 'site',
  'xcsh-node-index': '1',
  'xcsh-interface-index': '0',
};
const eni = {
  NetworkInterfaceId: 'eni-12345678',
  OwnerId: plan.accountId,
  VpcId: 'vpc-12345678',
  SubnetId: 'subnet-12345678',
  AvailabilityZone: 'us-east-1a',
  MacAddress: '00:11:22:33:44:55',
  PrivateIpAddress: '10.0.0.4',
  Status: 'available',
  SourceDestCheck: false,
  TagSet: Object.entries(tags).map(([Key, Value]) => ({ Key, Value })),
};
const outputs = {
  ce_vpc_id: eni.VpcId,
  ce_interfaces: {
    '1:0': {
      id: eni.NetworkInterfaceId,
      subnet_id: eni.SubnetId,
      node: 1,
      index: 0,
      role: 'slo',
      site_name: 'site',
      mac: eni.MacAddress,
      private_ip: eni.PrivateIpAddress,
    },
  },
};
function api(value: unknown = { NetworkInterfaces: [eni] }) {
  return {
    exec: async (_command: string, args: string[]) => {
      expect(args).toContain('--profile');
      expect(args[args.indexOf('--profile') + 1]).toBe('ce-profile');
      expect(args).toContain('--region');
      if (args[0] === 'ec2') {
        expect(args).toContain('--network-interface-ids');
        expect(args).toContain(eni.NetworkInterfaceId);
      }
      return {
        exitCode: 0,
        stderr: '',
        stdout: JSON.stringify(args[0] === 'sts' ? { Account: plan.accountId } : value),
      };
    },
  };
}
it('uses Terraform outputs only as locators and binds exact live AWS interface identities', async () => {
  expect((await discoverAwsTerraformInterfaces(plan, outputs, api())).bindings).toEqual({
    __ENI_1_0__: eni.NetworkInterfaceId,
    __ENI_1_0_MAC__: eni.MacAddress,
    __NODE_1_SLO_IP__: eni.PrivateIpAddress,
  });
});
it('rejects stale, cross-scope, ambiguous and incomplete live bindings', async () => {
  for (const change of [
    { OwnerId: 'foreign' },
    { VpcId: 'vpc-87654321' },
    { SubnetId: 'subnet-87654321' },
    { AvailabilityZone: 'us-east-1b' },
    { SourceDestCheck: true },
    { MacAddress: '00:11:22:33:44:66' },
    { PrivateIpAddress: '10.0.0.5' },
    { TagSet: [] },
  ])
    await expect(
      discoverAwsTerraformInterfaces(plan, outputs, api({ NetworkInterfaces: [{ ...eni, ...change }] })),
    ).rejects.toThrow('binding differs');
  await expect(
    discoverAwsTerraformInterfaces(plan, outputs, api({ NetworkInterfaces: [eni], NextToken: 'more' })),
  ).rejects.toThrow('incomplete');
  await expect(discoverAwsTerraformInterfaces(plan, outputs, api({ NetworkInterfaces: [eni, eni] }))).rejects.toThrow(
    'incomplete',
  );
  await expect(discoverAwsTerraformInterfaces(plan, { ...outputs, ce_interfaces: {} }, api())).rejects.toThrow(
    'incomplete',
  );
});
it('propagates cancellation before cloud collection', async () => {
  await expect(discoverAwsTerraformInterfaces(plan, outputs, api(), AbortSignal.abort())).rejects.toThrow();
});

it('rejects foreign or misordered attachments and accepts exact admitted-node bindings', async () => {
  const instanceId = 'i-1234567890abcdef0';
  const attached = { ...eni, Status: 'in-use', Attachment: { InstanceId: instanceId, DeviceIndex: 0 } };
  await expect(discoverAwsTerraformInterfaces(plan, outputs, api({ NetworkInterfaces: [attached] }))).rejects.toThrow(
    'attachment identity',
  );
  const admitted = { ...outputs, ce_instances: { '1': { id: instanceId, site_name: 'site', hostname: 'ce-1' } } };
  expect(
    (await discoverAwsTerraformInterfaces(plan, admitted, api({ NetworkInterfaces: [attached] }))).bindings.__ENI_1_0__,
  ).toBe(eni.NetworkInterfaceId);
  await expect(
    discoverAwsTerraformInterfaces(
      plan,
      admitted,
      api({ NetworkInterfaces: [{ ...attached, Attachment: { InstanceId: instanceId, DeviceIndex: 1 } }] }),
    ),
  ).rejects.toThrow('attachment identity');
});
