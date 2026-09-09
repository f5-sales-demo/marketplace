import type { PlanReceipt } from '../../../terraform/src/runner';
import type { TerraformSession } from '../../../terraform/src/service';
import type { AwsExecApi } from '../aws/exec';
import { verifyAwsCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import { scopedAwsApi } from './scoped-exec';
import type { AwsTerraformRetirementInventory } from './terraform-retirement-inventory';
import type { AwsCePlan } from './types';

type Json = Record<string, unknown>;
function object(value: unknown): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed AWS teardown identity');
  return value as Json;
}
function rows(value: unknown): Json[] {
  if (!Array.isArray(value)) throw new Error('Incomplete AWS teardown inventory');
  return value.map(object);
}
const tagged: Record<string, [string, string, string, string, string]> = {
  aws_vpc: ['describe-vpcs', '--vpc-ids', 'Vpcs', 'VpcId', 'vpc'],
  aws_subnet: ['describe-subnets', '--subnet-ids', 'Subnets', 'SubnetId', 'subnet'],
  aws_instance: ['describe-instances', '--instance-ids', 'Instances', 'InstanceId', 'i'],
  aws_network_interface: [
    'describe-network-interfaces',
    '--network-interface-ids',
    'NetworkInterfaces',
    'NetworkInterfaceId',
    'eni',
  ],
  aws_security_group: ['describe-security-groups', '--group-ids', 'SecurityGroups', 'GroupId', 'sg'],
  aws_route_table: ['describe-route-tables', '--route-table-ids', 'RouteTables', 'RouteTableId', 'rtb'],
  aws_internet_gateway: [
    'describe-internet-gateways',
    '--internet-gateway-ids',
    'InternetGateways',
    'InternetGatewayId',
    'igw',
  ],
  aws_eip: ['describe-addresses', '--allocation-ids', 'Addresses', 'AllocationId', 'eipalloc'],
  aws_ec2_transit_gateway_vpc_attachment: [
    'describe-transit-gateway-vpc-attachments',
    '--transit-gateway-attachment-ids',
    'TransitGatewayVpcAttachments',
    'TransitGatewayAttachmentId',
    'tgw-attach',
  ],
  aws_ec2_transit_gateway_connect: [
    'describe-transit-gateway-connects',
    '--transit-gateway-attachment-ids',
    'TransitGatewayConnects',
    'TransitGatewayAttachmentId',
    'tgw-attach',
  ],
  aws_ec2_transit_gateway_connect_peer: [
    'describe-transit-gateway-connect-peers',
    '--transit-gateway-connect-peer-ids',
    'TransitGatewayConnectPeers',
    'TransitGatewayConnectPeerId',
    'tgw-connect-peer',
  ],
};
const relationships: Record<string, string[]> = {
  aws_route: [
    'route_table_id',
    'destination_cidr_block',
    'destination_ipv6_cidr_block',
    'destination_prefix_list_id',
    'gateway_id',
    'transit_gateway_id',
  ],
  aws_route_table_association: ['route_table_id', 'subnet_id', 'gateway_id'],
  aws_eip_association: ['allocation_id', 'network_interface_id', 'instance_id'],
  aws_ec2_transit_gateway_route_table_association: ['transit_gateway_attachment_id', 'transit_gateway_route_table_id'],
  aws_ec2_transit_gateway_route_table_propagation: ['transit_gateway_attachment_id', 'transit_gateway_route_table_id'],
};

/** Read-only guard for the CE foundation/Connect destroy plan. Re-run at the apply boundary.
 * Platform drain, site deletion, brownfield restoration and final convergence are separate steps.
 */
export async function verifyAwsTerraformDestroyOwnership(
  plan: AwsCePlan,
  receipt: PlanReceipt,
  session: Pick<TerraformSession, 'readPlannedResourceFields'>,
  rawApi: AwsExecApi,
  env: Record<string, string | undefined>,
  signal?: AbortSignal,
) {
  verifyAwsCePlan(plan);
  const intent = plan.intent;
  if (
    plan.engine !== 'terraform' ||
    receipt.schemaVersion !== 1 ||
    receipt.engine !== 'terraform' ||
    receipt.operation !== 'destroy' ||
    receipt.deploymentId !== intent.deploymentName ||
    receipt.backendIdentity !== `local:${intent.deploymentName}` ||
    (receipt.actionInvocations?.length ?? 0) > 0 ||
    !Array.isArray(receipt.changes) ||
    receipt.changes.some(
      (change) =>
        change.actions.join(',') !== 'delete' ||
        !new RegExp(`^${change.type}\\.[a-z][a-z0-9_]*$`).test(change.address) ||
        (!Object.hasOwn(tagged, change.type) && !Object.hasOwn(relationships, change.type)),
    ) ||
    new Set(receipt.changes.map((change) => change.address)).size !== receipt.changes.length
  )
    throw new Error('Exact owning AWS Terraform destroy plan with supported resource types required');
  const api = scopedAwsApi(rawApi, intent.awsProfile, signal);
  const run = async (service: string, operation: string, args: string[] = []) => {
    const result = await api.exec('aws', [service, operation, ...args, '--region', intent.region, '--output', 'json']);
    signal?.throwIfAborted();
    if (result.exitCode !== 0) throw new Error('AWS teardown ownership observation unavailable');
    let value: Json;
    try {
      value = object(JSON.parse(result.stdout));
    } catch {
      throw new Error('Malformed AWS teardown response');
    }
    if (value.NextToken || value.NextMarker || value.nextToken) throw new Error('Partial AWS teardown inventory');
    return value;
  };
  if ((await run('sts', 'get-caller-identity')).Account !== intent.accountId)
    throw new Error('AWS teardown account differs from deployment');
  const fields = await session.readPlannedResourceFields(
    receipt,
    receipt.changes.length
      ? Object.fromEntries(
          receipt.changes.map((change) => [change.address, ['id', 'region', ...(relationships[change.type] ?? [])]]),
        )
      : { 'aws_vpc.ce': ['id'] },
    env,
    signal,
  );
  if (!receipt.changes.length) {
    if (fields['aws_vpc.ce'] !== null || Object.keys(fields).length !== 1)
      throw new Error('Empty Terraform destroy plan identity differs');
    delete fields['aws_vpc.ce'];
  }
  if (Object.keys(fields).length !== receipt.changes.length)
    throw new Error('Incomplete Terraform teardown projection');
  const states = receipt.changes.map((change) => {
    const value = object(fields[change.address]);
    if (typeof value.id !== 'string' || !value.id || value.region !== intent.region)
      throw new Error('Terraform teardown resource identity or region differs');
    return { ...change, value };
  });
  const owned = (value: Json, key = 'Tags') => {
    const tags = rows(value[key]);
    const expected = {
      'xcsh-managed-by': 'aws-ce',
      'xcsh-execution-engine': 'terraform',
      'xcsh-deployment-id': intent.deploymentName,
      'xcsh-plan-sha256': plan.planSha256,
    };
    if (
      Object.entries(expected).some(([key, expectedValue]) => {
        const matching = tags.filter((tag) => tag.Key === key);
        return matching.length !== 1 || matching[0].Value !== expectedValue;
      })
    )
      throw new Error('AWS teardown resource is foreign to this deployment, plan, or engine');
  };
  const live = new Map<string, { type: string; value: Json }>();
  for (const [type, [operation, flag, collection, idKey, prefix]] of Object.entries(tagged)) {
    const selected = states.filter((state) => state.type === type);
    if (!selected.length) continue;
    const ids = selected.map((state) => String(state.value.id));
    if (new Set(ids).size !== ids.length || ids.some((id) => !new RegExp(`^${prefix}-[a-f0-9]{8,21}$`).test(id)))
      throw new Error('Malformed or duplicate Terraform teardown resource IDs');
    const response = await run('ec2', operation, [flag, ...ids]);
    const observed =
      type === 'aws_instance'
        ? rows(response.Reservations).flatMap((reservation) => rows(reservation.Instances))
        : rows(response[collection]);
    if (
      observed.length !== ids.length ||
      new Set(observed.map((item) => item[idKey])).size !== ids.length ||
      observed.some((item) => !ids.includes(String(item[idKey])))
    )
      throw new Error('AWS substituted or omitted teardown resource identities');
    for (const item of observed) {
      owned(item, type === 'aws_network_interface' ? 'TagSet' : 'Tags');
      const id = String(item[idKey]);
      if (live.has(id)) throw new Error('Duplicate teardown resource identity across types');
      live.set(id, { type, value: item });
    }
  }
  const parent = (id: unknown, types: string[]) => {
    const result = typeof id === 'string' ? live.get(id) : undefined;
    if (!result || !types.includes(result.type)) throw new Error('Teardown relationship has an unowned parent');
    return result.value;
  };
  const volumeIds = new Set<string>();
  for (const { type, value } of live.values())
    if (type === 'aws_instance') {
      const nics = rows(value.NetworkInterfaces);
      if (!nics.length) throw new Error('Instance teardown NIC inventory is unavailable');
      for (const nic of nics) parent(nic.NetworkInterfaceId, ['aws_network_interface']);
      const disks = rows(value.BlockDeviceMappings);
      if (!disks.length) throw new Error('Instance teardown disk inventory is unavailable');
      for (const disk of disks) {
        const id = object(disk.Ebs).VolumeId;
        if (typeof id !== 'string' || !/^vol-[a-f0-9]{8,21}$/.test(id))
          throw new Error('Instance teardown volume identity is unavailable');
        volumeIds.add(id);
      }
    }
  if (volumeIds.size) {
    const volumes = rows((await run('ec2', 'describe-volumes', ['--volume-ids', ...volumeIds])).Volumes);
    if (
      volumes.length !== volumeIds.size ||
      new Set(volumes.map((volume) => volume.VolumeId)).size !== volumeIds.size ||
      volumes.some((volume) => !volumeIds.has(String(volume.VolumeId)))
    )
      throw new Error('Instance teardown volume inventory differs');
    for (const volume of volumes) owned(volume);
  }
  const tables = new Map<string, Json>();
  const tgwTable = async (id: unknown) => {
    if (typeof id !== 'string' || !/^tgw-rtb-[a-f0-9]{8,21}$/.test(id)) throw new Error('Invalid referenced TGW table');
    const cached = tables.get(id);
    if (cached) return cached;
    const gateways = rows(
      (await run('ec2', 'describe-transit-gateways', ['--transit-gateway-ids', intent.routing.transitGatewayId ?? '']))
        .TransitGateways,
    );
    if (
      gateways.length !== 1 ||
      gateways[0].TransitGatewayId !== intent.routing.transitGatewayId ||
      gateways[0].OwnerId !== intent.accountId
    )
      throw new Error('Referenced transit gateway ownership differs');
    const tableRows = rows(
      (await run('ec2', 'describe-transit-gateway-route-tables', ['--transit-gateway-route-table-ids', id]))
        .TransitGatewayRouteTables,
    );
    if (
      tableRows.length !== 1 ||
      tableRows[0].TransitGatewayRouteTableId !== id ||
      tableRows[0].TransitGatewayId !== intent.routing.transitGatewayId
    )
      throw new Error('Referenced transit gateway table identity differs');
    const result = {
      associations: rows(
        (await run('ec2', 'get-transit-gateway-route-table-associations', ['--transit-gateway-route-table-id', id]))
          .Associations,
      ),
      propagations: rows(
        (await run('ec2', 'get-transit-gateway-route-table-propagations', ['--transit-gateway-route-table-id', id]))
          .TransitGatewayRouteTablePropagations,
      ),
    };
    tables.set(id, result);
    return result;
  };
  for (const { type, value } of states) {
    if (type === 'aws_route') {
      const table = parent(value.route_table_id, ['aws_route_table']);
      if (
        typeof value.destination_cidr_block !== 'string' ||
        !value.destination_cidr_block ||
        value.destination_ipv6_cidr_block ||
        value.destination_prefix_list_id
      )
        throw new Error('Teardown route destination requires explicit translation');
      const matches = rows(table.Routes).filter((route) => route.DestinationCidrBlock === value.destination_cidr_block);
      if (matches.length !== 1 || (value.gateway_id && value.transit_gateway_id))
        throw new Error('Teardown route is ambiguous');
      if (value.gateway_id) {
        parent(value.gateway_id, ['aws_internet_gateway']);
        if (matches[0].GatewayId !== value.gateway_id) throw new Error('Teardown route gateway differs');
      } else if (
        !value.transit_gateway_id ||
        value.transit_gateway_id !== intent.routing.transitGatewayId ||
        matches[0].TransitGatewayId !== value.transit_gateway_id
      )
        throw new Error('Teardown route target differs');
    } else if (type === 'aws_route_table_association') {
      const table = parent(value.route_table_id, ['aws_route_table']);
      parent(value.subnet_id, ['aws_subnet']);
      const matches = rows(table.Associations).filter((edge) => edge.RouteTableAssociationId === value.id);
      if (
        value.gateway_id ||
        matches.length !== 1 ||
        matches[0].SubnetId !== value.subnet_id ||
        matches[0].RouteTableId !== value.route_table_id
      )
        throw new Error('Teardown subnet association differs');
    } else if (type === 'aws_eip_association') {
      const eip = parent(value.allocation_id, ['aws_eip']);
      parent(value.network_interface_id, ['aws_network_interface']);
      if (value.instance_id) parent(value.instance_id, ['aws_instance']);
      if (
        (value.instance_id && eip.InstanceId !== value.instance_id) ||
        eip.AssociationId !== value.id ||
        eip.NetworkInterfaceId !== value.network_interface_id
      )
        throw new Error('Teardown EIP association differs');
    } else if (type.startsWith('aws_ec2_transit_gateway_route_table_')) {
      parent(value.transit_gateway_attachment_id, [
        'aws_ec2_transit_gateway_connect',
        'aws_ec2_transit_gateway_vpc_attachment',
      ]);
      const association = type.endsWith('_association');
      if (
        !(association ? intent.routing.associations : intent.routing.propagations)?.includes(
          String(value.transit_gateway_route_table_id),
        )
      )
        throw new Error('Teardown TGW table is outside approved references');
      const table = await tgwTable(value.transit_gateway_route_table_id);
      const matches = rows(table[association ? 'associations' : 'propagations']).filter(
        (edge) => edge.TransitGatewayAttachmentId === value.transit_gateway_attachment_id,
      );
      if (matches.length !== 1) throw new Error('Teardown TGW relationship is absent or ambiguous');
    }
  }
  const material: Omit<AwsTerraformRetirementInventory, 'sha256'> = {
    schemaVersion: 1,
    engine: 'terraform',
    accountId: intent.accountId,
    region: intent.region,
    deploymentId: intent.deploymentName,
    sourcePlanSha256: plan.planSha256,
    terraformPlanSha256: receipt.planSha256,
    resources: [...live.entries()]
      .map(([id, row]) => ({ type: row.type, id }))
      .concat([...volumeIds].map((id) => ({ type: 'aws_ebs_volume', id }))),
    tgwEdges: states
      .filter((row) => row.type.startsWith('aws_ec2_transit_gateway_route_table_'))
      .map((row) => ({
        kind: row.type.endsWith('_association') ? 'association' : 'propagation',
        tableId: String(row.value.transit_gateway_route_table_id),
        attachmentId: String(row.value.transit_gateway_attachment_id),
      })),
  };
  return {
    inventory: { ...material, sha256: canonicalSha256(material) },
    source: 'aws-cli-live+terraform-saved-plan',
    observedAt: new Date().toISOString(),
    engine: 'terraform' as const,
    accountId: intent.accountId,
    region: intent.region,
    planSha256: plan.planSha256,
    terraformPlanSha256: receipt.planSha256,
    configurationSha256: receipt.configurationSha256,
    resourceCount: states.length,
    attachedVolumeCount: volumeIds.size,
  };
}
