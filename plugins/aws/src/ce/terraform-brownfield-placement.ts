import { verifyAwsCePlan } from './artifacts';
import { canonicalSha256, resourceConfiguration } from './canonical';
import { validateAwsCeAddressing } from './interface-addressing';
import type { AwsCeObservation, AwsCePlan, AwsCeResourceObservation } from './types';

type Json = Record<string, unknown>;
const object = (value: unknown): Json => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Malformed brownfield placement evidence');
  return value as Json;
};
const rows = (value: unknown): Json[] => {
  if (!Array.isArray(value)) throw Error('Incomplete brownfield placement evidence');
  return value.map(object);
};
export interface AwsTerraformBrownfieldPlacement {
  schemaVersion: 1;
  kind: 'aws-ce-terraform-brownfield-placement';
  sourcePlanSha256: string;
  vpcId: string;
  subnets: Record<string, string>;
  managementRouteTableId: string;
  insideRouteTableId: string;
  internetGatewayId: string;
  referenceIds: string[];
  snapshotSha256: string;
}
function placementPlan(plan: AwsCePlan) {
  verifyAwsCePlan(plan);
  const intent = plan.intent;
  if (
    plan.engine !== 'terraform' ||
    intent.operation !== 'deploy' ||
    intent.vpc.mode !== 'brownfield' ||
    intent.routing.profile !== 'direct-eni' ||
    intent.topology.nodeCount !== 1 ||
    intent.interfaces.length !== 2 ||
    intent.interfaces[0].index !== 0 ||
    intent.interfaces[1].index !== 1 ||
    intent.interfaces[0].role !== 'slo' ||
    intent.interfaces[1].role !== 'sli' ||
    intent.interfaces.some((i) => i.subnets.length !== 1) ||
    intent.egress.mode !== 'elastic-ip'
  )
    throw Error('Brownfield placement requires exact single-node Terraform direct routing');
  validateAwsCeAddressing(intent);
  const ids = [intent.vpc.vpcId, ...intent.interfaces.map((i) => i.subnets[0]?.subnetId)];
  if (
    !/^vpc-[a-f0-9]{8,17}$/.test(ids[0] ?? '') ||
    ids.slice(1).some((id) => !/^subnet-[a-f0-9]{8,17}$/.test(id ?? '')) ||
    new Set(ids).size !== 3 ||
    ids.some((id) => !intent.brownfield.resourceIds.includes(id ?? ''))
  )
    throw Error('Brownfield placement identifiers are unresolved or outside the allowlist');
  return ids as string[];
}
/** Qualifies existing placement only; the caller must still reobserve before execution and admit routing separately. */
export function qualifyAwsTerraformBrownfieldPlacement(
  plan: AwsCePlan,
  observation: Pick<AwsCeObservation, 'identity' | 'resources'>,
): AwsTerraformBrownfieldPlacement {
  const [vpcId, sloSubnetId, sliSubnetId] = placementPlan(plan);
  const intent = plan.intent;
  if (
    observation.identity.accountId !== intent.accountId ||
    observation.identity.partition !== intent.partition ||
    observation.identity.awsProfile !== intent.awsProfile
  )
    throw Error('Brownfield placement observer identity differs');
  const references: string[] = [];
  const read = (id: string, key: string, field: string) => {
    const patterns: Record<string, RegExp> = {
      Vpcs: /^vpc-[a-f0-9]{8,17}$/,
      Subnets: /^subnet-[a-f0-9]{8,17}$/,
      RouteTables: /^rtb-[a-f0-9]{8,17}$/,
      InternetGateways: /^igw-[a-f0-9]{8,17}$/,
    };
    if (!patterns[key]?.test(id)) throw Error('Brownfield placement reference identity is unresolved');
    if (!intent.brownfield.resourceIds.includes(id) && !intent.brownfield.routeTableIds.includes(id))
      throw Error('Brownfield placement reference is outside the allowlist');
    const found = observation.resources.filter((r) => r.id === id);
    const before = plan.rollback.resources.filter((r) => r.id === id);
    if (found.length !== 1 || before.length !== 1 || !found[0].exists || found[0].region !== intent.region)
      throw Error('Brownfield placement resource is unavailable or ambiguous');
    if (['NextToken', 'nextToken', 'NextMarker', 'Marker'].some((key) => Object.hasOwn(found[0].state, key)))
      throw Error('Partial brownfield placement evidence');
    const actual = rows(found[0].state[key]);
    if (actual.length !== 1 || actual[0][field] !== id || actual[0].OwnerId !== intent.accountId)
      throw Error('Brownfield placement physical ownership differs');
    const original: AwsCeResourceObservation = { ...found[0], state: before[0].before };
    if (canonicalSha256(resourceConfiguration([found[0]])) !== canonicalSha256(resourceConfiguration([original])))
      throw Error('Brownfield placement immutable snapshot drift');
    references.push(id);
    return actual[0];
  };
  const vpc = read(vpcId, 'Vpcs', 'VpcId');
  if (vpc.State !== 'available' || vpc.CidrBlock !== intent.vpc.cidr) throw Error('Brownfield placement VPC differs');
  for (const [index, id] of [sloSubnetId, sliSubnetId].entries()) {
    const subnet = read(id, 'Subnets', 'SubnetId');
    const requested = intent.interfaces[index].subnets[0];
    if (
      subnet.State !== 'available' ||
      subnet.VpcId !== vpcId ||
      subnet.AvailabilityZone !== requested.availabilityZone ||
      (requested.cidr && subnet.CidrBlock !== requested.cidr)
    )
      throw Error('Brownfield placement subnet differs');
  }
  const tables = observation.resources.filter((r) => intent.brownfield.routeTableIds.includes(r.id));
  const effective = (subnetId: string) => {
    const matches = tables.flatMap((r) =>
      rows(r.state.RouteTables)
        .filter((t) => rows(t.Associations).some((a) => a.SubnetId === subnetId))
        .map((t) => ({ id: r.id, table: t })),
    );
    if (matches.length !== 1) throw Error('Brownfield placement requires one explicit verified subnet association');
    const table = read(matches[0].id, 'RouteTables', 'RouteTableId');
    const associations = rows(table.Associations).filter((a) => a.SubnetId === subnetId);
    if (
      table.VpcId !== vpcId ||
      associations.length !== 1 ||
      associations[0].Main !== false ||
      object(associations[0].AssociationState).State !== 'associated'
    )
      throw Error('Brownfield placement route association differs');
    const routes = rows(table.Routes);
    const destinations = routes.map(
      (r) => r.DestinationCidrBlock ?? r.DestinationIpv6CidrBlock ?? r.DestinationPrefixListId,
    );
    if (
      destinations.some((d) => typeof d !== 'string') ||
      new Set(destinations).size !== destinations.length ||
      routes.filter((r) => r.DestinationCidrBlock === vpc.CidrBlock && r.GatewayId === 'local' && r.State === 'active')
        .length !== 1
    )
      throw Error('Brownfield placement local routing is unavailable or ambiguous');
    return { id: matches[0].id, routes };
  };
  const slo = effective(sloSubnetId),
    sli = effective(sliSubnetId);
  if (slo.id === sli.id || intent.routes?.some((r) => [slo.id, sli.id].includes(r.routeTableId)))
    throw Error('Brownfield placement overlaps workload route ownership');
  const defaults = slo.routes.filter((r) => r.DestinationCidrBlock === '0.0.0.0/0');
  if (
    defaults.length !== 1 ||
    defaults[0].State !== 'active' ||
    defaults[0].Origin !== 'CreateRoute' ||
    [
      'NatGatewayId',
      'NetworkInterfaceId',
      'TransitGatewayId',
      'VpcPeeringConnectionId',
      'EgressOnlyInternetGatewayId',
      'CarrierGatewayId',
      'LocalGatewayId',
      'CoreNetworkArn',
    ].some((key) => Object.hasOwn(defaults[0], key)) ||
    typeof defaults[0].GatewayId !== 'string' ||
    !/^igw-[a-f0-9]{8,17}$/.test(defaults[0].GatewayId)
  )
    throw Error('Brownfield placement management egress is unavailable');
  const internetGatewayId = defaults[0].GatewayId;
  const gateway = read(internetGatewayId, 'InternetGateways', 'InternetGatewayId');
  const attachments = rows(gateway.Attachments);
  if (attachments.length !== 1 || attachments[0].VpcId !== vpcId || attachments[0].State !== 'available')
    throw Error('Brownfield placement internet gateway attachment differs');
  const snapshot = {
    schemaVersion: 1 as const,
    kind: 'aws-ce-terraform-brownfield-placement' as const,
    sourcePlanSha256: plan.planSha256,
    vpcId,
    subnets: { '1:0': sloSubnetId, '1:1': sliSubnetId },
    managementRouteTableId: slo.id,
    insideRouteTableId: sli.id,
    internetGatewayId,
    referenceIds: [...new Set(references)].sort(),
  };
  return { ...snapshot, snapshotSha256: canonicalSha256(snapshot) };
}
export function assertAwsTerraformBrownfieldPlacement(
  plan: AwsCePlan,
  binding: AwsTerraformBrownfieldPlacement | undefined,
): asserts binding is AwsTerraformBrownfieldPlacement {
  const [vpcId, slo, sli] = placementPlan(plan);
  if (!binding) throw Error('Qualified brownfield placement is required');
  const { snapshotSha256, ...snapshot } = binding;
  const expectedReferences = [
    vpcId,
    slo,
    sli,
    binding.managementRouteTableId,
    binding.insideRouteTableId,
    binding.internetGatewayId,
  ].sort();
  if (
    !/^rtb-[a-f0-9]{8,17}$/.test(binding.managementRouteTableId) ||
    !/^rtb-[a-f0-9]{8,17}$/.test(binding.insideRouteTableId) ||
    binding.managementRouteTableId === binding.insideRouteTableId ||
    !/^igw-[a-f0-9]{8,17}$/.test(binding.internetGatewayId) ||
    canonicalSha256(binding.referenceIds) !== canonicalSha256(expectedReferences) ||
    expectedReferences.some(
      (id) => !plan.intent.brownfield.resourceIds.includes(id) && !plan.intent.brownfield.routeTableIds.includes(id),
    )
  )
    throw Error('Brownfield placement reference binding differs');
  if (
    binding.schemaVersion !== 1 ||
    binding.kind !== 'aws-ce-terraform-brownfield-placement' ||
    binding.sourcePlanSha256 !== plan.planSha256 ||
    binding.vpcId !== vpcId ||
    binding.subnets['1:0'] !== slo ||
    binding.subnets['1:1'] !== sli ||
    Object.keys(binding.subnets).length !== 2 ||
    canonicalSha256(snapshot) !== snapshotSha256
  )
    throw Error('Brownfield placement binding differs');
}
