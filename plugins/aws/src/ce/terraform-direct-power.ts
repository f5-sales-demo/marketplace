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
import type { collectAwsPowerDirectRoutes } from './whole-site-power-routes';

type Services = Awaited<ReturnType<typeof collectAwsPowerDirectRoutes>>['services'];
type Json = Record<string, unknown>;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
function object(value: unknown): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Malformed Terraform direct service configuration');
  return value as Json;
}
export interface AwsDirectServiceRevision {
  configuration: string;
  beforeSha256: string;
  afterSha256: string;
  servicesSha256: string;
  effect: 'withdraw' | 'restore';
  routes: Record<string, Json>;
}
function expectedRoutes(base: AwsCePlan, services: Services): Record<string, Json> {
  verifyAwsCePlan(base);
  const requested = [...base.intent.routes].sort(
    (a, b) => a.routeTableId.localeCompare(b.routeTableId) || a.destinationCidr.localeCompare(b.destinationCidr),
  );
  if (
    base.engine !== 'terraform' ||
    base.topology.nodeCount !== 1 ||
    base.intent.routing.profile !== 'direct-eni' ||
    services.schemaVersion !== 1 ||
    services.kind !== 'aws-ce-direct-route-power-services' ||
    services.engine !== base.engine ||
    services.sourcePlanSha256 !== base.planSha256 ||
    services.accountId !== base.accountId ||
    services.region !== base.region ||
    !/^i-[a-f0-9]{8,17}$/.test(services.instanceId) ||
    !/^eni-[a-f0-9]{8,17}$/.test(services.sloNetworkInterfaceId) ||
    !/^subnet-[a-f0-9]{8,17}$/.test(String(services.sloSubnetId)) ||
    !requested.length ||
    canonicalSha256(
      services.routes.map((r) => ({ routeTableId: r.routeTableId, destinationCidr: r.destinationCidr, node: 1 })),
    ) !== canonicalSha256(requested) ||
    services.routes.some(
      (r) =>
        !/^eni-[a-f0-9]{8,17}$/.test(r.networkInterfaceId) ||
        r.networkInterfaceId === services.sloNetworkInterfaceId ||
        !/^rtb-[a-f0-9]{8,17}$/.test(r.routeTableId) ||
        !base.intent.brownfield.routeTableIds.includes(r.routeTableId),
    ) ||
    new Set(services.routes.map((r) => r.networkInterfaceId)).size !== 1 ||
    new Set(services.routes.map((r) => `${r.routeTableId}/${r.destinationCidr}`)).size !== requested.length
  )
    throw Error('Terraform direct service scope differs');
  return Object.fromEntries(
    services.routes.map((route, index) => [
      `direct_${index}`,
      {
        route_table_id: route.routeTableId,
        destination_cidr_block: route.destinationCidr,
        network_interface_id: route.networkInterfaceId,
      },
    ]),
  );
}
/** Pure owning-state revision; management and unrelated route resources remain unchanged. */
export function reviseAwsTerraformDirectServiceRoutes(
  base: AwsCePlan,
  services: Services,
  configuration: string,
  effect: 'withdraw' | 'restore',
  retained?: AwsDirectServiceRevision,
): AwsDirectServiceRevision {
  const routes = expectedRoutes(base, services);
  const next = object(JSON.parse(configuration));
  const terraform = object(next.terraform),
    aws = object(object(terraform.required_providers).aws),
    provider = object(object(next.provider).aws);
  if (
    terraform.required_version !== `= ${AWS_CE_TERRAFORM_VERSION}` ||
    aws.source !== 'hashicorp/aws' ||
    aws.version !== `= ${AWS_CE_TERRAFORM_PROVIDER_VERSION}` ||
    provider.region !== base.region ||
    canonicalSha256(provider.allowed_account_ids) !== canonicalSha256([base.accountId]) ||
    terraform.backend ||
    terraform.cloud ||
    next.import ||
    next.removed
  )
    throw Error('Terraform direct service provider or lifecycle differs');
  const resources = object(next.resource);
  const configured = resources.aws_route === undefined ? {} : object(resources.aws_route);
  if (Object.keys(configured).some((name) => name.startsWith('direct_') && !Object.hasOwn(routes, name)))
    throw Error('Terraform direct service route cardinality differs');
  if (
    effect === 'restore' &&
    (retained?.effect !== 'withdraw' ||
      retained.servicesSha256 !== canonicalSha256(services) ||
      hash(retained.configuration) !== retained.afterSha256 ||
      canonicalSha256(retained.routes) !== canonicalSha256(routes))
  )
    throw Error('Terraform direct restoration requires retained withdrawal');
  if (!['withdraw', 'restore'].includes(effect)) throw Error('Terraform direct effect differs');
  for (const [name, route] of Object.entries(routes)) {
    if (effect === 'withdraw') {
      if (canonicalSha256(configured[name]) !== canonicalSha256(route))
        throw Error('Terraform direct service route identity differs');
      delete configured[name];
    } else {
      if (Object.hasOwn(configured, name)) throw Error('Terraform direct restored resource already exists');
      configured[name] = structuredClone(route);
    }
  }
  if (Object.keys(configured).length) resources.aws_route = configured;
  else delete resources.aws_route;
  const result = JSON.stringify(next);
  return {
    configuration: result,
    beforeSha256: hash(configuration),
    afterSha256: hash(result),
    servicesSha256: canonicalSha256(services),
    effect,
    routes,
  };
}
/** Admit only exact route deletion/creation with complete, resolved ownership projections. */
export function validateAwsTerraformDirectServiceReceipt(
  base: AwsCePlan,
  services: Services,
  revision: AwsDirectServiceRevision,
  receipt: PlanReceipt,
  before: Record<string, Record<string, unknown> | null>,
  after: Record<string, Record<string, unknown> | null>,
): void {
  const routes = expectedRoutes(base, services);
  if (
    canonicalSha256(revision.routes) !== canonicalSha256(routes) ||
    revision.servicesSha256 !== canonicalSha256(services) ||
    hash(revision.configuration) !== revision.afterSha256 ||
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
    throw Error('Terraform direct service saved-plan scope differs');
  const addresses = Object.keys(routes)
    .map((n) => `aws_route.${n}`)
    .sort();
  const mutations = receipt.changes.filter((c) => canonicalSha256(c.actions) !== canonicalSha256(['no-op']));
  if (
    canonicalSha256(mutations.map((c) => c.address).sort()) !== canonicalSha256(addresses) ||
    mutations.some(
      (c) =>
        c.type !== 'aws_route' ||
        canonicalSha256(c.actions) !== canonicalSha256([revision.effect === 'withdraw' ? 'delete' : 'create']),
    )
  )
    throw Error('Terraform direct service unrelated or replacement mutation');
  if (
    canonicalSha256(Object.keys(before).sort()) !== canonicalSha256(addresses) ||
    canonicalSha256(Object.keys(after).sort()) !== canonicalSha256(addresses)
  )
    throw Error('Terraform direct service projection incomplete');
  for (const address of addresses) {
    if (
      canonicalSha256(revision.effect === 'withdraw' ? before[address] : after[address]) !==
        canonicalSha256(routes[address.slice('aws_route.'.length)]) ||
      (revision.effect === 'withdraw' ? after[address] : before[address]) !== null
    )
      throw Error('Terraform direct service resolved identity differs');
  }
}
