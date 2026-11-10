import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { acquireProcessLock } from '../../../platform/src/ce/process-lock';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { PlanReceipt } from '../../../terraform/src/runner';
import type { CeTerraformService, TerraformSession } from '../../../terraform/src/service';
import type { AwsExecApi } from '../aws/exec';
import { canonicalSha256 } from './canonical';
import { awsTerraformFoundationDeployment } from './terraform-foundation';
import {
  type AwsTerraformPowerRevision,
  reviseAwsTerraformPowerConfiguration,
  validateAwsTerraformPowerReceipt,
} from './terraform-whole-site-power';
import { siteBindings } from './topology';
import type { AwsCePlan } from './types';
import { type AwsWholeSitePowerPlan, verifyAwsWholeSitePowerPlan } from './whole-site-power';
import { collectAwsPowerIdentities } from './whole-site-power-identities';

type Effect = 'stop' | 'start' | 'release';
type Runtime = Pick<CeRuntime, 'observeRegisteredDevices'>;
interface Attempt {
  effect: Effect;
  originalAttemptAt: string;
  requestSha256: string;
}
interface Marker {
  schemaVersion: 1;
  engine: 'terraform';
  planSha256: string;
  bindingsSha256: string;
  instanceId: string;
  attempt: Attempt;
}
interface Preparation {
  marker: Marker;
  revision: AwsTerraformPowerRevision;
  receipt?: PlanReceipt;
}
async function optional(storage: CeDeploymentStore, name: string): Promise<unknown> {
  try {
    return await storage.read(name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
async function context(
  base: AwsCePlan,
  plan: AwsWholeSitePowerPlan,
  effect: Effect,
  storage: CeDeploymentStore,
  requireFresh = false,
) {
  verifyAwsWholeSitePowerPlan(base, plan);
  if (
    base.engine !== 'terraform' ||
    plan.operation !== (effect === 'stop' ? 'stop' : 'start') ||
    canonicalSha256(storage.owner) !== canonicalSha256(plan.bindings.owner)
  )
    throw new Error('Terraform power owning engine or deployment store differs');
  if (
    base.topology.nodeCount !== 1 ||
    plan.bindings.nodes.length !== 1 ||
    siteBindings(base).length !== 1 ||
    siteBindings(base)[0].site.nodeIndexes.length !== 1
  )
    throw new Error('Terraform power requires a separately qualified multi-node lifecycle contract');
  await storage.verify();
  if (canonicalSha256(await storage.read(`${plan.planId}.json`)) !== canonicalSha256(plan))
    throw new Error('Terraform power saved immutable plan differs');
  const checkpoint = (await storage.read(`${plan.planId}-checkpoint.json`)) as {
    schemaVersion: number;
    planSha256: string;
    bindingsSha256: string;
    step: number;
    complete: boolean;
    evidence?: Record<string, unknown>;
    pending?: Attempt;
    attempts?: Partial<Record<Effect, Attempt>>;
  };
  const attempt = checkpoint.pending;
  if (
    checkpoint.schemaVersion !== 1 ||
    checkpoint.planSha256 !== plan.planSha256 ||
    checkpoint.bindingsSha256 !== plan.bindingsSha256 ||
    checkpoint.step !== (effect === 'stop' ? 3 : effect === 'start' ? 1 : 5) ||
    checkpoint.complete !== false ||
    !attempt ||
    attempt.effect !== effect ||
    attempt.requestSha256 !== canonicalSha256({ planSha256: plan.planSha256, effect }) ||
    !Number.isFinite(Date.parse(attempt.originalAttemptAt)) ||
    Date.parse(attempt.originalAttemptAt) > Date.now() ||
    canonicalSha256(attempt) !== canonicalSha256(checkpoint.attempts?.[effect])
  )
    throw new Error('Terraform power original attempt checkpoint differs');
  if (effect === 'release') {
    const v = checkpoint.evidence?.restored as Record<string, unknown> | undefined;
    const age = v ? Date.now() - Date.parse(String(v.collectedAt)) : NaN;
    if (
      v?.source !== 'live' ||
      v.planSha256 !== plan.planSha256 ||
      v.bindingsSha256 !== plan.bindingsSha256 ||
      v.gate !== 'restored' ||
      v.identity !== 'verified' ||
      v.cloud !== 'running' ||
      v.services !== 'active' ||
      v.traffic !== 'passing' ||
      v.registration !== 'healthy' ||
      v.configuration !== 'verified' ||
      v.versions !== 'stable' ||
      v.interfaces !== 'up' ||
      v.canSatisfyInterfaceMutationGate !== true ||
      !Number.isFinite(age) ||
      age < 0 ||
      (requireFresh && age > 30000)
    )
      throw Error('Terraform release requires current restored operational gate');
  }
  const marker: Marker = {
    schemaVersion: 1,
    engine: 'terraform',
    planSha256: plan.planSha256,
    bindingsSha256: plan.bindingsSha256,
    instanceId: plan.bindings.nodes[0].instanceId,
    attempt,
  };
  return { marker, name: `${plan.planId}-${effect}-terraform-dispatch.json` };
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
    throw new Error('Terraform power live ownership or interface identities changed');
  return current;
}

async function open(base: AwsCePlan, plan: AwsWholeSitePowerPlan, terraform: CeTerraformService) {
  return terraform.open(plan.bindings.owner, await awsTerraformFoundationDeployment(base), 'current');
}
function verifyPreparation(plan: AwsWholeSitePowerPlan, effect: Effect, marker: Marker, value: unknown): Preparation {
  const prep = value as Preparation;
  if (!prep || canonicalSha256(prep.marker) !== canonicalSha256(marker) || !prep.revision)
    throw Error('Terraform power preparation differs');
  const revision = prep.revision;
  // Reconstruct from the privately retained pre-revision bytes; no legacy config translation.
  if (
    revision.effect !== effect ||
    revision.instanceId !== plan.bindings.nodes[0].instanceId ||
    revision.address !== `aws_ec2_instance_state.ce_power_${plan.bindings.nodes[0].nodeIndex}`
  )
    throw Error('Terraform power revision differs');
  return prep;
}
async function projection(session: TerraformSession, receipt: PlanReceipt, address: string, signal?: AbortSignal) {
  return session.readProposedResourceFields(
    receipt,
    { [address]: ['instance_id', 'state', 'force'] },
    process.env,
    signal,
  );
}
/** Internal adapter. Public mutation requires the whole-site service/traffic/interface gates. */
export async function dispatchAwsTerraformPowerState(
  base: AwsCePlan,
  plan: AwsWholeSitePowerPlan,
  authorizedPlanSha256: string,
  effect: Effect,
  storage: CeDeploymentStore,
  terraform: CeTerraformService,
  api: AwsExecApi,
  runtime: Runtime,
  signal?: AbortSignal,
): Promise<void> {
  if (authorizedPlanSha256 !== plan.planSha256) throw Error('Terraform power authorization differs');
  const release = await acquireProcessLock(`${storage.directory}/.terraform-power-dispatch-lock`);
  try {
    const { marker, name } = await context(base, plan, effect, storage, true);
    const session = await open(base, plan, terraform);
    const prepName = `${plan.planId}-${effect}-terraform-preparation.json`;
    const existing = await optional(storage, prepName);
    let prep: Preparation;
    if (existing) {
      prep = verifyPreparation(plan, effect, marker, existing);
    } else {
      if ((await optional(storage, name)) !== undefined)
        throw Error('Terraform power dispatch lacks retained preparation');
      if (!session.readConfigurationSha256) throw Error('Terraform current configuration reader required');
      const before = await session.readConfigurationSha256();
      const source = await session.readConfiguration(before);
      const revision = reviseAwsTerraformPowerConfiguration(base, plan, source, effect);
      prep = { marker, revision };
      await storage.write(`${plan.planId}-${effect}-terraform-source.json`, { marker, configuration: source });
      await storage.write(prepName, prep);
    }
    const source = (await storage.read(`${plan.planId}-${effect}-terraform-source.json`)) as {
      marker: Marker;
      configuration: string;
    };
    if (
      canonicalSha256(source.marker) !== canonicalSha256(marker) ||
      canonicalSha256(reviseAwsTerraformPowerConfiguration(base, plan, source.configuration, effect)) !==
        canonicalSha256(prep.revision)
    )
      throw Error('Terraform power retained source or revision differs');
    if (prep.receipt && (await session.readPlanApplicationState(prep.receipt)) !== 'planned')
      throw Error('Terraform power already submitted; reconcile original attempt');
    const current = await identities(base, plan, api, runtime, signal);
    if (current.cloud !== (effect === 'start' ? 'stopped' : 'running'))
      throw Error('Terraform power prerequisite cloud state unavailable');
    if (!session.readConfigurationSha256) throw Error('Terraform current configuration reader required');
    const currentHash = await session.readConfigurationSha256();
    if (currentHash === prep.revision.beforeSha256)
      await session.reviseConfiguration(currentHash, prep.revision.configuration);
    else if (currentHash !== prep.revision.afterSha256) throw Error('Terraform power current revision differs');
    if (!prep.receipt) {
      const receipt = await session.plan(process.env, signal);
      validateAwsTerraformPowerReceipt(
        base,
        plan,
        effect,
        prep.revision,
        receipt,
        await projection(session, receipt, prep.revision.address, signal),
      );
      prep = { ...prep, receipt };
      await storage.write(prepName, prep);
    }
    if (!prep.receipt) throw Error('Terraform power saved receipt missing');
    const priorFields = await session.readPlannedResourceFields(
      prep.receipt,
      { [prep.revision.address]: ['instance_id', 'state', 'force'] },
      process.env,
      signal,
    );
    const prior = priorFields[prep.revision.address];
    if (effect === 'release' && prior?.state !== 'running')
      throw Error('Terraform release prior control is not running');
    if (
      prep.revision.expectedActions[0] === 'create'
        ? prior !== null
        : !prior ||
          prior.instance_id !== prep.revision.instanceId ||
          prior.force !== false ||
          !['running', 'stopped'].includes(String(prior.state))
    )
      throw Error('Terraform prior power ownership differs');
    validateAwsTerraformPowerReceipt(
      base,
      plan,
      effect,
      prep.revision,
      prep.receipt,
      await projection(session, prep.receipt, prep.revision.address, signal),
    );
    if ((await session.readPlanApplicationState(prep.receipt)) !== 'planned')
      throw Error('Terraform power already submitted; reconcile original attempt');
    const priorMarker = await optional(storage, name);
    if (
      priorMarker !== undefined &&
      canonicalSha256(priorMarker) !== canonicalSha256({ marker, receipt: prep.receipt })
    )
      throw Error('Terraform power dispatch marker differs');
    signal?.throwIfAborted();
    await storage.write(name, { marker, receipt: prep.receipt });
    await session.apply(prep.receipt, process.env, signal);
  } finally {
    await release();
  }
}
/** Independently joined cloud state and actual runner state. Neither acknowledgement nor desired state suffices. */
export async function reconcileAwsTerraformPowerState(
  base: AwsCePlan,
  plan: AwsWholeSitePowerPlan,
  effect: Effect,
  originalAttemptAt: string,
  storage: CeDeploymentStore,
  terraform: CeTerraformService,
  api: AwsExecApi,
  runtime: Runtime,
  signal?: AbortSignal,
): Promise<'completed' | 'pending' | 'unknown' | 'not-submitted'> {
  const release = await acquireProcessLock(`${storage.directory}/.terraform-power-dispatch-lock`);
  try {
    const { marker, name } = await context(base, plan, effect, storage);
    if (originalAttemptAt !== marker.attempt.originalAttemptAt) throw Error('Terraform power original attempt differs');
    const value = await optional(storage, `${plan.planId}-${effect}-terraform-preparation.json`);
    if (value === undefined) {
      if ((await optional(storage, name)) !== undefined) throw Error('Terraform power preparation missing');
      return 'not-submitted';
    }
    const prep = verifyPreparation(plan, effect, marker, value);
    if (!prep.receipt) {
      if ((await optional(storage, name)) !== undefined) throw Error('Terraform power receipt missing');
      return 'not-submitted';
    }
    const source = (await storage.read(`${plan.planId}-${effect}-terraform-source.json`)) as {
      marker: Marker;
      configuration: string;
    };
    if (
      canonicalSha256(source.marker) !== canonicalSha256(marker) ||
      canonicalSha256(reviseAwsTerraformPowerConfiguration(base, plan, source.configuration, effect)) !==
        canonicalSha256(prep.revision)
    )
      throw Error('Terraform power retained source or revision differs');
    const session = await open(base, plan, terraform);
    if (effect === 'release') {
      const outcome = await optional(storage, `${plan.planId}-${effect}-terraform-outcome.json`);
      if (outcome !== undefined) {
        const v = outcome as {
          marker: Marker;
          receipt: PlanReceipt;
          fields: Record<string, Record<string, unknown> | null>;
        };
        if (
          canonicalSha256(v.marker) !== canonicalSha256(marker) ||
          canonicalSha256(v.receipt) !== canonicalSha256(prep.receipt)
        )
          throw Error('Terraform release outcome differs');
        const dispatch = await storage.read(name);
        if (canonicalSha256(dispatch) !== canonicalSha256({ marker, receipt: prep.receipt }))
          throw Error('Terraform release dispatch marker differs');
        verifyAppliedIdentities(plan, prep.revision.address, v.fields, true);
        if ((await optional(storage, `${plan.planId}-release-terraform-final-preparing.json`)) === undefined) {
          await session.reconcileApplyFromEvidence(prep.receipt, canonicalSha256(outcome));
        }
        return await finishRelease(base, plan, marker, prep, storage, session, api, runtime, signal);
      }
    }
    const journal = await session.readPlanApplicationState(prep.receipt);
    const saved = await optional(storage, name);
    if (saved !== undefined && canonicalSha256(saved) !== canonicalSha256({ marker, receipt: prep.receipt }))
      throw Error('Terraform power dispatch marker differs');
    if (journal === 'planned') return 'not-submitted';
    if (saved === undefined) throw Error('Terraform power submitted journal lacks dispatch marker');
    validateAwsTerraformPowerReceipt(
      base,
      plan,
      effect,
      prep.revision,
      prep.receipt,
      await projection(session, prep.receipt, prep.revision.address, signal),
    );
    const current = await identities(base, plan, api, runtime, signal);
    const node = plan.bindings.nodes[0];
    const selections: Record<string, string[]> = {
      [prep.revision.address]: ['id', 'instance_id', 'state', 'force'],
      [`aws_instance.node_${node.nodeIndex}`]: ['id'],
    };
    for (const item of node.interfaces)
      selections[`aws_network_interface.node_${node.nodeIndex}_nic_${item.index}`] = ['id', 'mac_address'];
    const fields = await session.readAppliedResourceFields(prep.receipt, selections, process.env, signal);
    verifyAppliedIdentities(plan, prep.revision.address, fields, effect === 'release');
    const control = fields[prep.revision.address];
    if (effect === 'release') {
      if (control !== null) return 'pending';
      if (current.cloud !== 'running') return 'pending';
    } else if (
      !control ||
      control.state !== (effect === 'stop' ? 'stopped' : 'running') ||
      current.cloud !== (effect === 'stop' ? 'stopped' : 'running')
    )
      return 'pending';
    const evidence = {
      schemaVersion: 1,
      marker,
      receipt: prep.receipt,
      cloud: current,
      fields,
      collectedAt: new Date().toISOString(),
    };
    await storage.write(`${plan.planId}-${effect}-terraform-outcome.json`, evidence);
    await session.reconcileApplyFromEvidence(prep.receipt, canonicalSha256(evidence));
    if (effect === 'release')
      return await finishRelease(base, plan, marker, prep, storage, session, api, runtime, signal);
    return 'completed';
  } finally {
    await release();
  }
}

function verifyAppliedIdentities(
  plan: AwsWholeSitePowerPlan,
  address: string,
  fields: Record<string, Record<string, unknown> | null>,
  removal: boolean,
) {
  const node = plan.bindings.nodes[0];
  if (fields[`aws_instance.node_${node.nodeIndex}`]?.id !== node.instanceId)
    throw Error('Terraform applied VM identity differs');
  for (const item of node.interfaces) {
    const row = fields[`aws_network_interface.node_${node.nodeIndex}_nic_${item.index}`];
    if (row?.id !== item.id || String(row?.mac_address).toLowerCase() !== item.mac.toLowerCase())
      throw Error('Terraform applied ENI identity differs');
  }
  const control = fields[address];
  if (removal) {
    if (control !== null) throw Error('Terraform removed control is still present');
  } else if (
    control &&
    (control.id !== node.instanceId || control.instance_id !== node.instanceId || control.force !== false)
  )
    throw Error('Terraform applied power identity differs');
}
async function finishRelease(
  base: AwsCePlan,
  plan: AwsWholeSitePowerPlan,
  marker: Marker,
  prep: Preparation,
  storage: CeDeploymentStore,
  session: TerraformSession,
  api: AwsExecApi,
  runtime: Runtime,
  signal?: AbortSignal,
): Promise<'completed' | 'pending'> {
  const current = await identities(base, plan, api, runtime, signal);
  if (current.cloud !== 'running') return 'pending';
  const preparingName = `${plan.planId}-release-terraform-final-preparing.json`;
  const preparing = await optional(storage, preparingName);
  const expectedPreparing = { marker, removalReceipt: prep.receipt };
  if (preparing !== undefined && canonicalSha256(preparing) !== canonicalSha256(expectedPreparing))
    throw Error('Terraform final preparation differs');
  if (preparing === undefined) await storage.write(preparingName, expectedPreparing);
  const name = `${plan.planId}-release-terraform-final-plan.json`;
  const saved = (await optional(storage, name)) as { marker: Marker; receipt: PlanReceipt } | undefined;
  if (saved && canonicalSha256(saved.marker) !== canonicalSha256(marker))
    throw Error('Terraform final no-change marker differs');
  const receipt = saved?.receipt ?? (await session.plan(process.env, signal));
  if (
    receipt.engine !== 'terraform' ||
    receipt.deploymentId !== base.deploymentName ||
    receipt.backendIdentity !== `local:${base.deploymentName}` ||
    receipt.configurationSha256 !== prep.revision.afterSha256 ||
    receipt.providerLockSha256 !== prep.receipt?.providerLockSha256 ||
    !receipt.noChanges ||
    receipt.operation ||
    receipt.actionInvocations?.length ||
    new Set(receipt.changes.map((r) => r.address)).size !== receipt.changes.length ||
    receipt.changes.some((r) => canonicalSha256(r.actions) !== canonicalSha256(['no-op']))
  )
    throw Error('Terraform release final no-change plan differs');
  if ((await session.readPlanApplicationState(receipt)) !== 'planned')
    throw Error('Terraform final no-change journal differs');
  const node = plan.bindings.nodes[0];
  const selections: Record<string, string[]> = {
    [prep.revision.address]: ['instance_id'],
    [`aws_instance.node_${node.nodeIndex}`]: ['id'],
  };
  for (const item of node.interfaces)
    selections[`aws_network_interface.node_${node.nodeIndex}_nic_${item.index}`] = ['id', 'mac_address'];
  if (!saved) await storage.write(name, { marker, receipt });
  const fields = await session.readAppliedResourceFields(receipt, selections, process.env, signal);
  verifyAppliedIdentities(plan, prep.revision.address, fields, true);
  await storage.write(`${plan.planId}-release-terraform-complete.json`, {
    schemaVersion: 1,
    marker,
    receipt,
    fields,
    cloud: current,
    collectedAt: new Date().toISOString(),
  });
  return 'completed';
}
