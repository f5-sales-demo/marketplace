import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import type { PlanReceipt } from '../../../terraform/src/runner';
import type { AwsExecApi } from '../aws/exec';
import { verifyAwsCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import {
  AWS_CE_PROVIDER_LOCK_SHA256,
  AWS_CE_TERRAFORM_PROVIDER_VERSION,
  AWS_CE_TERRAFORM_VERSION,
} from './execution-contract';
import { scopedAwsApi } from './scoped-exec';
import type { AwsCePlan } from './types';

type Json = Record<string, unknown>;
function object(v: unknown): Json {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error('Malformed NLB service evidence');
  return v as Json;
}
function list(v: unknown): Json[] {
  if (!Array.isArray(v)) throw Error('Incomplete NLB service evidence');
  return v.map(object);
}
function exactly(v: unknown): Json {
  const rows = list(v);
  if (rows.length !== 1) throw Error('NLB service cardinality differs');
  return rows[0];
}
/** Read-only service ownership and membership. No CE heartbeat or traffic inference. */
export async function collectAwsPowerNlbServices(
  base: AwsCePlan,
  values: Record<string, string>,
  raw: AwsExecApi,
  signal?: AbortSignal,
) {
  verifyAwsCePlan(base);
  const ingress = base.intent.ingress;
  if (ingress?.mode !== 'nlb' || base.topology.nodeCount !== 1 || ingress.listener.privateAddresses?.length !== 1)
    throw Error('Exact single-site NLB service configuration required');
  const prefix = `arn:${base.intent.partition ?? 'aws'}:elasticloadbalancing:${base.region}:${base.accountId}:`;
  const lb = values.__NLB_ARN__;
  const tg = values.__NLB_TARGET_GROUP_ARN__;
  const listener = values.__NLB_LISTENER_ARN__;
  for (const [arn, kind] of [
    [lb, 'loadbalancer/net/'],
    [tg, 'targetgroup/'],
    [listener, 'listener/net/'],
  ])
    if (typeof arn !== 'string' || !arn.startsWith(prefix + kind) || !/^[a-zA-Z0-9:/_.-]+$/.test(arn))
      throw Error('NLB runtime identity unresolved or foreign');
  const target = { Id: ingress.listener.privateAddresses[0], Port: ingress.port, AvailabilityZone: 'all' };
  if (isIP(target.Id) !== 4 || !Number.isInteger(target.Port) || target.Port < 1 || target.Port > 65535)
    throw Error('NLB target identity unresolved');
  const api = scopedAwsApi(raw, base.intent.awsProfile ?? 'default', signal);
  const read = async (args: string[]) => {
    const r = await api.exec('aws', [...args, '--region', base.region, '--output', 'json']);
    if (r.exitCode) throw Error('NLB service unavailable');
    const v = object(JSON.parse(r.stdout));
    if (['NextToken', 'nextToken', 'NextMarker', 'Marker'].some((k) => Object.hasOwn(v, k)))
      throw Error('Partial NLB service evidence');
    return v;
  };
  if ((await read(['sts', 'get-caller-identity'])).Account !== base.accountId) throw Error('NLB account differs');
  const tags = list((await read(['elbv2', 'describe-tags', '--resource-arns', lb, tg, listener])).TagDescriptions);
  if (tags.length !== 3 || new Set(tags.map((v) => v.ResourceArn)).size !== 3)
    throw Error('NLB ownership cardinality differs');
  const expected = {
    'xcsh-managed-by': 'aws-ce',
    'xcsh-deployment-id': base.deploymentName,
    'xcsh-execution-engine': base.engine,
    'xcsh-plan-sha256': base.planSha256,
  };
  for (const arn of [lb, tg, listener]) {
    const rows = tags.filter((v) => v.ResourceArn === arn);
    if (rows.length !== 1) throw Error('NLB ownership missing');
    const entries = list(rows[0].Tags);
    if (
      new Set(entries.map((v) => v.Key)).size !== entries.length ||
      entries.some((v) => typeof v.Key !== 'string' || typeof v.Value !== 'string') ||
      Object.entries(expected).some(([k, v]) => !entries.some((t) => t.Key === k && t.Value === v))
    )
      throw Error('Foreign NLB ownership');
  }
  const loadBalancer = exactly(
    (await read(['elbv2', 'describe-load-balancers', '--load-balancer-arns', lb])).LoadBalancers,
  );
  if (
    loadBalancer.LoadBalancerArn !== lb ||
    loadBalancer.Type !== 'network' ||
    loadBalancer.Scheme !== 'internal' ||
    loadBalancer.VpcId !== ingress.loadBalancer.vpcId ||
    object(loadBalancer.State).Code !== 'active'
  )
    throw Error('NLB retained load balancer differs');
  const zones = list(loadBalancer.AvailabilityZones);
  const actual = zones
    .map((z) => ({
      subnetId: z.SubnetId,
      addresses: list(z.LoadBalancerAddresses)
        .map((a) => a.PrivateIPv4Address)
        .sort(),
    }))
    .sort((a, b) => String(a.subnetId).localeCompare(String(b.subnetId)));
  const expectedZones = ingress.loadBalancer.subnetIds
    .map((subnetId, i) => ({ subnetId, addresses: [ingress.loadBalancer.privateAddresses[i]] }))
    .sort((a, b) => a.subnetId.localeCompare(b.subnetId));
  if (canonicalSha256(actual) !== canonicalSha256(expectedZones)) throw Error('NLB subnet/address identity differs');
  const group = exactly((await read(['elbv2', 'describe-target-groups', '--target-group-arns', tg])).TargetGroups);
  if (
    group.TargetGroupArn !== tg ||
    group.TargetType !== 'ip' ||
    group.Protocol !== 'TCP' ||
    group.Port !== target.Port ||
    group.VpcId !== ingress.loadBalancer.vpcId ||
    canonicalSha256(group.LoadBalancerArns) !== canonicalSha256([lb])
  )
    throw Error('NLB retained target group differs');
  const retainedListener = exactly(
    (await read(['elbv2', 'describe-listeners', '--listener-arns', listener])).Listeners,
  );
  const action = exactly(retainedListener.DefaultActions);
  if (
    retainedListener.ListenerArn !== listener ||
    retainedListener.LoadBalancerArn !== lb ||
    retainedListener.Port !== target.Port ||
    retainedListener.Protocol !== 'TCP' ||
    action.Type !== 'forward' ||
    action.TargetGroupArn !== tg
  )
    throw Error('NLB retained listener differs');
  const membership = list(
    (await read(['elbv2', 'describe-target-health', '--target-group-arn', tg])).TargetHealthDescriptions,
  );
  if (membership.length > 1) throw Error('Duplicate NLB membership');
  let status: 'active' | 'withdrawn' | 'pending' = 'withdrawn';
  if (membership.length) {
    const row = membership[0];
    if (canonicalSha256(object(row.Target)) !== canonicalSha256(target)) throw Error('Foreign NLB target membership');
    const health = object(row.TargetHealth);
    if (
      !['healthy', 'initial', 'unhealthy', 'unused', 'draining', 'unavailable', 'unhealthy.draining'].includes(
        String(health.State),
      )
    )
      throw Error('NLB membership health unavailable');
    status = health.State === 'healthy' ? 'active' : 'pending';
  }
  const services = {
    schemaVersion: 1,
    kind: 'aws-ce-nlb-power-services',
    sourcePlanSha256: base.planSha256,
    engine: base.engine,
    accountId: base.accountId,
    region: base.region,
    loadBalancerArn: lb,
    targetGroupArn: tg,
    listenerArn: listener,
    vpcId: ingress.loadBalancer.vpcId,
    zones: expectedZones,
    target,
  };
  return {
    services,
    servicesSha256: canonicalSha256(services),
    status,
    traffic: 'unknown' as const,
    collectedAt: new Date().toISOString(),
  };
}

type NlbServices = Awaited<ReturnType<typeof collectAwsPowerNlbServices>>['services'];
export interface AwsNlbMembershipRevision {
  configuration: string;
  beforeSha256: string;
  afterSha256: string;
  servicesSha256: string;
  address: string;
  effect: 'withdraw' | 'restore';
  expectedActions: Array<'create' | 'delete'>;
  /** Exact private owning-engine attachment retained for restoration. */
  attachment: Json;
}
const hash = (v: string) => createHash('sha256').update(v).digest('hex');
/** Pure next-generation configuration revision; the owning runner still must validate and apply a saved plan. */
export function reviseAwsTerraformNlbMembership(
  base: AwsCePlan,
  services: NlbServices,
  configuration: string,
  effect: 'withdraw' | 'restore',
  retained?: AwsNlbMembershipRevision,
): AwsNlbMembershipRevision {
  verifyAwsCePlan(base);
  if (
    base.engine !== 'terraform' ||
    services.engine !== base.engine ||
    services.sourcePlanSha256 !== base.planSha256 ||
    services.accountId !== base.accountId ||
    services.region !== base.region ||
    base.topology.nodeCount !== 1 ||
    !['withdraw', 'restore'].includes(effect)
  )
    throw Error('Terraform NLB membership ownership differs');
  const before = object(JSON.parse(configuration));
  const after = structuredClone(before);
  const terraform = object(after.terraform);
  const aws = object(object(terraform.required_providers).aws);
  const provider = object(object(after.provider).aws);
  if (
    terraform.required_version !== `= ${AWS_CE_TERRAFORM_VERSION}` ||
    aws.source !== 'hashicorp/aws' ||
    aws.version !== `= ${AWS_CE_TERRAFORM_PROVIDER_VERSION}` ||
    provider.region !== base.region ||
    canonicalSha256(provider.allowed_account_ids) !== canonicalSha256([base.accountId]) ||
    terraform.backend ||
    terraform.cloud
  )
    throw Error('Terraform NLB provider scope differs');
  const resources = object(after.resource);
  let attachment: Json;
  if (effect === 'withdraw') {
    const attachments = object(resources.aws_lb_target_group_attachment);
    if (Object.keys(attachments).join(',') !== 'node_1') throw Error('Terraform NLB attachment cardinality differs');
    attachment = object(attachments.node_1);
    if (
      attachment.target_group_arn !== `\${aws_lb_target_group.ce.arn}` ||
      attachment.target_id !== services.target.Id ||
      attachment.port !== services.target.Port ||
      attachment.availability_zone !== 'all' ||
      canonicalSha256(attachment.depends_on) !== canonicalSha256(['aws_instance.node_1']) ||
      Object.keys(attachment).sort().join(',') !== 'availability_zone,depends_on,port,target_group_arn,target_id'
    )
      throw Error('Terraform NLB attachment identity differs');
    delete resources.aws_lb_target_group_attachment;
  } else {
    if (
      retained?.effect !== 'withdraw' ||
      retained.servicesSha256 !== canonicalSha256(services) ||
      retained.address !== 'aws_lb_target_group_attachment.node_1' ||
      hash(retained.configuration) !== retained.afterSha256 ||
      resources.aws_lb_target_group_attachment !== undefined
    )
      throw Error('Terraform NLB restoration requires exact retained withdrawal');
    attachment = object(retained.attachment);
    if (
      attachment.target_group_arn !== `\${aws_lb_target_group.ce.arn}` ||
      attachment.target_id !== services.target.Id ||
      attachment.port !== services.target.Port ||
      attachment.availability_zone !== 'all' ||
      canonicalSha256(attachment.depends_on) !== canonicalSha256(['aws_instance.node_1']) ||
      Object.keys(attachment).sort().join(',') !== 'availability_zone,depends_on,port,target_group_arn,target_id'
    )
      throw Error('Terraform NLB retained attachment differs');
    resources.aws_lb_target_group_attachment = { node_1: structuredClone(attachment) };
  }
  const next = JSON.stringify(after);
  return {
    configuration: next,
    beforeSha256: hash(configuration),
    afterSha256: hash(next),
    servicesSha256: canonicalSha256(services),
    address: 'aws_lb_target_group_attachment.node_1',
    effect,
    expectedActions: [effect === 'withdraw' ? 'delete' : 'create'],
    attachment: structuredClone(attachment),
  };
}

/** Validate resolved before/after projections from the exact saved plan, never expression strings. */
export function validateAwsTerraformNlbMembershipReceipt(
  base: AwsCePlan,
  services: NlbServices,
  revision: AwsNlbMembershipRevision,
  receipt: PlanReceipt,
  before: Record<string, Record<string, unknown> | null>,
  after: Record<string, Record<string, unknown> | null>,
): void {
  verifyAwsCePlan(base);
  if (
    base.engine !== 'terraform' ||
    services.engine !== base.engine ||
    services.sourcePlanSha256 !== base.planSha256 ||
    revision.servicesSha256 !== canonicalSha256(services) ||
    revision.address !== 'aws_lb_target_group_attachment.node_1' ||
    !['withdraw', 'restore'].includes(revision.effect) ||
    revision.afterSha256 !== hash(revision.configuration) ||
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
    new Set(receipt.changes.map((r) => r.address)).size !== receipt.changes.length
  )
    throw Error('Terraform NLB membership saved-plan scope differs');
  const mutations = receipt.changes.filter((r) => canonicalSha256(r.actions) !== canonicalSha256(['no-op']));
  const expected = revision.effect === 'withdraw' ? ['delete'] : ['create'];
  if (
    mutations.length !== 1 ||
    mutations[0].address !== revision.address ||
    mutations[0].type !== 'aws_lb_target_group_attachment' ||
    canonicalSha256(mutations[0].actions) !== canonicalSha256(expected) ||
    canonicalSha256(revision.expectedActions) !== canonicalSha256(expected)
  )
    throw Error('Terraform NLB membership unrelated or replacement mutation');
  if (
    Object.keys(before).length !== 1 ||
    Object.keys(after).length !== 1 ||
    !Object.hasOwn(before, revision.address) ||
    !Object.hasOwn(after, revision.address)
  )
    throw Error('Terraform NLB membership projection incomplete');
  const owned = {
    target_group_arn: services.targetGroupArn,
    target_id: services.target.Id,
    port: services.target.Port,
    availability_zone: 'all',
  };
  const absent = revision.effect === 'withdraw' ? after[revision.address] : before[revision.address];
  const present = revision.effect === 'withdraw' ? before[revision.address] : after[revision.address];
  if (absent !== null || canonicalSha256(present) !== canonicalSha256(owned))
    throw Error('Terraform NLB membership resolved identity differs');
}
