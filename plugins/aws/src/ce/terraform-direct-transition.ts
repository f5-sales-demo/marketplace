import { createHash } from 'node:crypto';
import type { TerraformRelinquishmentIntent } from '../../../terraform/src/runner';
import type { AwsExecApi } from '../aws/exec';
import { canonicalSha256, resourceConfiguration } from './canonical';
import { scopedAwsApi } from './scoped-exec';
import { renderAwsTerraformDirectImport } from './terraform-direct-import';
import type { AwsTerraformDirectOwnership } from './terraform-direct-ownership';
import type { AwsCePlan } from './types';

type Json = Record<string, unknown>;
export type AwsTerraformDirectPhase = 'original' | 'ce';
const object = (value: unknown): Json => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Malformed direct transition evidence');
  return value as Json;
};
const rows = (value: unknown): Json[] => {
  if (!Array.isArray(value)) throw Error('Incomplete direct transition evidence');
  return value.map(object);
};
function validate(plan: AwsCePlan, ownership: AwsTerraformDirectOwnership) {
  // The import validator binds the original snapshot, selected destinations and provider IDs.
  const imported = renderAwsTerraformDirectImport(
    plan,
    ownership,
    JSON.stringify({ resource: {}, output: { ce_vpc_id: { value: ownership.vpcId } } }),
  );
  if (
    plan.interfaces.length !== 2 ||
    plan.interfaces[0].index !== 0 ||
    plan.interfaces[1].index !== 1 ||
    plan.interfaces[0].role !== 'slo' ||
    plan.interfaces[1].role !== 'sli' ||
    ownership.interfaces.length !== 2 ||
    ownership.interfaces.some(
      (i, index) =>
        i.index !== index ||
        !/^eni-[a-f0-9]{8,17}$/.test(i.id) ||
        !/^(?:[a-f0-9]{2}:){5}[a-f0-9]{2}$/.test(i.mac) ||
        i.vpcId !== ownership.vpcId ||
        i.subnetId !== (index ? ownership.sliSubnetId : ownership.sloSubnetId),
    ) ||
    ownership.interfaces[0].id === ownership.interfaces[1].id ||
    ownership.interfaces[0].mac === ownership.interfaces[1].mac ||
    ownership.sloSubnetId === ownership.sliSubnetId ||
    !/^i-[a-f0-9]{8,17}$/.test(ownership.instanceId) ||
    ownership.routes.some((r) => r.networkInterfaceId !== ownership.interfaces[1].id)
  )
    throw Error('Direct transition interface identity differs or is unresolved');
  const ids = [...new Set(ownership.routes.map((r) => r.routeTableId))].sort();
  if (
    ownership.tables.length !== ids.length ||
    new Set(ownership.tables.map((t) => t.RouteTableId)).size !== ids.length
  )
    throw Error('Direct transition original table inventory incomplete');
  for (const table of ownership.tables) {
    const id = String(table.RouteTableId),
      before = plan.rollback?.resources.filter((r) => r.id === id);
    if (
      !ids.includes(id) ||
      table.OwnerId !== plan.accountId ||
      table.VpcId !== ownership.vpcId ||
      before?.length !== 1 ||
      rows(before[0].before.RouteTables).length !== 1 ||
      canonicalSha256(
        resourceConfiguration([
          { id, region: plan.region, exists: true, owned: false, tags: {}, state: { RouteTables: [table] } },
        ]),
      ) !==
        canonicalSha256(
          resourceConfiguration([
            { id, region: plan.region, exists: true, owned: false, tags: {}, state: before[0].before },
          ]),
        )
    )
      throw Error('Direct transition original table is not bound to immutable plan');
    const associations = rows(table.Associations),
      routes = rows(table.Routes);
    if (
      !associations.length ||
      associations.some(
        (a) =>
          a.Main !== false ||
          [ownership.sloSubnetId, ownership.sliSubnetId].includes(String(a.SubnetId)) ||
          object(a.AssociationState).State !== 'associated',
      ) ||
      routes.some((r) => r.State !== 'active')
    )
      throw Error('Direct transition original network state unavailable or overlaps CE');
  }
  return imported;
}
function routeConfiguration(route: AwsTerraformDirectOwnership['routes'][number], phase: AwsTerraformDirectPhase) {
  if (!['ce', 'original'].includes(phase)) throw Error('Direct transition phase unsupported');
  return {
    route_table_id: route.routeTableId,
    destination_cidr_block: route.destinationCidr,
    ...(phase === 'ce'
      ? { network_interface_id: route.networkInterfaceId }
      : { [route.originalTarget.field]: route.originalTarget.id }),
  };
}

/** Internal translation only; public brownfield mutation admission remains closed. */
export function renderAwsTerraformDirectTransition(
  plan: AwsCePlan,
  ownership: AwsTerraformDirectOwnership,
  currentConfiguration: string,
  from: AwsTerraformDirectPhase,
  to: AwsTerraformDirectPhase | 'relinquished',
  stateIds?: Record<string, string>,
): { configuration: string; intents: TerraformRelinquishmentIntent[] } {
  const imported = validate(plan, ownership);
  if (
    !['original', 'ce'].includes(from) ||
    !['original', 'ce', 'relinquished'].includes(to) ||
    (to === 'relinquished' && from !== 'original')
  )
    throw Error('Direct transition must restore originals before relinquishment');
  const config = object(JSON.parse(currentConfiguration));
  const resources = object(config.resource);
  const configured = object(resources.aws_route);
  const output = object(config.output);
  if (object(output.ce_vpc_id).value !== ownership.vpcId || Object.hasOwn(config, 'removed'))
    throw Error('Direct transition configuration ownership differs');
  if (Object.hasOwn(config, 'import')) {
    if (
      from !== 'original' ||
      canonicalSha256(config.import) !== canonicalSha256(JSON.parse(imported.configuration).import)
    )
      throw Error('Direct transition import ownership differs');
    delete config.import;
  }
  for (const route of ownership.routes) {
    const name = route.address.slice('aws_route.'.length);
    if (canonicalSha256(configured[name]) !== canonicalSha256(routeConfiguration(route, from)))
      throw Error('Direct transition source route target or configuration differs');
    if (to === 'relinquished') delete configured[name];
    else configured[name] = routeConfiguration(route, to);
  }
  if (!Object.keys(configured).length) delete resources.aws_route;
  if (!Object.keys(resources).length) delete config.resource;
  if (to === 'relinquished')
    config.removed = ownership.routes.map((r) => ({ from: r.address, lifecycle: { destroy: false } }));
  let intents: TerraformRelinquishmentIntent[] = [];
  if (to === 'relinquished') {
    if (
      !stateIds ||
      canonicalSha256(Object.keys(stateIds).sort()) !== canonicalSha256(ownership.routes.map((r) => r.address).sort())
    )
      throw Error('Direct relinquishment requires exact state identities');
    intents = imported.intents.map((intent) => {
      const route = ownership.routes.find((r) => r.address === intent.address);
      if (!route) throw Error('Direct relinquishment route missing');
      // AWS provider 6.63.0 routeCreateID uses IEEE CRC32, distinct from its import selector.
      let crc = 0xffffffff;
      for (const byte of Buffer.from(route.destinationCidr)) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
      }
      const expectedId = `r-${route.routeTableId}${(crc ^ 0xffffffff) >>> 0}`;
      if (stateIds[intent.address] !== expectedId)
        throw Error('Direct relinquishment state ID differs from provider route identity');
      return { ...intent, idSha256: createHash('sha256').update(expectedId).digest('hex') };
    });
  }
  return { configuration: JSON.stringify(config), intents };
}

/** Fresh cloud reads prove route targets and cloud interface identity, never CE heartbeat freshness. */
export async function observeAwsTerraformDirectPhase(
  plan: AwsCePlan,
  ownership: AwsTerraformDirectOwnership,
  phase: AwsTerraformDirectPhase,
  raw: AwsExecApi,
  signal?: AbortSignal,
) {
  validate(plan, ownership);
  if (!['original', 'ce'].includes(phase)) throw Error('Direct transition phase unsupported');
  const api = scopedAwsApi(raw, plan.intent.awsProfile, signal);
  const read = async (args: string[]) => {
    const result = await api.exec('aws', [...args, '--region', plan.region, '--output', 'json']);
    if (result.exitCode) throw Error('Direct transition observation unavailable');
    const data = object(JSON.parse(result.stdout));
    if (['NextToken', 'nextToken', 'NextMarker', 'Marker'].some((k) => Object.hasOwn(data, k)))
      throw Error('Partial direct transition observation');
    return data;
  };
  if ((await read(['sts', 'get-caller-identity'])).Account !== ownership.accountId)
    throw Error('Direct transition cloud account differs');
  const tableIds = [...new Set(ownership.routes.map((r) => r.routeTableId))].sort();
  const expected = structuredClone(ownership.tables);
  for (const table of expected) {
    for (const route of ownership.routes.filter((r) => r.routeTableId === table.RouteTableId)) {
      const matches = rows(table.Routes).filter((r) => r.DestinationCidrBlock === route.destinationCidr);
      if (matches.length !== 1) throw Error('Direct transition original table route ambiguous');
      if (phase === 'ce') {
        const target = {
          gateway_id: 'GatewayId',
          nat_gateway_id: 'NatGatewayId',
          network_interface_id: 'NetworkInterfaceId',
          transit_gateway_id: 'TransitGatewayId',
          vpc_peering_connection_id: 'VpcPeeringConnectionId',
        }[route.originalTarget.field];
        if (!target || matches[0][target] !== route.originalTarget.id)
          throw Error('Direct transition original table target differs');
        delete matches[0][target];
        matches[0].NetworkInterfaceId = route.networkInterfaceId;
      }
    }
  }
  const tableDigest = (tables: Json[]) =>
    canonicalSha256(
      resourceConfiguration(
        tables.map((t) => ({
          id: String(t.RouteTableId),
          region: plan.region,
          exists: true,
          owned: false,
          tags: {},
          state: { RouteTables: [t] },
        })),
      ),
    );
  const observe = async () => {
    const enis = rows(
      (
        await read([
          'ec2',
          'describe-network-interfaces',
          '--network-interface-ids',
          ...ownership.interfaces.map((i) => i.id),
        ])
      ).NetworkInterfaces,
    );
    if (enis.length !== 2 || new Set(enis.map((e) => e.NetworkInterfaceId)).size !== 2)
      throw Error('Direct transition interface inventory incomplete');
    for (const i of ownership.interfaces) {
      const e = enis.find((e) => e.NetworkInterfaceId === i.id);
      if (!e) throw Error('Direct transition interface missing');
      const attachment = object(e.Attachment),
        tags = rows(e.TagSet);
      const expectedTags = {
        'xcsh-managed-by': 'aws-ce',
        'xcsh-execution-engine': 'terraform',
        'xcsh-deployment-id': plan.deploymentName,
        'xcsh-plan-sha256': plan.planSha256,
        'xcsh-node-index': '1',
        'xcsh-interface-index': String(i.index),
      };
      if (
        e.OwnerId !== ownership.accountId ||
        e.Status !== 'in-use' ||
        e.SourceDestCheck !== false ||
        e.VpcId !== i.vpcId ||
        e.SubnetId !== i.subnetId ||
        e.MacAddress !== i.mac ||
        attachment.InstanceId !== ownership.instanceId ||
        attachment.DeviceIndex !== i.index ||
        Object.entries(expectedTags).some(
          ([key, value]) =>
            tags.filter((t) => t.Key === key).length !== 1 || tags.find((t) => t.Key === key)?.Value !== value,
        )
      )
        throw Error('Direct transition cloud interface ownership differs');
    }
    const tables = rows((await read(['ec2', 'describe-route-tables', '--route-table-ids', ...tableIds])).RouteTables);
    if (
      tables.some(
        (t) =>
          rows(t.Routes).some((r) => r.State !== 'active') ||
          rows(t.Associations).some((a) => object(a.AssociationState).State !== 'associated'),
      )
    )
      throw Error('Direct transition route or association operational state unavailable');
    if (
      tables.length !== tableIds.length ||
      new Set(tables.map((t) => t.RouteTableId)).size !== tableIds.length ||
      tables.some((t) => !tableIds.includes(String(t.RouteTableId))) ||
      tableDigest(tables) !== tableDigest(expected)
    )
      throw Error('Direct transition full route table evidence differs');
    return {
      enis: enis.sort((a, b) => String(a.NetworkInterfaceId).localeCompare(String(b.NetworkInterfaceId))),
      tables: tables.sort((a, b) => String(a.RouteTableId).localeCompare(String(b.RouteTableId))),
    };
  };
  const first = await observe(),
    second = await observe();
  if (canonicalSha256(first) !== canonicalSha256(second)) throw Error('Direct transition changed during observation');
  return {
    schemaVersion: 1 as const,
    kind: 'aws-ce-terraform-direct-cloud-observation' as const,
    phase,
    sourcePlanSha256: plan.planSha256,
    ownershipSha256: ownership.snapshotSha256,
    evidenceSha256: canonicalSha256(second),
    observedAt: new Date().toISOString(),
  };
}
