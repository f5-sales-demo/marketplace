import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { acquireProcessLock } from '../../../platform/src/ce/process-lock';
import type { PlanReceipt } from '../../../terraform/src/runner';
import type { CeTerraformService } from '../../../terraform/src/service';
import type { AwsExecApi } from '../aws/exec';
import { canonicalSha256 } from './canonical';
import { openAwsTerraformPowerSession } from './terraform-power-session';
import {
  type AwsStaticServiceRevision,
  reviseAwsTerraformStaticServiceRoutes,
  validateAwsTerraformStaticServiceReceipt,
} from './terraform-static-power';
import type { AwsCePlan } from './types';
import { type AwsWholeSitePowerPlan, verifyAwsWholeSitePowerPlan } from './whole-site-power';
import { powerServiceComponentSha256 } from './whole-site-power-service-binding';
import { collectAwsPowerStaticTgwRoutes } from './whole-site-power-tgw';

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
    throw Error('Static TGW owning plan differs');
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
    throw Error('Static TGW original attempt differs');
  return {
    schemaVersion: 1,
    engine: base.engine,
    planSha256: plan.planSha256,
    bindingsSha256: plan.bindingsSha256,
    servicesSha256: powerServiceComponentSha256(base, plan.bindings, 'static-tgw'),
    attempt,
  };
}
type Marker = Awaited<ReturnType<typeof context>>;
interface Preparation {
  marker: Marker;
  source: string;
  revision: AwsStaticServiceRevision;
  receipt?: PlanReceipt;
}
async function retainedWithdrawal(
  base: AwsCePlan,
  plan: AwsWholeSitePowerPlan,
  storage: CeDeploymentStore,
  effect: Effect,
) {
  if (effect !== 'restore') return undefined;
  if (!plan.maintenance) throw Error('Terraform static TGW stopped maintenance missing');
  const id = `aws-ce-power-${plan.maintenance.stopPlanSha256.slice(0, 24)}`;
  const stop = (await storage.read(`${id}.json`)) as AwsWholeSitePowerPlan;
  verifyAwsWholeSitePowerPlan(base, stop);
  if (
    stop.operation !== 'stop' ||
    stop.planSha256 !== plan.maintenance.stopPlanSha256 ||
    stop.transitionId !== plan.transitionId ||
    stop.bindingsSha256 !== plan.bindingsSha256
  )
    throw Error('Terraform static TGW retained stop plan differs');
  const prior = (await storage.read(`${id}-withdraw-terraform-static-tgw-preparation.json`)) as Preparation;
  if (
    prior.marker.planSha256 !== plan.maintenance.stopPlanSha256 ||
    prior.marker.servicesSha256 !== powerServiceComponentSha256(base, plan.bindings, 'static-tgw') ||
    prior.marker.bindingsSha256 !== plan.bindingsSha256 ||
    !prior.receipt
  )
    throw Error('Terraform static TGW retained withdrawal differs');
  const dispatch = await storage.read(`${id}-withdraw-terraform-static-tgw-dispatch.json`);
  const outcome = (await storage.read(`${id}-withdraw-terraform-static-tgw-outcome.json`)) as {
    marker: Marker;
    receipt: PlanReceipt;
    observed: Awaited<ReturnType<typeof collectAwsPowerStaticTgwRoutes>>;
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
    outcome.observed.servicesSha256 !== powerServiceComponentSha256(base, plan.bindings, 'static-tgw') ||
    canonicalSha256(outcome.observed.services) !== powerServiceComponentSha256(base, plan.bindings, 'static-tgw') ||
    canonicalSha256(outcome.applied) !==
      canonicalSha256(
        Object.fromEntries(
          Object.keys(prior.revision.routes).map((name) => [`aws_ec2_transit_gateway_route.${name}`, null]),
        ),
      ) ||
    !Number.isFinite(Date.parse(outcome.collectedAt)) ||
    Date.parse(outcome.collectedAt) > Date.now() ||
    Date.parse(outcome.collectedAt) < Date.parse(prior.marker.attempt.originalAttemptAt)
  )
    throw Error('Terraform static TGW completed withdrawal evidence differs');
  const services = outcome.observed.services;
  if (
    canonicalSha256(reviseAwsTerraformStaticServiceRoutes(base, services, prior.source, 'withdraw')) !==
    canonicalSha256(prior.revision)
  )
    throw Error('Terraform static TGW completed withdrawal revision differs');
  validateAwsTerraformStaticServiceReceipt(
    base,
    services,
    prior.revision,
    prior.receipt,
    ownedFields(services, prior.revision),
    absentFields(prior.revision),
  );
  return prior.revision;
}
function selections(revision: AwsStaticServiceRevision) {
  return Object.fromEntries(
    Object.keys(revision.routes).map((name) => [
      `aws_ec2_transit_gateway_route.${name}`,
      ['destination_cidr_block', 'transit_gateway_attachment_id', 'transit_gateway_route_table_id', 'blackhole'],
    ]),
  );
}
function absentFields(revision: AwsStaticServiceRevision) {
  return Object.fromEntries(Object.keys(selections(revision)).map((address) => [address, null]));
}
function ownedFields(
  services: Awaited<ReturnType<typeof collectAwsPowerStaticTgwRoutes>>['services'],
  revision: AwsStaticServiceRevision,
) {
  return Object.fromEntries(
    Object.entries(revision.routes).map(([name, route]) => [
      `aws_ec2_transit_gateway_route.${name}`,
      {
        destination_cidr_block: route.destination_cidr_block,
        transit_gateway_attachment_id: services.transportAttachmentId,
        transit_gateway_route_table_id: services.routeTableId,
        blackhole: false,
      },
    ]),
  );
}
async function projections(
  session: import('../../../terraform/src/service').TerraformSession,
  receipt: PlanReceipt,
  revision: AwsStaticServiceRevision,
  signal?: AbortSignal,
) {
  return {
    before: await session.readPlannedResourceFields(receipt, selections(revision), process.env, signal),
    after: await session.readProposedResourceFields(receipt, selections(revision), process.env, signal),
  };
}
/** Internal Terraform service adapter. Public gates remain owned by the coordinator. */
export async function dispatchAwsTerraformStaticTgwRoutes(
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
    throw Error('Terraform static TGW engine or authorization differs');
  const release = await acquireProcessLock(`${storage.directory}/.terraform-static-tgw-power-lock`);
  try {
    const marker = await context(base, plan, effect, storage);
    const name = `${plan.planId}-${effect}-terraform-static-tgw-preparation.json`;
    const dispatchName = `${plan.planId}-${effect}-terraform-static-tgw-dispatch.json`;
    const observed = await collectAwsPowerStaticTgwRoutes(base, values, api, signal);
    if (observed.servicesSha256 !== marker.servicesSha256) throw Error('Terraform static TGW service identity differs');
    const session = await openAwsTerraformPowerSession(base, storage, terraform, api, signal);
    let prep = (await optional(storage, name)) as Preparation | undefined;
    const retained = await retainedWithdrawal(base, plan, storage, effect);
    if (prep) {
      if (
        canonicalSha256(prep.marker) !== canonicalSha256(marker) ||
        canonicalSha256(
          reviseAwsTerraformStaticServiceRoutes(base, observed.services, prep.source, effect, retained),
        ) !== canonicalSha256(prep.revision)
      )
        throw Error('Terraform static TGW preparation differs');
      if (prep.receipt && (await session.readPlanApplicationState(prep.receipt)) !== 'planned')
        throw Error('Terraform static TGW already submitted; reconcile original attempt');
    } else {
      if ((await optional(storage, dispatchName)) !== undefined)
        throw Error('Terraform static TGW submission lacks preparation');
      if (!session.readConfigurationSha256) throw Error('Terraform static TGW configuration reader missing');
      const source = await session.readConfiguration(await session.readConfigurationSha256());
      prep = {
        marker,
        source,
        revision: reviseAwsTerraformStaticServiceRoutes(base, observed.services, source, effect, retained),
      };
      await storage.write(name, prep);
    }
    if (observed.status !== (effect === 'withdraw' ? 'active' : 'withdrawn'))
      throw Error('Terraform static TGW prerequisite membership differs');
    if (!session.readConfigurationSha256) throw Error('Terraform static TGW configuration reader missing');
    const current = await session.readConfigurationSha256();
    if (current === prep.revision.beforeSha256) await session.reviseConfiguration(current, prep.revision.configuration);
    else if (current !== prep.revision.afterSha256) throw Error('Terraform static TGW current revision differs');
    if (!prep.receipt) {
      const receipt = await session.plan(process.env, signal);
      const fields = await projections(session, receipt, prep.revision, signal);
      validateAwsTerraformStaticServiceReceipt(
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
    if (!prep.receipt) throw Error('Terraform static TGW receipt missing');
    const fields = await projections(session, prep.receipt, prep.revision, signal);
    validateAwsTerraformStaticServiceReceipt(
      base,
      observed.services,
      prep.revision,
      prep.receipt,
      fields.before,
      fields.after,
    );
    if ((await session.readPlanApplicationState(prep.receipt)) !== 'planned')
      throw Error('Terraform static TGW already submitted');
    const expected = { marker, receipt: prep.receipt };
    const saved = await optional(storage, dispatchName);
    if (saved !== undefined && canonicalSha256(saved) !== canonicalSha256(expected))
      throw Error('Terraform static TGW dispatch marker differs');
    signal?.throwIfAborted();
    await storage.write(dispatchName, expected);
    await session.apply(prep.receipt, process.env, signal);
  } finally {
    await release();
  }
}
export async function reconcileAwsTerraformStaticTgwRoutes(
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
  if (base.engine !== 'terraform') throw Error('Terraform static TGW engine differs');
  const release = await acquireProcessLock(`${storage.directory}/.terraform-static-tgw-power-lock`);
  try {
    const marker = await context(base, plan, effect, storage);
    if (originalAttemptAt !== marker.attempt.originalAttemptAt)
      throw Error('Terraform static TGW original attempt differs');
    const prep = (await optional(storage, `${plan.planId}-${effect}-terraform-static-tgw-preparation.json`)) as
      | Preparation
      | undefined;
    const saved = await optional(storage, `${plan.planId}-${effect}-terraform-static-tgw-dispatch.json`);
    if (!prep?.receipt) {
      if (saved !== undefined) throw Error('Terraform static TGW submission lacks receipt');
      return 'not-submitted';
    }
    if (canonicalSha256(prep.marker) !== canonicalSha256(marker))
      throw Error('Terraform static TGW preparation marker differs');
    const observed = await collectAwsPowerStaticTgwRoutes(base, values, api, signal);
    if (
      observed.servicesSha256 !== marker.servicesSha256 ||
      canonicalSha256(
        reviseAwsTerraformStaticServiceRoutes(
          base,
          observed.services,
          prep.source,
          effect,
          await retainedWithdrawal(base, plan, storage, effect),
        ),
      ) !== canonicalSha256(prep.revision)
    )
      throw Error('Terraform static TGW retained preparation differs');
    const session = await openAwsTerraformPowerSession(base, storage, terraform, api, signal);
    const journal = await session.readPlanApplicationState(prep.receipt);
    if (saved !== undefined && canonicalSha256(saved) !== canonicalSha256({ marker, receipt: prep.receipt }))
      throw Error('Terraform static TGW dispatch marker differs');
    if (journal === 'planned') return 'not-submitted';
    if (saved === undefined) throw Error('Terraform static TGW submitted journal lacks marker');
    const fields = await projections(session, prep.receipt, prep.revision, signal);
    validateAwsTerraformStaticServiceReceipt(
      base,
      observed.services,
      prep.revision,
      prep.receipt,
      fields.before,
      fields.after,
    );
    const applied = await session.readAppliedResourceFields(
      prep.receipt,
      selections(prep.revision),
      process.env,
      signal,
    );
    const owned = ownedFields(observed.services, prep.revision);
    const absent = absentFields(prep.revision);
    if (canonicalSha256(Object.keys(applied).sort()) !== canonicalSha256(Object.keys(owned).sort()))
      throw Error('Terraform static TGW applied identity incomplete');
    for (const address of Object.keys(owned))
      if (applied[address] !== null && canonicalSha256(applied[address]) !== canonicalSha256(owned[address]))
        throw Error('Terraform static TGW applied route identity differs');
    if (canonicalSha256(applied) !== canonicalSha256(effect === 'withdraw' ? absent : owned)) return 'pending';
    if (observed.status !== (effect === 'withdraw' ? 'withdrawn' : 'active')) return 'pending';
    const evidence = { marker, receipt: prep.receipt, observed, applied, collectedAt: new Date().toISOString() };
    await storage.write(`${plan.planId}-${effect}-terraform-static-tgw-outcome.json`, evidence);
    await session.reconcileApplyFromEvidence(prep.receipt, canonicalSha256(evidence));
    return 'completed';
  } finally {
    await release();
  }
}
