import type { PlanReceipt } from '../../../terraform/src/runner';
import { verifyAwsCePlan } from './artifacts';
import { canonicalSha256, sha256Hex } from './canonical';
import { siteBindings } from './topology';
import type { AwsCePlan } from './types';

type Json = Record<string, unknown>;
const object = (value: unknown): Json => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed failover configuration');
  return value as Json;
};
export interface AwsTerraformFailoverStage {
  phase: 'stop' | 'start' | 'release';
  deploymentId: string;
  sourcePlanSha256: string;
  instanceId: string;
  instanceAddress: string;
  controlAddress: string;
  previousConfigurationSha256: string;
  configurationSha256: string;
  /** Contains bootstrap material; retain only in restricted deployment storage. */
  configuration: string;
  retainedAddresses: Array<{ address: string; type: string }>;
}

/** A temporary power-state control uses the owning provider; the instance configuration is preserved. */
export function awsTerraformFailoverStages(
  base: AwsCePlan,
  nodeIndex: number,
  instanceId: string,
  configuration: string,
  expectedConfigurationSha256: string,
) {
  verifyAwsCePlan(base);
  const selected = siteBindings(base).find(({ site }) => site.nodeIndexes.includes(nodeIndex));
  if (
    base.engine !== 'terraform' ||
    !selected ||
    !Number.isInteger(nodeIndex) ||
    !/^i-(?:[0-9a-f]{8}|[0-9a-f]{17})$/.test(instanceId) ||
    sha256Hex(configuration) !== expectedConfigurationSha256
  )
    throw new Error('Terraform failover engine, instance or configuration binding differs');
  const original = object(JSON.parse(configuration));
  const provider = object(object(original.provider).aws);
  if (
    provider.region !== base.region ||
    canonicalSha256(provider.allowed_account_ids) !== canonicalSha256([base.accountId])
  )
    throw new Error('Terraform failover provider scope differs');
  const resources = object(original.resource);
  if (resources.aws_ec2_instance_state !== undefined) throw new Error('An instance power control is already present');
  const instance = object(object(resources.aws_instance)[`node_${nodeIndex}`]);
  const tags = object(instance.tags);
  if (
    tags['xcsh-execution-engine'] !== 'terraform' ||
    tags['xcsh-managed-by'] !== 'aws-ce' ||
    tags['xcsh-deployment-id'] !== base.deploymentName ||
    tags['xcsh-plan-sha256'] !== base.planSha256 ||
    tags['xcsh-node-index'] !== String(nodeIndex) ||
    tags['ves-io-site-name'] !== selected.site.name ||
    instance.count !== undefined ||
    instance.for_each !== undefined ||
    instance.ami !== base.intent.image.amiId ||
    instance.instance_type !== base.intent.instance.type ||
    typeof instance.user_data_base64 !== 'string'
  )
    throw new Error('Terraform failover instance ownership or identity differs');
  const retainedAddresses = Object.entries(resources).flatMap(([type, values]) =>
    Object.keys(object(values)).map((name) => ({ address: `${type}.${name}`, type })),
  );
  const controlAddress = 'aws_ec2_instance_state.ce_failover';
  const power = (state: 'stopped' | 'running') => {
    const result = structuredClone(original);
    object(result.resource).aws_ec2_instance_state = { ce_failover: { instance_id: instanceId, state, force: false } };
    return JSON.stringify(result);
  };
  const stopped = power('stopped');
  const running = power('running');
  const stage = (
    phase: AwsTerraformFailoverStage['phase'],
    text: string,
    previous: string,
  ): AwsTerraformFailoverStage => ({
    phase,
    deploymentId: base.deploymentName,
    sourcePlanSha256: base.planSha256,
    instanceId,
    instanceAddress: `aws_instance.node_${nodeIndex}`,
    controlAddress,
    previousConfigurationSha256: previous,
    configurationSha256: sha256Hex(text),
    configuration: text,
    retainedAddresses: structuredClone(retainedAddresses),
  });
  return {
    stop: stage('stop', stopped, expectedConfigurationSha256),
    start: stage('start', running, sha256Hex(stopped)),
    // The pinned AWS provider uses NoopContext for deleting its instance-state control.
    release: stage('release', configuration, sha256Hex(running)),
  };
}

/** Reject partial plans and every mutation except the selected temporary power control. */
export function validateAwsTerraformFailoverPlan(stage: AwsTerraformFailoverStage, receipt: PlanReceipt): void {
  const retained = new Map(stage.retainedAddresses.map((resource) => [resource.address, resource.type]));
  const allowed = { stop: ['create', 'no-op'], start: ['create', 'update', 'no-op'], release: ['delete', 'no-op'] }[
    stage.phase
  ];
  if (
    !allowed ||
    receipt.engine !== 'terraform' ||
    receipt.deploymentId !== stage.deploymentId ||
    receipt.configurationSha256 !== stage.configurationSha256 ||
    sha256Hex(stage.configuration) !== stage.configurationSha256 ||
    !Array.isArray(receipt.changes) ||
    new Set(receipt.changes.map((change) => change.address)).size !== receipt.changes.length ||
    stage.retainedAddresses.some(
      (resource) => !receipt.changes.some((change) => change.address === resource.address),
    ) ||
    (stage.phase !== 'release' && !receipt.changes.some((change) => change.address === stage.controlAddress)) ||
    receipt.changes.some(
      (change) =>
        change.actions.length !== 1 ||
        (change.address === stage.controlAddress
          ? change.type !== 'aws_ec2_instance_state' || !allowed.includes(change.actions[0])
          : retained.get(change.address) !== change.type || change.actions[0] !== 'no-op'),
    )
  )
    throw new Error('Terraform failover plan changes or omits retained deployment resources');
}
