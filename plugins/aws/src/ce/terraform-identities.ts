import { isIP } from 'node:net';
import type { AwsExecApi } from '../aws/exec';
import { scopedAwsApi } from './scoped-exec';
import { siteForNode } from './topology';
import type { AwsCePlan } from './types';

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

/** Terraform outputs locate resources; live AWS responses establish the bootstrap bindings. */
export async function discoverAwsTerraformInterfaces(
  plan: AwsCePlan,
  outputs: Record<string, unknown>,
  rawApi: AwsExecApi,
  signal?: AbortSignal,
) {
  if (plan.engine !== 'terraform') throw new Error('Terraform interface discovery requires Terraform ownership');
  const api = scopedAwsApi(rawApi, plan.intent.awsProfile, signal);
  const run = async (args: string[]) => {
    const result = await api.exec('aws', [...args, '--region', plan.region, '--output', 'json']);
    if (result.exitCode !== 0) throw new Error('Terraform interface discovery is unavailable');
    return object(JSON.parse(result.stdout));
  };
  if ((await run(['sts', 'get-caller-identity'])).Account !== plan.accountId)
    throw new Error('Terraform interface discovery account differs');
  const candidates = object(outputs.ce_interfaces);
  const expected = Array.from({ length: plan.intent.topology.nodeCount }, (_, index) => index + 1).flatMap((node) =>
    plan.intent.interfaces.map((item) => ({ node, item, key: `${node}:${item.index}` })),
  );
  if (Object.keys(candidates).length !== expected.length || !/^vpc-[0-9a-f]{8,17}$/.test(String(outputs.ce_vpc_id)))
    throw new Error('Terraform network output is incomplete');
  const ids: string[] = [];
  for (const { node, item, key } of expected) {
    const value = object(candidates[key]);
    if (
      value.node !== node ||
      value.index !== item.index ||
      value.role !== item.role ||
      value.site_name !== siteForNode(plan.intent, node).name ||
      typeof value.subnet_id !== 'string' ||
      !/^subnet-[0-9a-f]{8,17}$/.test(value.subnet_id) ||
      typeof value.id !== 'string' ||
      !/^eni-[0-9a-f]{8,17}$/.test(value.id) ||
      ids.includes(value.id)
    )
      throw new Error('Terraform interface output identity is malformed');
    ids.push(value.id);
  }
  const observed = await run(['ec2', 'describe-network-interfaces', '--network-interface-ids', ...ids]);
  if (
    observed.NextToken ||
    !Array.isArray(observed.NetworkInterfaces) ||
    observed.NetworkInterfaces.length !== expected.length
  )
    throw new Error('AWS interface discovery response is incomplete');
  const bindings: Record<string, string> = {};
  const macs = new Set<string>();
  for (const { node, item, key } of expected) {
    const candidate = object(candidates[key]);
    const matches = observed.NetworkInterfaces.map(object).filter((eni) => eni.NetworkInterfaceId === candidate.id);
    if (matches.length !== 1) throw new Error('AWS interface identity is ambiguous');
    const eni = matches[0];
    const instance = object(object(outputs.ce_instances)[String(node)]);
    if (eni.Status === 'in-use') {
      if (
        typeof instance.id !== 'string' ||
        !/^i-[0-9a-f]{8,17}$/.test(instance.id) ||
        instance.site_name !== siteForNode(plan.intent, node).name ||
        instance.hostname !== `${plan.deploymentName}-${node}` ||
        object(eni.Attachment).InstanceId !== instance.id ||
        object(eni.Attachment).DeviceIndex !== item.index
      )
        throw new Error('Terraform interface attachment identity differs');
    } else if (eni.Attachment || Object.keys(instance).length)
      throw new Error('Terraform interface attachment is incomplete');
    const tags = Array.isArray(eni.TagSet) ? eni.TagSet.map(object) : [];
    const expectedTags = {
      'xcsh-managed-by': 'aws-ce',
      'xcsh-execution-engine': 'terraform',
      'xcsh-deployment-id': plan.deploymentName,
      'xcsh-plan-sha256': plan.planSha256,
      'ves-io-site-name': siteForNode(plan.intent, node).name,
      'xcsh-node-index': String(node),
      'xcsh-interface-index': String(item.index),
    };
    const mac = typeof eni.MacAddress === 'string' ? eni.MacAddress.toLowerCase() : '';
    if (
      eni.OwnerId !== plan.accountId ||
      eni.VpcId !== outputs.ce_vpc_id ||
      eni.SubnetId !== candidate.subnet_id ||
      eni.AvailabilityZone !== item.subnets[node - 1].availabilityZone ||
      eni.SourceDestCheck !== false ||
      !['available', 'in-use'].includes(String(eni.Status)) ||
      !/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(mac) ||
      macs.has(mac) ||
      typeof candidate.mac !== 'string' ||
      mac !== candidate.mac.toLowerCase() ||
      typeof eni.PrivateIpAddress !== 'string' ||
      isIP(eni.PrivateIpAddress) !== 4 ||
      eni.PrivateIpAddress !== candidate.private_ip ||
      Object.entries(expectedTags).some(
        ([key, value]) =>
          tags.filter((tag) => tag.Key === key && tag.Value === value).length !== 1 ||
          tags.filter((tag) => tag.Key === key).length !== 1,
      )
    )
      throw new Error('AWS interface resource binding differs from Terraform deployment');
    macs.add(mac);
    bindings[`__ENI_${node}_${item.index}__`] = String(eni.NetworkInterfaceId);
    bindings[`__ENI_${node}_${item.index}_MAC__`] = mac;
    bindings[`__NODE_${node}_${item.role.toUpperCase()}_IP__`] = eni.PrivateIpAddress;
  }
  return {
    source: 'aws:ec2:describe-network-interfaces',
    observedAt: new Date().toISOString(),
    accountId: plan.accountId,
    region: plan.region,
    bindings,
  };
}
