import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { acquireProcessLock } from '../../../platform/src/ce/process-lock';
import type { PlanReceipt } from '../../../terraform/src/runner';
import type { CeTerraformService } from '../../../terraform/src/service';
import type { AwsExecApi } from '../aws/exec';
import { canonicalSha256 } from './canonical';
import { scopedAwsApi } from './scoped-exec';
import { awsTerraformFoundationDeployment } from './terraform-foundation';
import type { AwsCePlan } from './types';
import { type AwsWholeSitePowerPlan, verifyAwsWholeSitePowerPlan } from './whole-site-power';
import { powerServiceComponentSha256 } from './whole-site-power-service-binding';
import {
  type AwsNlbMembershipRevision,
  collectAwsPowerNlbServices,
  reviseAwsTerraformNlbMembership,
  validateAwsTerraformNlbMembershipReceipt,
} from './whole-site-power-services';

type Effect = 'withdraw' | 'restore';
async function optional(storage: CeDeploymentStore, name: string) {
  try {
    return await storage.read(name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
async function context(base: AwsCePlan, plan: AwsWholeSitePowerPlan, effect: Effect, storage: CeDeploymentStore) {
  verifyAwsWholeSitePowerPlan(base, plan);
  await storage.verify();
  if (
    plan.operation !== (effect === 'withdraw' ? 'stop' : 'start') ||
    base.topology.nodeCount !== 1 ||
    canonicalSha256(storage.owner) !== canonicalSha256(plan.bindings.owner) ||
    canonicalSha256(await storage.read(`${plan.planId}.json`)) !== canonicalSha256(plan)
  )
    throw Error('NLB owning plan differs');
  const cp = (await storage.read(`${plan.planId}-checkpoint.json`)) as {
    schemaVersion: number;
    planSha256: string;
    bindingsSha256: string;
    step: number;
    complete: boolean;
    pending?: { effect: string; originalAttemptAt: string; requestSha256: string };
    attempts?: Record<string, unknown>;
  };
  const attempt = cp.pending;
  if (
    cp.schemaVersion !== 1 ||
    cp.planSha256 !== plan.planSha256 ||
    cp.bindingsSha256 !== plan.bindingsSha256 ||
    cp.step !== (effect === 'withdraw' ? 1 : 3) ||
    cp.complete !== false ||
    !attempt ||
    attempt.effect !== effect ||
    attempt.requestSha256 !== canonicalSha256({ planSha256: plan.planSha256, effect }) ||
    !Number.isFinite(Date.parse(attempt.originalAttemptAt)) ||
    Date.parse(attempt.originalAttemptAt) > Date.now() ||
    canonicalSha256(attempt) !== canonicalSha256(cp.attempts?.[effect])
  )
    throw Error('NLB original attempt differs');
  return {
    schemaVersion: 1,
    engine: base.engine,
    planSha256: plan.planSha256,
    bindingsSha256: plan.bindingsSha256,
    servicesSha256: powerServiceComponentSha256(base, plan.bindings, 'nlb'),
    attempt,
  };
}
/** Internal native service adapter, executed only after the whole-site coordinator establishes its gates. */
export async function dispatchAwsNativeNlbMembership(
  base: AwsCePlan,
  plan: AwsWholeSitePowerPlan,
  authorization: string,
  effect: Effect,
  storage: CeDeploymentStore,
  values: Record<string, string>,
  api: AwsExecApi,
  signal?: AbortSignal,
): Promise<void> {
  if (base.engine !== 'native') throw Error('Native NLB engine differs');
  if (authorization !== plan.planSha256) throw Error('Native NLB authorization differs');
  const release = await acquireProcessLock(`${storage.directory}/.native-nlb-power-lock`);
  try {
    const marker = await context(base, plan, effect, storage);
    const name = `${plan.planId}-${effect}-native-nlb-dispatch.json`;
    if ((await optional(storage, name)) !== undefined)
      throw Error('Native NLB already submitted; reconcile original attempt');
    const observed = await collectAwsPowerNlbServices(base, values, api, signal);
    if (
      observed.servicesSha256 !== marker.servicesSha256 ||
      observed.status !== (effect === 'withdraw' ? 'active' : 'withdrawn')
    )
      throw Error('Native NLB current service binding or prerequisite differs');
    signal?.throwIfAborted();
    await storage.write(name, { marker, services: observed.services });
    const r = await scopedAwsApi(api, base.intent.awsProfile ?? 'default', signal).exec('aws', [
      'elbv2',
      effect === 'withdraw' ? 'deregister-targets' : 'register-targets',
      '--target-group-arn',
      observed.services.targetGroupArn,
      '--targets',
      JSON.stringify([observed.services.target]),
      '--region',
      base.region,
      '--output',
      'json',
    ]);
    if (r.exitCode) throw Error('Native NLB submission failed; reconcile original attempt');
    const acknowledgement = JSON.parse(r.stdout || '{}');
    if (
      !acknowledgement ||
      typeof acknowledgement !== 'object' ||
      Array.isArray(acknowledgement) ||
      Object.keys(acknowledgement).length
    )
      throw Error('Native NLB acknowledgement malformed');
  } finally {
    await release();
  }
}
export async function reconcileAwsNativeNlbMembership(
  base: AwsCePlan,
  plan: AwsWholeSitePowerPlan,
  effect: Effect,
  originalAttemptAt: string,
  storage: CeDeploymentStore,
  values: Record<string, string>,
  api: AwsExecApi,
  signal?: AbortSignal,
): Promise<'completed' | 'pending' | 'not-submitted'> {
  if (base.engine !== 'native') throw Error('Native NLB engine differs');
  const release = await acquireProcessLock(`${storage.directory}/.native-nlb-power-lock`);
  try {
    const marker = await context(base, plan, effect, storage);
    if (originalAttemptAt !== marker.attempt.originalAttemptAt) throw Error('NLB original attempt differs');
    const saved = (await optional(storage, `${plan.planId}-${effect}-native-nlb-dispatch.json`)) as
      | { marker: unknown; services: unknown }
      | undefined;
    if (!saved) return 'not-submitted';
    if (
      canonicalSha256(saved.marker) !== canonicalSha256(marker) ||
      canonicalSha256(saved.services) !== marker.servicesSha256
    )
      throw Error('Native NLB dispatch marker differs');
    const observed = await collectAwsPowerNlbServices(base, values, api, signal);
    if (observed.servicesSha256 !== marker.servicesSha256) throw Error('Native NLB retained service identity changed');
    if (observed.status !== (effect === 'withdraw' ? 'withdrawn' : 'active')) return 'pending';
    await storage.write(`${plan.planId}-${effect}-native-nlb-outcome.json`, { marker, observed });
    return 'completed';
  } finally {
    await release();
  }
}

type Marker = Awaited<ReturnType<typeof context>>;
interface Preparation {
  marker: Marker;
  source: string;
  revision: AwsNlbMembershipRevision;
  receipt?: PlanReceipt;
}
async function retainedWithdrawal(
  base: AwsCePlan,
  plan: AwsWholeSitePowerPlan,
  storage: CeDeploymentStore,
  effect: Effect,
) {
  if (effect !== 'restore') return undefined;
  if (!plan.maintenance) throw Error('Terraform NLB stopped maintenance missing');
  const id = `aws-ce-power-${plan.maintenance.stopPlanSha256.slice(0, 24)}`;
  const stop = (await storage.read(`${id}.json`)) as AwsWholeSitePowerPlan;
  verifyAwsWholeSitePowerPlan(base, stop);
  if (
    stop.operation !== 'stop' ||
    stop.planSha256 !== plan.maintenance.stopPlanSha256 ||
    stop.transitionId !== plan.transitionId ||
    stop.bindingsSha256 !== plan.bindingsSha256
  )
    throw Error('Terraform NLB retained stop plan differs');
  const prior = (await storage.read(`${id}-withdraw-terraform-nlb-preparation.json`)) as Preparation;
  if (
    prior.marker.planSha256 !== plan.maintenance.stopPlanSha256 ||
    prior.marker.servicesSha256 !== powerServiceComponentSha256(base, plan.bindings, 'nlb') ||
    prior.marker.bindingsSha256 !== plan.bindingsSha256 ||
    !prior.receipt
  )
    throw Error('Terraform NLB retained withdrawal differs');
  const dispatch = await storage.read(`${id}-withdraw-terraform-nlb-dispatch.json`);
  const outcome = (await storage.read(`${id}-withdraw-terraform-nlb-outcome.json`)) as {
    marker: Marker;
    receipt: PlanReceipt;
    observed: Awaited<ReturnType<typeof collectAwsPowerNlbServices>>;
    applied: Record<string, unknown>;
    collectedAt: string;
  };
  if (
    prior.marker.engine !== 'terraform' ||
    prior.marker.attempt.effect !== 'withdraw' ||
    canonicalSha256(dispatch) !== canonicalSha256({ marker: prior.marker, receipt: prior.receipt }) ||
    canonicalSha256(outcome.marker) !== canonicalSha256(prior.marker) ||
    canonicalSha256(outcome.receipt) !== canonicalSha256(prior.receipt) ||
    outcome.observed.status !== 'withdrawn' ||
    outcome.observed.servicesSha256 !== powerServiceComponentSha256(base, plan.bindings, 'nlb') ||
    canonicalSha256(outcome.observed.services) !== powerServiceComponentSha256(base, plan.bindings, 'nlb') ||
    canonicalSha256(outcome.applied) !== canonicalSha256({ [prior.revision.address]: null }) ||
    !Number.isFinite(Date.parse(outcome.collectedAt)) ||
    Date.parse(outcome.collectedAt) > Date.now() ||
    Date.parse(outcome.collectedAt) < Date.parse(prior.marker.attempt.originalAttemptAt)
  )
    throw Error('Terraform NLB completed withdrawal evidence differs');
  const services = outcome.observed.services;
  if (
    canonicalSha256(reviseAwsTerraformNlbMembership(base, services, prior.source, 'withdraw')) !==
    canonicalSha256(prior.revision)
  )
    throw Error('Terraform NLB completed withdrawal revision differs');
  validateAwsTerraformNlbMembershipReceipt(
    base,
    services,
    prior.revision,
    prior.receipt,
    {
      [prior.revision.address]: {
        target_group_arn: services.targetGroupArn,
        target_id: services.target.Id,
        port: services.target.Port,
        availability_zone: 'all',
      },
    },
    { [prior.revision.address]: null },
  );
  return prior.revision;
}
async function projections(
  session: import('../../../terraform/src/service').TerraformSession,
  receipt: PlanReceipt,
  address: string,
  signal?: AbortSignal,
) {
  const selections = { [address]: ['target_group_arn', 'target_id', 'port', 'availability_zone'] };
  return {
    before: await session.readPlannedResourceFields(receipt, selections, process.env, signal),
    after: await session.readProposedResourceFields(receipt, selections, process.env, signal),
  };
}
/** Internal Terraform service adapter. Public gates remain owned by the coordinator. */
export async function dispatchAwsTerraformNlbMembership(
  base: AwsCePlan,
  plan: AwsWholeSitePowerPlan,
  authorization: string,
  effect: Effect,
  storage: CeDeploymentStore,
  values: Record<string, string>,
  api: AwsExecApi,
  terraform: CeTerraformService,
  signal?: AbortSignal,
): Promise<void> {
  if (base.engine !== 'terraform' || authorization !== plan.planSha256)
    throw Error('Terraform NLB engine or authorization differs');
  const release = await acquireProcessLock(`${storage.directory}/.terraform-nlb-power-lock`);
  try {
    const marker = await context(base, plan, effect, storage);
    const name = `${plan.planId}-${effect}-terraform-nlb-preparation.json`;
    const dispatchName = `${plan.planId}-${effect}-terraform-nlb-dispatch.json`;
    const observed = await collectAwsPowerNlbServices(base, values, api, signal);
    if (observed.servicesSha256 !== marker.servicesSha256) throw Error('Terraform NLB service identity differs');
    const session = await terraform.open(plan.bindings.owner, await awsTerraformFoundationDeployment(base), 'current');
    let prep = (await optional(storage, name)) as Preparation | undefined;
    const retained = await retainedWithdrawal(base, plan, storage, effect);
    if (prep) {
      if (
        canonicalSha256(prep.marker) !== canonicalSha256(marker) ||
        canonicalSha256(reviseAwsTerraformNlbMembership(base, observed.services, prep.source, effect, retained)) !==
          canonicalSha256(prep.revision)
      )
        throw Error('Terraform NLB preparation differs');
      if (prep.receipt && (await session.readPlanApplicationState(prep.receipt)) !== 'planned')
        throw Error('Terraform NLB already submitted; reconcile original attempt');
    } else {
      if ((await optional(storage, dispatchName)) !== undefined)
        throw Error('Terraform NLB submission lacks preparation');
      if (!session.readConfigurationSha256) throw Error('Terraform NLB configuration reader missing');
      const source = await session.readConfiguration(await session.readConfigurationSha256());
      prep = {
        marker,
        source,
        revision: reviseAwsTerraformNlbMembership(base, observed.services, source, effect, retained),
      };
      await storage.write(name, prep);
    }
    if (observed.status !== (effect === 'withdraw' ? 'active' : 'withdrawn'))
      throw Error('Terraform NLB prerequisite membership differs');
    if (!session.readConfigurationSha256) throw Error('Terraform NLB configuration reader missing');
    const current = await session.readConfigurationSha256();
    if (current === prep.revision.beforeSha256) await session.reviseConfiguration(current, prep.revision.configuration);
    else if (current !== prep.revision.afterSha256) throw Error('Terraform NLB current revision differs');
    if (!prep.receipt) {
      const receipt = await session.plan(process.env, signal);
      const fields = await projections(session, receipt, prep.revision.address, signal);
      validateAwsTerraformNlbMembershipReceipt(
        base,
        observed.services,
        prep.revision,
        receipt,
        fields.before,
        fields.after,
      );
      prep = { ...prep, receipt };
      await storage.write(name, prep);
    }
    if (!prep.receipt) throw Error('Terraform NLB receipt missing');
    const fields = await projections(session, prep.receipt, prep.revision.address, signal);
    validateAwsTerraformNlbMembershipReceipt(
      base,
      observed.services,
      prep.revision,
      prep.receipt,
      fields.before,
      fields.after,
    );
    if ((await session.readPlanApplicationState(prep.receipt)) !== 'planned')
      throw Error('Terraform NLB already submitted');
    const expected = { marker, receipt: prep.receipt };
    const saved = await optional(storage, dispatchName);
    if (saved !== undefined && canonicalSha256(saved) !== canonicalSha256(expected))
      throw Error('Terraform NLB dispatch marker differs');
    signal?.throwIfAborted();
    await storage.write(dispatchName, expected);
    await session.apply(prep.receipt, process.env, signal);
  } finally {
    await release();
  }
}
export async function reconcileAwsTerraformNlbMembership(
  base: AwsCePlan,
  plan: AwsWholeSitePowerPlan,
  effect: Effect,
  originalAttemptAt: string,
  storage: CeDeploymentStore,
  values: Record<string, string>,
  api: AwsExecApi,
  terraform: CeTerraformService,
  signal?: AbortSignal,
): Promise<'completed' | 'pending' | 'not-submitted'> {
  if (base.engine !== 'terraform') throw Error('Terraform NLB engine differs');
  const release = await acquireProcessLock(`${storage.directory}/.terraform-nlb-power-lock`);
  try {
    const marker = await context(base, plan, effect, storage);
    if (originalAttemptAt !== marker.attempt.originalAttemptAt) throw Error('Terraform NLB original attempt differs');
    const prep = (await optional(storage, `${plan.planId}-${effect}-terraform-nlb-preparation.json`)) as
      | Preparation
      | undefined;
    const saved = await optional(storage, `${plan.planId}-${effect}-terraform-nlb-dispatch.json`);
    if (!prep?.receipt) {
      if (saved !== undefined) throw Error('Terraform NLB submission lacks receipt');
      return 'not-submitted';
    }
    if (canonicalSha256(prep.marker) !== canonicalSha256(marker))
      throw Error('Terraform NLB preparation marker differs');
    const observed = await collectAwsPowerNlbServices(base, values, api, signal);
    if (
      observed.servicesSha256 !== marker.servicesSha256 ||
      canonicalSha256(
        reviseAwsTerraformNlbMembership(
          base,
          observed.services,
          prep.source,
          effect,
          await retainedWithdrawal(base, plan, storage, effect),
        ),
      ) !== canonicalSha256(prep.revision)
    )
      throw Error('Terraform NLB retained preparation differs');
    const session = await terraform.open(plan.bindings.owner, await awsTerraformFoundationDeployment(base), 'current');
    const journal = await session.readPlanApplicationState(prep.receipt);
    if (saved !== undefined && canonicalSha256(saved) !== canonicalSha256({ marker, receipt: prep.receipt }))
      throw Error('Terraform NLB dispatch marker differs');
    if (journal === 'planned') return 'not-submitted';
    if (saved === undefined) throw Error('Terraform NLB submitted journal lacks marker');
    const fields = await projections(session, prep.receipt, prep.revision.address, signal);
    validateAwsTerraformNlbMembershipReceipt(
      base,
      observed.services,
      prep.revision,
      prep.receipt,
      fields.before,
      fields.after,
    );
    const applied = await session.readAppliedResourceFields(
      prep.receipt,
      { [prep.revision.address]: ['target_group_arn', 'target_id', 'port', 'availability_zone'] },
      process.env,
      signal,
    );
    const expected =
      effect === 'withdraw'
        ? null
        : {
            target_group_arn: observed.services.targetGroupArn,
            target_id: observed.services.target.Id,
            port: observed.services.target.Port,
            availability_zone: 'all',
          };
    if (Object.keys(applied).length !== 1 || !Object.hasOwn(applied, prep.revision.address))
      throw Error('Terraform NLB applied identity incomplete');
    const actual = applied[prep.revision.address];
    const owned = {
      target_group_arn: observed.services.targetGroupArn,
      target_id: observed.services.target.Id,
      port: observed.services.target.Port,
      availability_zone: 'all',
    };
    if (actual !== null && canonicalSha256(actual) !== canonicalSha256(owned))
      throw Error('Terraform NLB applied attachment identity differs');
    if (canonicalSha256(actual) !== canonicalSha256(expected)) return 'pending';
    if (observed.status !== (effect === 'withdraw' ? 'withdrawn' : 'active')) return 'pending';
    const evidence = { marker, receipt: prep.receipt, observed, applied, collectedAt: new Date().toISOString() };
    await storage.write(`${plan.planId}-${effect}-terraform-nlb-outcome.json`, evidence);
    await session.reconcileApplyFromEvidence(prep.receipt, canonicalSha256(evidence));
    return 'completed';
  } finally {
    await release();
  }
}
