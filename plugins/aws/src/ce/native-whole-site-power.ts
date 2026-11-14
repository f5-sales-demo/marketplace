import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { acquireProcessLock } from '../../../platform/src/ce/process-lock';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { AwsExecApi } from '../aws/exec';
import { canonicalSha256 } from './canonical';
import { scopedAwsApi } from './scoped-exec';
import { siteBindings } from './topology';
import type { AwsCePlan } from './types';
import { type AwsWholeSitePowerPlan, verifyAwsWholeSitePowerPlan } from './whole-site-power';
import { collectAwsPowerIdentities } from './whole-site-power-identities';

type Effect = 'stop' | 'start';
type Runtime = Pick<CeRuntime, 'observeRegisteredDevices'>;
interface Attempt {
  effect: Effect;
  originalAttemptAt: string;
  requestSha256: string;
}
interface Marker {
  schemaVersion: 1;
  engine: 'native';
  planSha256: string;
  bindingsSha256: string;
  instanceId: string;
  attempt: Attempt;
}
async function optional(storage: CeDeploymentStore, name: string): Promise<unknown> {
  try {
    return await storage.read(name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
async function context(base: AwsCePlan, plan: AwsWholeSitePowerPlan, effect: Effect, storage: CeDeploymentStore) {
  verifyAwsWholeSitePowerPlan(base, plan);
  if (
    base.engine !== 'native' ||
    plan.operation !== effect ||
    canonicalSha256(storage.owner) !== canonicalSha256(plan.bindings.owner)
  )
    throw new Error('Native power owning engine or deployment store differs');
  if (
    base.topology.nodeCount !== 1 ||
    plan.bindings.nodes.length !== 1 ||
    siteBindings(base).length !== 1 ||
    siteBindings(base)[0].site.nodeIndexes.length !== 1
  )
    throw new Error('Native power requires a separately qualified multi-node lifecycle contract');
  await storage.verify();
  if (canonicalSha256(await storage.read(`${plan.planId}.json`)) !== canonicalSha256(plan))
    throw new Error('Native power saved immutable plan differs');
  const checkpoint = (await storage.read(`${plan.planId}-checkpoint.json`)) as {
    schemaVersion: number;
    planSha256: string;
    bindingsSha256: string;
    step: number;
    complete: boolean;
    pending?: Attempt;
    attempts?: Partial<Record<Effect, Attempt>>;
  };
  const attempt = checkpoint.pending;
  if (
    checkpoint.schemaVersion !== 1 ||
    checkpoint.planSha256 !== plan.planSha256 ||
    checkpoint.bindingsSha256 !== plan.bindingsSha256 ||
    checkpoint.step !== (effect === 'stop' ? 3 : 1) ||
    checkpoint.complete !== false ||
    !attempt ||
    attempt.effect !== effect ||
    attempt.requestSha256 !== canonicalSha256({ planSha256: plan.planSha256, effect }) ||
    !Number.isFinite(Date.parse(attempt.originalAttemptAt)) ||
    Date.parse(attempt.originalAttemptAt) > Date.now() ||
    canonicalSha256(attempt) !== canonicalSha256(checkpoint.attempts?.[effect])
  )
    throw new Error('Native power original attempt checkpoint differs');
  const marker: Marker = {
    schemaVersion: 1,
    engine: 'native',
    planSha256: plan.planSha256,
    bindingsSha256: plan.bindingsSha256,
    instanceId: plan.bindings.nodes[0].instanceId,
    attempt,
  };
  return { marker, name: `${plan.planId}-${effect}-native-dispatch.json` };
}
async function identities(
  base: AwsCePlan,
  plan: AwsWholeSitePowerPlan,
  api: AwsExecApi,
  runtime: Runtime,
  signal?: AbortSignal,
) {
  const resolved: Record<string, string> = {};
  for (const node of plan.bindings.nodes) {
    resolved[`__INSTANCE_${node.nodeIndex}__`] = node.instanceId;
    for (const item of node.interfaces) {
      resolved[`__ENI_${node.nodeIndex}_${item.index}__`] = item.id;
      resolved[`__ENI_${node.nodeIndex}_${item.index}_MAC__`] = item.mac;
    }
  }
  const current = await collectAwsPowerIdentities(base, resolved, api, runtime, signal);
  if (
    canonicalSha256({ owner: current.owner, nodes: current.nodes }) !==
    canonicalSha256({ owner: plan.bindings.owner, nodes: plan.bindings.nodes })
  )
    throw new Error('Native power live ownership or interface identities changed');
  return current;
}
/** Internal engine adapter. The whole-site driver must establish service, traffic and interface gates first. */
export async function dispatchAwsNativePowerState(
  base: AwsCePlan,
  plan: AwsWholeSitePowerPlan,
  authorizedPlanSha256: string,
  effect: Effect,
  storage: CeDeploymentStore,
  api: AwsExecApi,
  runtime: Runtime,
  signal?: AbortSignal,
): Promise<void> {
  if (authorizedPlanSha256 !== plan.planSha256) throw new Error('Native power authorization differs');
  const release = await acquireProcessLock(`${storage.directory}/.native-power-dispatch-lock`);
  try {
    const { marker, name } = await context(base, plan, effect, storage);
    if ((await optional(storage, name)) !== undefined)
      throw new Error('Native power already submitted; reconcile original attempt');
    const current = await identities(base, plan, api, runtime, signal);
    if (current.cloud !== (effect === 'stop' ? 'running' : 'stopped'))
      throw new Error('Native power prerequisite cloud state is unavailable');
    signal?.throwIfAborted();
    // Persist before the provider call. Lost responses or process interruption never authorize replay.
    await storage.write(name, marker);
    const result = await scopedAwsApi(api, base.intent.awsProfile ?? 'default', signal).exec('aws', [
      'ec2',
      effect === 'stop' ? 'stop-instances' : 'start-instances',
      '--instance-ids',
      marker.instanceId,
      '--region',
      base.region,
      '--output',
      'json',
    ]);
    if (result.exitCode !== 0) throw new Error('Native power provider submission failed; reconcile original attempt');
    let value: Record<string, unknown>;
    try {
      value = JSON.parse(result.stdout);
    } catch {
      throw new Error('Malformed native power acknowledgement');
    }
    const rows = value?.[effect === 'stop' ? 'StoppingInstances' : 'StartingInstances'];
    if (
      !Array.isArray(rows) ||
      rows.length !== 1 ||
      rows[0]?.InstanceId !== marker.instanceId ||
      rows[0]?.PreviousState?.Name !== (effect === 'stop' ? 'running' : 'stopped') ||
      rows[0]?.CurrentState?.Name !== (effect === 'stop' ? 'stopping' : 'pending')
    )
      throw new Error('Malformed native power acknowledgement');
  } finally {
    await release();
  }
}
/** Fresh identity-verified cloud state, never a request acknowledgement or CE link-health observation. */
export async function reconcileAwsNativePowerState(
  base: AwsCePlan,
  plan: AwsWholeSitePowerPlan,
  effect: Effect,
  originalAttemptAt: string,
  storage: CeDeploymentStore,
  api: AwsExecApi,
  runtime: Runtime,
  signal?: AbortSignal,
): Promise<'completed' | 'pending' | 'unknown' | 'not-submitted'> {
  const release = await acquireProcessLock(`${storage.directory}/.native-power-dispatch-lock`);
  try {
    const { marker, name } = await context(base, plan, effect, storage);
    if (originalAttemptAt !== marker.attempt.originalAttemptAt)
      throw new Error('Native power original attempt differs');
    const saved = await optional(storage, name);
    if (saved === undefined) return 'not-submitted';
    if (canonicalSha256(saved) !== canonicalSha256(marker)) throw new Error('Native power dispatch marker differs');
    const current = await identities(base, plan, api, runtime, signal);
    if (current.cloud === (effect === 'stop' ? 'stopped' : 'running')) return 'completed';
    return 'pending';
  } finally {
    await release();
  }
}
