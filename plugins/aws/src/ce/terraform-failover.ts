import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { acquireProcessLock } from '../../../platform/src/ce/process-lock';
import type { PlanReceipt } from '../../../terraform/src/runner';
import type { TerraformSession } from '../../../terraform/src/service';
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

export interface AwsTerraformFailover {
  schemaVersion: 1;
  engine: 'terraform';
  kind: 'aws-ce-terraform-failover';
  sourcePlanSha256: string;
  nodeIndex: number;
  instanceId: string;
  stages: ReturnType<typeof awsTerraformFailoverStages>;
  planId: string;
  planSha256: string;
}

interface FailoverCheckpoint {
  schemaVersion: 1;
  engine: 'terraform';
  sourcePlanSha256: string;
  failoverPlanSha256: string;
  phase: 'stop' | 'outage' | 'start' | 'recovered' | 'release' | 'complete';
  submittedPlanSha256?: string;
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

export function buildAwsTerraformFailover(
  base: AwsCePlan,
  nodeIndex: number,
  instanceId: string,
  configuration: string,
  expectedConfigurationSha256: string,
): AwsTerraformFailover {
  const stages = awsTerraformFailoverStages(base, nodeIndex, instanceId, configuration, expectedConfigurationSha256);
  const draft = {
    schemaVersion: 1 as const,
    engine: 'terraform' as const,
    kind: 'aws-ce-terraform-failover' as const,
    sourcePlanSha256: base.planSha256,
    nodeIndex,
    instanceId,
    stages,
  };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planId: `aws-ce-failover-${planSha256.slice(0, 24)}`, planSha256 };
}

export function verifyAwsTerraformFailover(base: AwsCePlan, failover: AwsTerraformFailover): void {
  if (
    failover.schemaVersion !== 1 ||
    failover.engine !== 'terraform' ||
    failover.kind !== 'aws-ce-terraform-failover' ||
    failover.sourcePlanSha256 !== base.planSha256
  )
    throw new Error('AWS Terraform failover schema or source differs');
  const expected = buildAwsTerraformFailover(
    base,
    failover.nodeIndex,
    failover.instanceId,
    failover.stages.release.configuration,
    failover.stages.release.configurationSha256,
  );
  if (canonicalSha256(expected) !== canonicalSha256(failover))
    throw new Error('Saved AWS Terraform failover plan changed');
}

async function optional<T>(storage: CeDeploymentStore, name: string): Promise<T | undefined> {
  try {
    return (await storage.read(name)) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

/** Execute the entire outage/restoration sequence; submitted saved plans are safe to resume exactly. */
export async function runAwsTerraformFailover(
  base: AwsCePlan,
  failover: AwsTerraformFailover,
  authorizedPlanSha256: string,
  session: TerraformSession,
  storage: CeDeploymentStore,
  collect: (phase: 'outage' | 'recovered', signal?: AbortSignal) => Promise<{ acceptance?: unknown }>,
  env: Record<string, string | undefined>,
  signal?: AbortSignal,
  polling: { attempts: number; intervalMs: number; wait(ms: number): Promise<void> } = {
    attempts: 30,
    intervalMs: 10_000,
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  },
) {
  verifyAwsTerraformFailover(base, failover);
  if (authorizedPlanSha256 !== failover.planSha256)
    throw new Error('Exact Terraform failover authorization is required');
  if (
    storage.owner.engine !== 'terraform' ||
    canonicalSha256(storage.owner) !==
      canonicalSha256({
        deploymentId: base.deploymentName,
        engine: 'terraform',
        provider: 'aws',
        account: base.accountId,
        region: base.region,
      })
  )
    throw new Error('Only the owning Terraform engine may execute failover');
  if (!Number.isInteger(polling.attempts) || polling.attempts < 1 || polling.intervalMs < 0)
    throw new Error('Failover convergence bounds are invalid');
  const release = await acquireProcessLock(`${storage.directory}/.failover-lock`);
  try {
    await storage.verify();
    const sourceName = `${failover.planId}.json`;
    const saved = await optional<AwsTerraformFailover>(storage, sourceName);
    if (saved === undefined) await storage.write(sourceName, failover);
    else if (canonicalSha256(saved) !== canonicalSha256(failover)) throw new Error('Saved failover source differs');
    const checkpointName = `${failover.planId}-checkpoint.json`;
    let checkpoint = await optional<FailoverCheckpoint>(storage, checkpointName);
    if (!checkpoint) {
      checkpoint = {
        schemaVersion: 1,
        engine: 'terraform',
        sourcePlanSha256: base.planSha256,
        failoverPlanSha256: failover.planSha256,
        phase: 'stop',
      };
      await storage.write(checkpointName, checkpoint);
    }
    const phases = ['stop', 'outage', 'start', 'recovered', 'release', 'complete'];
    if (
      checkpoint.schemaVersion !== 1 ||
      checkpoint.engine !== 'terraform' ||
      checkpoint.sourcePlanSha256 !== base.planSha256 ||
      checkpoint.failoverPlanSha256 !== failover.planSha256 ||
      !phases.includes(checkpoint.phase) ||
      (['outage', 'recovered', 'complete'].includes(checkpoint.phase) &&
        checkpoint.submittedPlanSha256 !== undefined) ||
      (['stop', 'start', 'release'].includes(checkpoint.phase) &&
        checkpoint.submittedPlanSha256 !== undefined &&
        !/^[a-f0-9]{64}$/.test(checkpoint.submittedPlanSha256))
    )
      throw new Error('Terraform failover checkpoint differs');

    let active = checkpoint as FailoverCheckpoint;
    const mutate = async (name: 'stop' | 'start' | 'release', next: FailoverCheckpoint['phase']) => {
      const stage = failover.stages[name];
      let receipt: PlanReceipt;
      if (active.submittedPlanSha256) {
        receipt = (await storage.read(`${failover.planId}-${name}-plan.json`)) as PlanReceipt;
        validateAwsTerraformFailoverPlan(stage, receipt);
        if (receipt.planSha256 !== active.submittedPlanSha256)
          throw new Error('Submitted Terraform failover plan differs');
      } else {
        await session.reviseConfiguration(stage.previousConfigurationSha256, stage.configuration);
        receipt = await session.plan(env, signal);
        validateAwsTerraformFailoverPlan(stage, receipt);
        await storage.write(`${failover.planId}-${name}-plan.json`, receipt);
        active = { ...active, phase: name, submittedPlanSha256: receipt.planSha256 };
        await storage.write(checkpointName, active);
      }
      await storage.verify();
      await session.apply(receipt, env, signal);
      active = { ...active, phase: next, submittedPlanSha256: undefined };
      await storage.write(checkpointName, active);
    };
    const converge = async (phase: 'outage' | 'recovered', next: FailoverCheckpoint['phase']) => {
      for (let attempt = 0; attempt < polling.attempts; attempt++) {
        signal?.throwIfAborted();
        const evidence = await collect(phase, signal);
        if (evidence.acceptance === 'passed') {
          await storage.write(`${failover.planId}-${phase}-evidence.json`, evidence);
          active = { ...active, phase: next, submittedPlanSha256: undefined };
          await storage.write(checkpointName, active);
          return;
        }
        if (attempt + 1 < polling.attempts) await polling.wait(polling.intervalMs);
      }
      throw new Error(`Terraform failover ${phase} convergence deadline exceeded`);
    };
    if (active.phase === 'stop') await mutate('stop', 'outage');
    if (active.phase === 'outage') await converge('outage', 'start');
    if (active.phase === 'start') await mutate('start', 'recovered');
    if (active.phase === 'recovered') await converge('recovered', 'release');
    if (active.phase === 'release') await mutate('release', 'complete');
    const final = await session.plan(env, signal);
    validateAwsTerraformFailoverPlan(failover.stages.release, final);
    if (!final.noChanges || final.changes.some((change) => change.actions[0] !== 'no-op'))
      throw new Error('Terraform failover did not finish with a refresh-enabled no-change plan');
    const receipt = {
      status: 'failover-complete' as const,
      engine: 'terraform' as const,
      planId: failover.planId,
      planSha256: failover.planSha256,
      nodeIndex: failover.nodeIndex,
      finalPlanSha256: final.planSha256,
      observedAt: new Date().toISOString(),
      traffic: 'unknown' as const,
      originControl: 'unknown' as const,
    };
    await storage.write(`${failover.planId}-receipt.json`, receipt);
    return receipt;
  } finally {
    await release();
  }
}
