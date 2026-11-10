import { createHash } from 'node:crypto';
import type { PlanReceipt } from '../../../terraform/src/runner';
import { verifyAwsCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import {
  AWS_CE_PROVIDER_LOCK_SHA256,
  AWS_CE_TERRAFORM_PROVIDER_VERSION,
  AWS_CE_TERRAFORM_VERSION,
} from './execution-contract';
import type { AwsCePlan } from './types';
import type { collectAwsPowerStaticTgwRoutes } from './whole-site-power-tgw';

type Services = Awaited<ReturnType<typeof collectAwsPowerStaticTgwRoutes>>['services'];
type Json = Record<string, unknown>;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
function object(value: unknown): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Malformed Terraform static service configuration');
  return value as Json;
}
export interface AwsStaticServiceRevision {
  configuration: string;
  beforeSha256: string;
  afterSha256: string;
  servicesSha256: string;
  effect: 'withdraw' | 'restore';
  routes: Record<string, Json>;
}
function scope(base: AwsCePlan, services: Services) {
  verifyAwsCePlan(base);
  if (
    base.engine !== 'terraform' ||
    services.engine !== base.engine ||
    services.sourcePlanSha256 !== base.planSha256 ||
    services.accountId !== base.accountId ||
    services.region !== base.region ||
    services.transitGatewayId !== base.intent.routing.transitGatewayId ||
    services.routeTableId !== base.intent.routing.transitGatewayRouteTableId ||
    canonicalSha256(services.destinationCidrs) !== canonicalSha256([...base.intent.routing.destinationCidrs].sort()) ||
    !/^tgw-attach-[a-f0-9]{8,17}$/.test(services.transportAttachmentId) ||
    base.intent.routing.profile !== 'tgw-static'
  )
    throw Error('Terraform static service scope differs');
}
function expectedRoutes(base: AwsCePlan, services: Services, routes: Json) {
  if (Object.keys(routes).length !== base.intent.routing.destinationCidrs.length)
    throw Error('Terraform static service route cardinality differs');
  for (const [index, destination] of base.intent.routing.destinationCidrs.entries()) {
    const route = object(routes[`static_${index}`]);
    if (
      canonicalSha256(route) !==
      canonicalSha256({
        destination_cidr_block: destination,
        transit_gateway_attachment_id: `\${aws_ec2_transit_gateway_vpc_attachment.transport.id}`,
        transit_gateway_route_table_id: services.routeTableId,
      })
    )
      throw Error('Terraform static service route identity differs');
  }
}
/** Pure owning-state revision; only the service route resources change. */
export function reviseAwsTerraformStaticServiceRoutes(
  base: AwsCePlan,
  services: Services,
  configuration: string,
  effect: 'withdraw' | 'restore',
  retained?: AwsStaticServiceRevision,
): AwsStaticServiceRevision {
  scope(base, services);
  const after = object(JSON.parse(configuration));
  const terraform = object(after.terraform),
    aws = object(object(terraform.required_providers).aws),
    provider = object(object(after.provider).aws);
  if (
    terraform.required_version !== `= ${AWS_CE_TERRAFORM_VERSION}` ||
    aws.source !== 'hashicorp/aws' ||
    aws.version !== `= ${AWS_CE_TERRAFORM_PROVIDER_VERSION}` ||
    provider.region !== base.region ||
    canonicalSha256(provider.allowed_account_ids) !== canonicalSha256([base.accountId]) ||
    terraform.backend ||
    terraform.cloud
  )
    throw Error('Terraform static service provider differs');
  const resources = object(after.resource);
  let routes: Json;
  if (effect === 'withdraw') {
    routes = object(resources.aws_ec2_transit_gateway_route);
    expectedRoutes(base, services, routes);
    delete resources.aws_ec2_transit_gateway_route;
  } else if (effect === 'restore') {
    if (
      retained?.effect !== 'withdraw' ||
      retained.servicesSha256 !== canonicalSha256(services) ||
      hash(retained.configuration) !== retained.afterSha256 ||
      resources.aws_ec2_transit_gateway_route !== undefined
    )
      throw Error('Terraform static restoration requires retained withdrawal');
    routes = object(retained.routes);
    expectedRoutes(base, services, routes);
    resources.aws_ec2_transit_gateway_route = structuredClone(routes);
  } else throw Error('Terraform static service effect differs');
  const next = JSON.stringify(after);
  return {
    configuration: next,
    beforeSha256: hash(configuration),
    afterSha256: hash(next),
    servicesSha256: canonicalSha256(services),
    effect,
    routes: structuredClone(routes) as Record<string, Json>,
  };
}
/** Exact saved-plan after/before ownership projections; propagated, blackhole and unrelated changes reject. */
export function validateAwsTerraformStaticServiceReceipt(
  base: AwsCePlan,
  services: Services,
  revision: AwsStaticServiceRevision,
  receipt: PlanReceipt,
  before: Record<string, Record<string, unknown> | null>,
  after: Record<string, Record<string, unknown> | null>,
): void {
  scope(base, services);
  expectedRoutes(base, services, revision.routes);
  if (
    revision.servicesSha256 !== canonicalSha256(services) ||
    revision.afterSha256 !== hash(revision.configuration) ||
    !['withdraw', 'restore'].includes(revision.effect) ||
    receipt.schemaVersion !== 1 ||
    receipt.engine !== 'terraform' ||
    receipt.deploymentId !== base.deploymentName ||
    receipt.backendIdentity !== `local:${base.deploymentName}` ||
    receipt.configurationSha256 !== revision.afterSha256 ||
    receipt.providerLockSha256 !== AWS_CE_PROVIDER_LOCK_SHA256 ||
    !/^[a-f0-9]{64}$/.test(receipt.planSha256) ||
    receipt.operation ||
    receipt.actionInvocations?.length ||
    receipt.noChanges ||
    new Set(receipt.changes.map((c) => c.address)).size !== receipt.changes.length
  )
    throw Error('Terraform static service saved-plan scope differs');
  const addresses = Object.keys(revision.routes)
    .map((name) => `aws_ec2_transit_gateway_route.${name}`)
    .sort();
  const mutations = receipt.changes.filter((c) => canonicalSha256(c.actions) !== canonicalSha256(['no-op']));
  if (
    canonicalSha256(mutations.map((c) => c.address).sort()) !== canonicalSha256(addresses) ||
    mutations.some(
      (c) =>
        c.type !== 'aws_ec2_transit_gateway_route' ||
        canonicalSha256(c.actions) !== canonicalSha256([revision.effect === 'withdraw' ? 'delete' : 'create']),
    )
  )
    throw Error('Terraform static service unrelated or replacement mutation');
  if (
    canonicalSha256(Object.keys(before).sort()) !== canonicalSha256(addresses) ||
    canonicalSha256(Object.keys(after).sort()) !== canonicalSha256(addresses)
  )
    throw Error('Terraform static service projection incomplete');
  for (const address of addresses) {
    const name = address.split('.')[1];
    const route = revision.routes[name];
    const owned = {
      destination_cidr_block: route.destination_cidr_block,
      transit_gateway_attachment_id: services.transportAttachmentId,
      transit_gateway_route_table_id: services.routeTableId,
      blackhole: false,
    };
    if (
      canonicalSha256(revision.effect === 'withdraw' ? before[address] : after[address]) !== canonicalSha256(owned) ||
      (revision.effect === 'withdraw' ? after[address] : before[address]) !== null
    )
      throw Error('Terraform static service resolved identity differs');
  }
}
