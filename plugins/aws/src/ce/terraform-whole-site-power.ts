import { createHash } from 'node:crypto';
import type { PlanReceipt } from '../../../terraform/src/runner';
import { canonicalSha256 } from './canonical';
import {
  AWS_CE_PROVIDER_LOCK_SHA256,
  AWS_CE_TERRAFORM_PROVIDER_VERSION,
  AWS_CE_TERRAFORM_VERSION,
} from './execution-contract';
import { siteBindings } from './topology';
import type { AwsCePlan } from './types';
import { type AwsWholeSitePowerPlan, verifyAwsWholeSitePowerPlan } from './whole-site-power';

type Effect = 'stop' | 'start' | 'release';
type Json = Record<string, unknown>;
const object = (v: unknown): Json => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error('Malformed Terraform power configuration');
  return v as Json;
};
const digest = (s: string) => createHash('sha256').update(s).digest('hex');
export interface AwsTerraformPowerRevision {
  configuration: string;
  beforeSha256: string;
  afterSha256: string;
  address: string;
  instanceId: string;
  effect: Effect;
  expectedActions: Array<'create' | 'update' | 'delete'>;
}
function scope(base: AwsCePlan, plan: AwsWholeSitePowerPlan, effect: Effect) {
  verifyAwsWholeSitePowerPlan(base, plan);
  if (
    base.engine !== 'terraform' ||
    !['stop', 'start', 'release'].includes(effect) ||
    plan.operation !== (effect === 'stop' ? 'stop' : 'start')
  )
    throw Error('Terraform power owning operation differs');
  if (base.topology.nodeCount !== 1 || plan.bindings.nodes.length !== 1 || siteBindings(base).length !== 1)
    throw Error('Terraform power requires separately qualified multi-node lifecycle');
}
/** Restricted runner snapshot only. Preserve every existing service, VM, bootstrap and provider field. */
export function reviseAwsTerraformPowerConfiguration(
  base: AwsCePlan,
  plan: AwsWholeSitePowerPlan,
  configuration: string,
  effect: Effect,
): AwsTerraformPowerRevision {
  scope(base, plan, effect);
  const before = object(JSON.parse(configuration));
  const after = structuredClone(before);
  const terraform = object(after.terraform);
  const providers = object(terraform.required_providers);
  const awsRequired = object(providers.aws);
  const provider = object(object(after.provider).aws);
  if (
    terraform.required_version !== `= ${AWS_CE_TERRAFORM_VERSION}` ||
    awsRequired.source !== 'hashicorp/aws' ||
    awsRequired.version !== `= ${AWS_CE_TERRAFORM_PROVIDER_VERSION}` ||
    provider.region !== base.region ||
    canonicalSha256(provider.allowed_account_ids) !== canonicalSha256([base.accountId]) ||
    terraform.backend ||
    terraform.cloud
  )
    throw Error('Terraform power provider, account, region or backend differs');
  const resources = object(after.resource);
  const node = plan.bindings.nodes[0];
  const vms = object(resources.aws_instance);
  if (Object.keys(vms).length !== 1 || !vms[`node_${node.nodeIndex}`])
    throw Error('Terraform power selected VM cardinality differs');
  const vm = object(vms[`node_${node.nodeIndex}`]);
  const tags = object(vm.tags);
  const expected = {
    'xcsh-deployment-id': base.deploymentName,
    'xcsh-execution-engine': 'terraform',
    'xcsh-plan-sha256': base.planSha256,
    'xcsh-node-index': String(node.nodeIndex),
    'ves-io-site-name': node.siteName,
  };
  if (Object.entries(expected).some(([k, v]) => tags[k] !== v)) throw Error('Terraform power VM ownership differs');
  const key = `ce_power_${node.nodeIndex}`;
  const address = `aws_ec2_instance_state.${key}`;
  const controls =
    resources.aws_ec2_instance_state === undefined ? undefined : object(resources.aws_ec2_instance_state);
  let prior: Json | undefined;
  if (controls) {
    if (Object.keys(controls).length !== 1 || !controls[key]) throw Error('Foreign Terraform power control');
    prior = object(controls[key]);
    if (
      prior.instance_id !== node.instanceId ||
      prior.force !== false ||
      !['running', 'stopped'].includes(String(prior.state)) ||
      Object.keys(prior).sort().join(',') !== 'force,instance_id,state'
    )
      throw Error('Terraform power retained control differs');
  }
  if (effect !== 'stop' && !prior) throw Error('Terraform start/release requires a retained power control');
  if (effect === 'release' && prior?.state !== 'running')
    throw Error('Terraform release requires restored running control');
  if (effect === 'release') delete resources.aws_ec2_instance_state;
  else
    resources.aws_ec2_instance_state = {
      [key]: { instance_id: node.instanceId, state: effect === 'stop' ? 'stopped' : 'running', force: false },
    };
  const next = JSON.stringify(after);
  return {
    configuration: next,
    beforeSha256: digest(configuration),
    afterSha256: digest(next),
    address,
    instanceId: node.instanceId,
    effect,
    expectedActions: [effect === 'release' ? 'delete' : prior ? 'update' : 'create'],
  };
}
/** Validate the actual runner receipt and resolved nonsensitive planned control fields before apply. */
export function validateAwsTerraformPowerReceipt(
  base: AwsCePlan,
  plan: AwsWholeSitePowerPlan,
  effect: Effect,
  revision: AwsTerraformPowerRevision,
  receipt: PlanReceipt,
  fields: Record<string, Record<string, unknown> | null>,
): void {
  scope(base, plan, effect);
  if (
    revision.effect !== effect ||
    revision.instanceId !== plan.bindings.nodes[0].instanceId ||
    revision.address !== `aws_ec2_instance_state.ce_power_${plan.bindings.nodes[0].nodeIndex}` ||
    revision.afterSha256 !== digest(revision.configuration) ||
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
    new Set(receipt.changes.map((row) => row.address)).size !== receipt.changes.length
  )
    throw Error('Terraform power saved plan scope or revision differs');
  const mutations = receipt.changes.filter((row) => canonicalSha256(row.actions) !== canonicalSha256(['no-op']));
  if (mutations.length !== 1) throw Error('Terraform power saved plan must contain only one control mutation');
  const change = mutations[0];
  if (
    change.address !== revision.address ||
    change.type !== 'aws_ec2_instance_state' ||
    canonicalSha256(change.actions) !== canonicalSha256(revision.expectedActions)
  )
    throw Error('Terraform power saved plan has unrelated or replacement changes');
  if (effect === 'release') {
    if (Object.keys(fields).length !== 1 || fields[revision.address] !== null)
      throw Error('Terraform power removal projection differs');
  } else {
    const value = object(fields[revision.address]);
    if (
      Object.keys(fields).length !== 1 ||
      value.instance_id !== revision.instanceId ||
      value.force !== false ||
      value.state !== (effect === 'stop' ? 'stopped' : 'running')
    )
      throw Error('Terraform power planned identity/state unresolved or differs');
  }
}
