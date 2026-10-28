import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { AwsExecApi } from '../aws/exec';
import { detectAwsError } from '../aws/exec';
import { verifyAwsCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import { scopedAwsApi } from './scoped-exec';
import { collectAwsTerraformAbsence } from './terraform-absence';
import type { AwsTerraformRetirementInventory } from './terraform-retirement-inventory';
import { siteBindings, siteForNode } from './topology';
import type { AwsCePlan } from './types';

type Json = Record<string, unknown>;
type Tag = { Key: string; Value: string };
export interface AwsTerraformMetadataIdentity {
  type: string;
  id: string;
  address: string;
  parentInstanceId?: string;
  tags: Tag[];
}
const checkpointName = 'aws-terraform-metadata-retirement.json';
const keys = new Set([
  'xcsh-managed-by',
  'xcsh-execution-engine',
  'xcsh-deployment-id',
  'xcsh-plan-sha256',
  'xcsh-node-index',
  'xcsh-interface-index',
  'ves-io-site-name',
]);
const resourceTypes: Record<string, string> = {
  aws_vpc: 'vpc',
  aws_subnet: 'subnet',
  aws_instance: 'instance',
  aws_network_interface: 'network-interface',
  aws_security_group: 'security-group',
  aws_route_table: 'route-table',
  aws_internet_gateway: 'internet-gateway',
  aws_eip: 'elastic-ip',
  aws_ebs_volume: 'volume',
  aws_ec2_transit_gateway_vpc_attachment: 'transit-gateway-attachment',
  aws_ec2_transit_gateway_connect: 'transit-gateway-attachment',
  aws_ec2_transit_gateway_connect_peer: 'transit-gateway-connect-peer',
};
const object = (value: unknown): Json => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Malformed metadata evidence');
  return value as Json;
};
const rows = (value: unknown): Json[] => {
  if (!Array.isArray(value)) throw Error('Missing metadata evidence collection');
  return value.map(object);
};
const requiredTags = (plan: AwsCePlan) => ({
  'xcsh-managed-by': 'aws-ce',
  'xcsh-execution-engine': 'terraform',
  'xcsh-deployment-id': plan.intent.deploymentName,
  'xcsh-plan-sha256': plan.planSha256,
});

/** Captured by the owning pre-destroy guard, never inferred from post-destroy tag discovery. */
export function awsTerraformMetadataTags(plan: AwsCePlan, value: unknown): Tag[] {
  const tags = rows(value),
    seen = new Set<string>();
  for (const tag of tags) {
    if (typeof tag.Key !== 'string' || typeof tag.Value !== 'string' || seen.has(tag.Key))
      throw Error('Malformed or duplicate original ownership metadata');
    seen.add(tag.Key);
  }
  for (const [key, expected] of Object.entries(requiredTags(plan)))
    if (tags.find((tag) => tag.Key === key)?.Value !== expected) throw Error('Original ownership metadata is foreign');
  for (const key of ['xcsh-node-index', 'xcsh-interface-index']) {
    const tag = tags.find((tag) => tag.Key === key);
    if (tag && (typeof tag.Value !== 'string' || !/^(?:0|[1-9][0-9]*)$/.test(tag.Value)))
      throw Error('Original node or interface metadata is malformed');
  }
  const node = tags.find((tag) => tag.Key === 'xcsh-node-index')?.Value;
  const index = tags.find((tag) => tag.Key === 'xcsh-interface-index')?.Value;
  const site = tags.find((tag) => tag.Key === 'ves-io-site-name')?.Value;
  if (
    (node !== undefined && (Number(node) < 1 || Number(node) > plan.intent.topology.nodeCount)) ||
    (index !== undefined &&
      (node === undefined || !plan.intent.interfaces.some((item) => item.index === Number(index)))) ||
    (site !== undefined &&
      site !== (node === undefined ? plan.intent.siteName : siteForNode(plan.intent, Number(node)).name))
  )
    throw Error('Original metadata node, interface or logical site differs');
  return tags
    .filter((tag) => keys.has(String(tag.Key)))
    .map((tag) => ({ Key: String(tag.Key), Value: String(tag.Value) }))
    .sort((a, b) => a.Key.localeCompare(b.Key));
}

export function awsTerraformMetadataProjection(plan: AwsCePlan, address: string, value: unknown): Tag[] {
  const tags = awsTerraformMetadataTags(plan, value);
  const nodeAddress = /\.node_([0-9]+)(?:_nic_([0-9]+))?$/.exec(address);
  if (
    nodeAddress &&
    (tags.find((tag) => tag.Key === 'xcsh-node-index')?.Value !== nodeAddress[1] ||
      (nodeAddress[2] !== undefined &&
        tags.find((tag) => tag.Key === 'xcsh-interface-index')?.Value !== nodeAddress[2]))
  )
    throw Error('Original metadata node or interface projection differs');
  return tags;
}

interface Checkpoint {
  schemaVersion: 1;
  engine: 'terraform';
  sourcePlanSha256: string;
  inventorySha256: string;
  metadataSha256: string;
  completed: string[];
  pending: { id: string; tags: Tag[]; requestSha256: string } | null;
  phase: 'retiring' | 'retired';
}
type Store = Pick<CeDeploymentStore, 'owner' | 'verify' | 'read' | 'write'>;
async function optional(store: Store, name: string): Promise<unknown> {
  try {
    return await store.read(name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

/** Called at the authorized public teardown terminal boundary, before retiring parent artifacts.
 * Each DeleteTags is conditional on exact original values, with durable intent before submission.
 * Ambiguous responses are resolved by fresh reads on replay, never an acknowledgement or inferred ID.
 */
export async function retireAwsTerraformMetadata(
  input: AwsCePlan,
  store: Store,
  raw: AwsExecApi,
  signal?: AbortSignal,
) {
  const plan = structuredClone(input);
  verifyAwsCePlan(plan);
  signal?.throwIfAborted();
  await store.verify();
  if (
    plan.engine !== 'terraform' ||
    canonicalSha256(store.owner) !== canonicalSha256(siteBindings(plan)[0].binding.owner)
  )
    throw Error('Metadata retirement owner or engine differs');
  const inventory = structuredClone(
    await store.read('terraform-cloud-teardown-inventory.json'),
  ) as AwsTerraformRetirementInventory;
  const { sha256, ...material } = inventory;
  if (
    canonicalSha256(material) !== sha256 ||
    inventory.sourcePlanSha256 !== plan.planSha256 ||
    inventory.accountId !== plan.intent.accountId ||
    inventory.region !== plan.intent.region ||
    inventory.deploymentId !== plan.intent.deploymentName ||
    !Array.isArray(inventory.resources) ||
    !Array.isArray(inventory.metadata) ||
    inventory.metadata.length > 1000
  )
    throw Error('Original authenticated metadata inventory unavailable');
  const metadata = inventory.metadata;
  const ids = new Set<string>();
  for (const row of metadata) {
    if (
      !row ||
      ids.has(row.id) ||
      !inventory.resources.some((resource) => resource.id === row.id && resource.type === row.type) ||
      !Object.hasOwn(resourceTypes, row.type) ||
      !new RegExp(`^${row.type === 'aws_ebs_volume' ? 'aws_instance' : row.type}\\.[a-z][a-z0-9_]*$`).test(
        row.address,
      ) ||
      canonicalSha256(awsTerraformMetadataProjection(plan, row.address, row.tags)) !== canonicalSha256(row.tags) ||
      (row.type === 'aws_ebs_volume'
        ? !inventory.resources.some(
            (resource) => resource.type === 'aws_instance' && resource.id === row.parentInstanceId,
          )
        : row.parentInstanceId !== undefined)
    )
      throw Error('Original metadata identity or lifecycle binding differs');
    ids.add(row.id);
  }
  const ec2Resources = inventory.resources.filter((row) => !row.type.startsWith('aws_lb'));
  if (ec2Resources.length !== metadata.length || ec2Resources.some((resource) => !ids.has(resource.id)))
    throw Error('Original metadata lifecycle inventory is incomplete');
  let checkpoint = (await optional(store, checkpointName)) as Checkpoint | undefined;
  const phaseValue = await optional(store, 'terraform-cloud-teardown.json');
  if (phaseValue === undefined) {
    const terminal = object(await store.read('aws-terraform-terminal-cleanup.json'));
    const evidence = object(terminal.evidence);
    if (
      checkpoint?.phase !== 'retired' ||
      terminal.sourcePlanSha256 !== plan.planSha256 ||
      canonicalSha256(terminal.owner) !== canonicalSha256(store.owner) ||
      evidence.inventorySha256 !== inventory.sha256 ||
      terminal.evidenceSha256 !== canonicalSha256(evidence)
    )
      throw Error('Retired source metadata has no bound terminal custody');
  } else {
    const phase = object(phaseValue);
    if (
      phase.schemaVersion !== 1 ||
      phase.engine !== 'terraform' ||
      phase.sourcePlanSha256 !== plan.planSha256 ||
      phase.phase !== 'retired'
    )
      throw Error('Cloud teardown has not converged before metadata retirement');
  }
  const api = scopedAwsApi(raw, plan.intent.awsProfile, signal);
  const request = async (service: string, operation: string, args: Json = {}) => {
    await store.verify();
    signal?.throwIfAborted();
    const response = await api.exec('aws', [
      service,
      operation,
      '--cli-input-json',
      JSON.stringify(args),
      '--no-paginate',
      '--region',
      plan.intent.region,
      '--output',
      'json',
    ]);
    signal?.throwIfAborted();
    if (response.exitCode !== 0) throw detectAwsError(response.stderr, response.exitCode);
    return object(JSON.parse(response.stdout));
  };
  const tags = async (filters: Json[]) => {
    const result: Json[] = [],
      tokens = new Set<string>();
    let token: string | undefined;
    do {
      const page = await request('ec2', 'describe-tags', { Filters: filters, ...(token ? { NextToken: token } : {}) });
      if (['NextMarker', 'nextToken', 'Marker'].some((key) => page[key] !== undefined))
        throw Error('Unsupported metadata pagination');
      result.push(...rows(page.Tags));
      if (result.length > 10000) throw Error('Metadata evidence exceeds bound');
      if (page.NextToken === undefined || page.NextToken === null) token = undefined;
      else {
        if (typeof page.NextToken !== 'string' || !page.NextToken || tokens.has(page.NextToken) || tokens.size >= 1000)
          throw Error('Incomplete metadata pagination');
        token = page.NextToken;
        tokens.add(token);
      }
    } while (token);
    return result;
  };
  const knownDeploymentTags = async () => {
    const found = await tags([
      { Name: 'key', Values: ['xcsh-deployment-id'] },
      { Name: 'value', Values: [plan.intent.deploymentName] },
    ]);
    const seen = new Set<string>();
    for (const tag of found) {
      const original = metadata.find((row) => row.id === tag.ResourceId);
      if (
        typeof tag.ResourceId !== 'string' ||
        !ids.has(tag.ResourceId) ||
        seen.has(tag.ResourceId) ||
        !original ||
        tag.ResourceType !== resourceTypes[original.type] ||
        tag.Key !== 'xcsh-deployment-id' ||
        tag.Value !== plan.intent.deploymentName
      )
        throw Error('Deployment metadata has unknown or ambiguous lifecycle origin');
      seen.add(tag.ResourceId);
    }
    return found;
  };
  const currentTags = async (row: AwsTerraformMetadataIdentity, observed?: Json[]) => {
    const found = observed
      ? observed.filter((tag) => tag.ResourceId === row.id)
      : await tags([{ Name: 'resource-id', Values: [row.id] }]);
    const seen = new Set<string>();
    for (const tag of found) {
      if (
        tag.ResourceId !== row.id ||
        tag.ResourceType !== resourceTypes[row.type] ||
        typeof tag.Key !== 'string' ||
        typeof tag.Value !== 'string' ||
        seen.has(tag.Key)
      )
        throw Error('Substituted or duplicate metadata evidence');
      seen.add(tag.Key);
      if (keys.has(tag.Key) && !row.tags.some((expected) => expected.Key === tag.Key && expected.Value === tag.Value))
        throw Error('Current ownership metadata is foreign to original intent');
    }
    return found
      .filter((tag) => keys.has(String(tag.Key)))
      .map((tag) => ({ Key: String(tag.Key), Value: String(tag.Value) }))
      .sort((a, b) => a.Key.localeCompare(b.Key));
  };
  const allCurrentTags = async () => {
    const found = metadata.length ? await tags([{ Name: 'resource-id', Values: [...ids] }]) : [];
    if (found.some((tag) => typeof tag.ResourceId !== 'string' || !ids.has(tag.ResourceId)))
      throw Error('Substituted batch metadata identity');
    const result = new Map<string, Tag[]>();
    for (const row of metadata) result.set(row.id, await currentTags(row, found));
    return result;
  };
  const absent = async () => {
    const result = await collectAwsTerraformAbsence(plan, inventory, raw, signal);
    if (result.status !== 'absent-or-retired') throw Error('Current complete cloud retirement unavailable');
  };
  const retiredIdentity = async (row: AwsTerraformMetadataIdentity) => {
    const descriptors: Record<string, [string, string, string, string]> = {
      aws_vpc: ['describe-vpcs', 'Vpcs', 'VpcId', 'vpc-id'],
      aws_subnet: ['describe-subnets', 'Subnets', 'SubnetId', 'subnet-id'],
      aws_instance: ['describe-instances', 'Reservations', 'InstanceId', 'instance-id'],
      aws_network_interface: [
        'describe-network-interfaces',
        'NetworkInterfaces',
        'NetworkInterfaceId',
        'network-interface-id',
      ],
      aws_security_group: ['describe-security-groups', 'SecurityGroups', 'GroupId', 'group-id'],
      aws_route_table: ['describe-route-tables', 'RouteTables', 'RouteTableId', 'route-table-id'],
      aws_internet_gateway: [
        'describe-internet-gateways',
        'InternetGateways',
        'InternetGatewayId',
        'internet-gateway-id',
      ],
      aws_eip: ['describe-addresses', 'Addresses', 'AllocationId', 'allocation-id'],
      aws_ebs_volume: ['describe-volumes', 'Volumes', 'VolumeId', 'volume-id'],
      aws_ec2_transit_gateway_vpc_attachment: [
        'describe-transit-gateway-vpc-attachments',
        'TransitGatewayVpcAttachments',
        'TransitGatewayAttachmentId',
        'transit-gateway-attachment-id',
      ],
      aws_ec2_transit_gateway_connect: [
        'describe-transit-gateway-connects',
        'TransitGatewayConnects',
        'TransitGatewayAttachmentId',
        'transit-gateway-attachment-id',
      ],
      aws_ec2_transit_gateway_connect_peer: [
        'describe-transit-gateway-connect-peers',
        'TransitGatewayConnectPeers',
        'TransitGatewayConnectPeerId',
        'transit-gateway-connect-peer-id',
      ],
    };
    const [operation, collection, idKey, filter] = descriptors[row.type];
    const page = await request('ec2', operation, { Filters: [{ Name: filter, Values: [row.id] }] });
    if (['NextToken', 'NextMarker', 'nextToken', 'Marker'].some((key) => page[key] !== undefined && page[key] !== null))
      throw Error('Partial metadata resource retirement evidence');
    let found = rows(page[collection]);
    if (row.type === 'aws_instance') found = found.flatMap((reservation) => rows(reservation.Instances));
    if (found.length > 1 || found.some((item) => item[idKey] !== row.id))
      throw Error('Substituted metadata resource identity');
    if (!found.length) return;
    const state = row.type === 'aws_instance' ? object(found[0].State).Name : found[0].State;
    if (
      !(row.type === 'aws_instance'
        ? state === 'terminated'
        : (row.type === 'aws_ebs_volume' || row.type.startsWith('aws_ec2_transit_gateway_')) && state === 'deleted')
    )
      throw Error('Metadata resource is active or retirement state is unknown');
  };
  if ((await request('sts', 'get-caller-identity')).Account !== plan.intent.accountId)
    throw Error('Metadata account differs');
  await absent();
  await knownDeploymentTags();
  // Validate every current identity before the first mutation, including foreign/duplicate tags.
  const initialTags = await allCurrentTags();
  const binding = {
    schemaVersion: 1 as const,
    engine: 'terraform' as const,
    sourcePlanSha256: plan.planSha256,
    inventorySha256: inventory.sha256,
    metadataSha256: canonicalSha256(metadata),
  };
  if (checkpoint === undefined) {
    checkpoint = { ...binding, completed: [], pending: null, phase: 'retiring' };
    await store.write(checkpointName, checkpoint);
  }
  if (
    !checkpoint ||
    Object.entries(binding).some(([key, expected]) => Reflect.get(checkpoint as object, key) !== expected) ||
    !Array.isArray(checkpoint.completed) ||
    new Set(checkpoint.completed).size !== checkpoint.completed.length ||
    checkpoint.completed.some((id) => !ids.has(id)) ||
    !['retiring', 'retired'].includes(checkpoint.phase) ||
    (checkpoint.phase === 'retired' && (checkpoint.pending !== null || checkpoint.completed.length !== metadata.length))
  )
    throw Error('Original metadata retirement checkpoint differs');
  if (checkpoint.pending !== null) {
    const pending = checkpoint.pending;
    const row = metadata.find((row) => row.id === pending?.id);
    if (
      !row ||
      checkpoint.completed.includes(row.id) ||
      !Array.isArray(pending.tags) ||
      !pending.tags.length ||
      pending.tags.some((tag) => !row.tags.some((original) => canonicalSha256(tag) === canonicalSha256(original))) ||
      new Set(pending.tags.map((tag) => tag.Key)).size !== pending.tags.length ||
      pending.requestSha256 !== canonicalSha256({ Resources: [row.id], Tags: pending.tags })
    )
      throw Error('Original pending metadata request differs');
  }
  const save = () => store.write(checkpointName, checkpoint);
  for (const row of metadata) {
    const remaining = initialTags.get(row.id);
    if (!remaining) throw Error('Original metadata batch identity unavailable');
    if (checkpoint.completed.includes(row.id)) {
      if (remaining.length) throw Error('Previously retired metadata has reappeared');
      continue;
    }
    if (checkpoint.pending && checkpoint.pending.id !== row.id) throw Error('Metadata replay order differs');
    if (remaining.length) {
      // Reuse the exact original pending request after ambiguity; deletion is conditional on values.
      const args = checkpoint.pending
        ? { Resources: [row.id], Tags: checkpoint.pending.tags }
        : { Resources: [row.id], Tags: remaining };
      if (!checkpoint.pending) {
        checkpoint.pending = { id: row.id, tags: remaining, requestSha256: canonicalSha256(args) };
        await save();
      }
      await retiredIdentity(row);
      await currentTags(row);
      await request('ec2', 'delete-tags', args);
      if ((await currentTags(row)).length) throw Error('Metadata deletion acknowledged without verified retirement');
    }
    checkpoint.completed.push(row.id);
    checkpoint.pending = null;
    await save();
  }
  await absent();
  if ((await knownDeploymentTags()).length) throw Error('Ownership metadata inventory remains');
  if ([...(await allCurrentTags())].some(([, tags]) => tags.length)) throw Error('Ownership metadata remains');
  if (checkpoint.phase !== 'retired') {
    checkpoint.phase = 'retired';
    await save();
  }
  return { status: 'metadata-retired' as const, ...binding, resourceCount: metadata.length };
}
