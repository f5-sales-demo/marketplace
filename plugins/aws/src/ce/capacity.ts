import type { AwsExecApi } from '../aws/exec';
import { readAwsEc2Pages } from './inventory';

export async function observeTaggedResourceCapacity(
  api: AwsExecApi,
  region: string,
  command: string,
  field: string,
  idField: string,
  limit: number,
  ownership: { deploymentName: string; planSha256s: string[]; accountId?: string },
) {
  if (!Number.isFinite(limit) || limit < 0 || !/^\d{12}$/.test(ownership.accountId ?? ''))
    throw new Error('Resource quota or authenticated account is unavailable or malformed');
  const resources = await readAwsEc2Pages(api, command, field, region);
  const ids = new Set<string>();
  let reusableOwned = 0;
  let used = 0;
  for (const resource of resources) {
    const id = resource[idField];
    if (typeof id !== 'string' || !/^(vpc|igw)-[0-9a-f]{8,21}$/.test(id) || ids.has(id))
      throw new Error('Resource capacity identity is missing or ambiguous');
    ids.add(id);
    if (typeof resource.OwnerId !== 'string' || !/^\d{12}$/.test(resource.OwnerId))
      throw new Error('Capacity resource account is missing');
    if (resource.OwnerId !== ownership.accountId) continue;
    used++;
    if (resource.Tags !== undefined && !Array.isArray(resource.Tags))
      throw new Error('Capacity ownership tags malformed');
    const tags = new Map<string, string>();
    for (const value of (resource.Tags ?? []) as Array<{ Key: string; Value: string }>) {
      if (typeof value?.Key !== 'string' || typeof value?.Value !== 'string' || tags.has(value.Key))
        throw new Error('Capacity ownership tags malformed');
      tags.set(value.Key, value.Value);
    }
    if (
      tags.get('xcsh-managed-by') === 'aws-ce' &&
      tags.get('xcsh-deployment-id') === ownership.deploymentName &&
      ['native', 'terraform'].includes(tags.get('xcsh-execution-engine') ?? '') &&
      ownership.planSha256s.includes(tags.get('xcsh-plan-sha256') ?? '')
    )
      reusableOwned++;
  }
  if (reusableOwned > 1) throw new Error('Ambiguous owned resource capacity');
  return {
    limit,
    used,
    reusableOwned,
    remaining: Math.max(0, limit - used + reusableOwned),
    source: 'aws-cli-live' as const,
  };
}

/** Standard on-demand quota counts default vCPUs, including pending instances. */
export async function observeStandardVcpuCapacity(
  api: AwsExecApi,
  region: string,
  limit: number,
  ownership: { deploymentName: string; planSha256s: string[] },
  nodeCount: number,
) {
  if (!Number.isFinite(limit) || limit < 0) throw new Error('vCPU quota is malformed');
  const rows = await readAwsEc2Pages(api, 'describe-instances', 'Reservations', region, [
    '--filters',
    'Name=instance-state-name,Values=pending,running',
  ]);
  const instances = rows.flatMap((row) => {
    if (!Array.isArray(row.Instances)) throw new Error('vCPU usage reservation is malformed');
    return row.Instances;
  });
  const ids = new Set<string>();
  const counted = instances.filter((instance) => {
    if (
      !instance ||
      typeof instance !== 'object' ||
      !/^i-[0-9a-f]{8,21}$/.test(instance.InstanceId) ||
      ids.has(instance.InstanceId) ||
      typeof instance.InstanceType !== 'string' ||
      !['pending', 'running'].includes(instance.State?.Name)
    )
      throw new Error('vCPU usage instance identity or state is malformed');
    ids.add(instance.InstanceId);
    if (
      instance.InstanceLifecycle !== undefined &&
      !['spot', 'scheduled', 'capacity-block'].includes(instance.InstanceLifecycle)
    )
      throw new Error('Unknown instance lifecycle in vCPU quota observation');
    return instance.InstanceLifecycle === undefined && /^[acdhimrtz]\d/.test(instance.InstanceType);
  });
  const types = [...new Set<string>(counted.map((instance) => instance.InstanceType))].sort();
  const cpus = new Map<string, number>();
  for (let offset = 0; offset < types.length; offset += 100) {
    const batch = types.slice(offset, offset + 100);
    const response = await api.exec('aws', [
      'ec2',
      'describe-instance-types',
      '--instance-types',
      ...batch,
      '--region',
      region,
      '--output',
      'json',
    ]);
    if (response.exitCode !== 0) throw new Error('vCPU usage type lookup unavailable');
    const data = JSON.parse(response.stdout);
    if (
      !data ||
      data.NextToken !== undefined ||
      !Array.isArray(data.InstanceTypes) ||
      data.InstanceTypes.length !== batch.length
    )
      throw new Error('vCPU usage type lookup incomplete');
    for (const type of data.InstanceTypes) {
      const vcpus = type?.VCpuInfo?.DefaultVCpus;
      if (!batch.includes(type?.InstanceType) || cpus.has(type.InstanceType) || !Number.isInteger(vcpus) || vcpus < 1)
        throw new Error('vCPU usage type mapping malformed');
      cpus.set(type.InstanceType, vcpus);
    }
  }
  let used = 0;
  let reusableOwned = 0;
  const ownedNodes = new Set<number>();
  for (const instance of counted) {
    const vcpus = cpus.get(instance.InstanceType);
    if (!vcpus) throw new Error('vCPU usage type mapping missing');
    used += vcpus;
    if (instance.Tags !== undefined && !Array.isArray(instance.Tags)) throw new Error('vCPU ownership tags malformed');
    const tags = new Map<string, string>();
    for (const tag of instance.Tags ?? []) {
      if (typeof tag?.Key !== 'string' || typeof tag?.Value !== 'string' || tags.has(tag.Key))
        throw new Error('vCPU ownership tags malformed');
      tags.set(tag.Key, tag.Value);
    }
    const node = Number(tags.get('xcsh-node-index'));
    if (
      tags.get('xcsh-managed-by') === 'aws-ce' &&
      tags.get('xcsh-deployment-id') === ownership.deploymentName &&
      ['native', 'terraform'].includes(tags.get('xcsh-execution-engine') ?? '') &&
      ownership.planSha256s.includes(tags.get('xcsh-plan-sha256') ?? '') &&
      Number.isInteger(node) &&
      node >= 1 &&
      node <= nodeCount
    ) {
      if (ownedNodes.has(node)) throw new Error('Ambiguous owned-node vCPU capacity');
      ownedNodes.add(node);
      reusableOwned += vcpus;
    }
  }
  return {
    limit,
    used,
    reusableOwned,
    remaining: Math.max(0, limit - used + reusableOwned),
    source: 'aws-cli-live' as const,
  };
}
