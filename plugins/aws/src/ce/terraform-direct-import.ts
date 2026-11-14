import { createHash } from 'node:crypto';
import type { TerraformImportIntent } from '../../../terraform/src/runner';
import { verifyAwsCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import type { AwsTerraformDirectOwnership } from './terraform-direct-ownership';
import type { AwsCePlan } from './types';

/** Private import-only configuration; original targets stay unchanged. No mutation admission. */
export function renderAwsTerraformDirectImport(
  plan: AwsCePlan,
  ownership: AwsTerraformDirectOwnership,
  currentConfiguration: string,
): { configuration: string; intents: TerraformImportIntent[] } {
  verifyAwsCePlan(plan);
  const { snapshotSha256, ...snapshot } = ownership;
  if (
    canonicalSha256(snapshot) !== snapshotSha256 ||
    snapshot.schemaVersion !== 1 ||
    snapshot.kind !== 'aws-ce-terraform-original-direct-routes' ||
    snapshot.sourcePlanSha256 !== plan.planSha256 ||
    snapshot.accountId !== plan.accountId ||
    snapshot.region !== plan.region ||
    plan.engine !== 'terraform' ||
    plan.routing.profile !== 'direct-eni' ||
    plan.topology.nodeCount !== 1 ||
    snapshot.routes.length !== plan.intent.routes.length ||
    !snapshot.routes.length
  )
    throw Error('Direct import requires exact immutable original route ownership');
  const config = JSON.parse(currentConfiguration);
  if (
    !config ||
    typeof config !== 'object' ||
    Array.isArray(config) ||
    !config.resource ||
    typeof config.resource !== 'object' ||
    Array.isArray(config.resource) ||
    Object.hasOwn(config, 'import') ||
    config.output?.ce_vpc_id?.value !== snapshot.vpcId
  )
    throw Error('Direct import requires an exact existing VPC configuration without imports');
  const routes = config.resource.aws_route ?? {};
  if (!routes || typeof routes !== 'object' || Array.isArray(routes))
    throw Error('Direct import route configuration is malformed');
  const intents: TerraformImportIntent[] = [];
  const imports: Array<{ to: string; id: string }> = [];
  const names = new Set<string>();
  const ordered = [...plan.intent.routes].sort(
    (a, b) => a.routeTableId.localeCompare(b.routeTableId) || a.destinationCidr.localeCompare(b.destinationCidr),
  );
  for (const [index, selected] of ordered.entries()) {
    const address = `aws_route.direct_${index}`;
    const matches = snapshot.routes.filter((route) => route.address === address);
    if (matches.length !== 1) throw Error('Direct import route address is ambiguous');
    const route = matches[0];
    const name = `direct_${index}`;
    const patterns: Record<string, RegExp> = {
      gateway_id: /^igw-[a-f0-9]{8,17}$/,
      nat_gateway_id: /^nat-[a-f0-9]{8,17}$/,
      network_interface_id: /^eni-[a-f0-9]{8,17}$/,
      transit_gateway_id: /^tgw-[a-f0-9]{8,17}$/,
      vpc_peering_connection_id: /^pcx-[a-f0-9]{8,17}$/,
    };
    if (
      selected.node !== 1 ||
      route.routeTableId !== selected.routeTableId ||
      route.destinationCidr !== selected.destinationCidr ||
      !/^rtb-[a-f0-9]{8,17}$/.test(route.routeTableId) ||
      !patterns[route.originalTarget.field]?.test(route.originalTarget.id) ||
      snapshot.interfaces.some((item) => item.id === route.originalTarget.id) ||
      Object.hasOwn(routes, name) ||
      names.has(name)
    )
      throw Error('Direct import route identity or original target differs');
    names.add(name);
    routes[name] = {
      route_table_id: route.routeTableId,
      destination_cidr_block: route.destinationCidr,
      [route.originalTarget.field]: route.originalTarget.id,
    };
    const id = `${route.routeTableId}_${route.destinationCidr}`;
    imports.push({ to: address, id });
    intents.push({
      address,
      type: 'aws_route',
      providerName: 'registry.terraform.io/hashicorp/aws',
      idSha256: createHash('sha256').update(id).digest('hex'),
    });
  }
  config.resource.aws_route = routes;
  config.import = imports;
  return { configuration: JSON.stringify(config), intents };
}
