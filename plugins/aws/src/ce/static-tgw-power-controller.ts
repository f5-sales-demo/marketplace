import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { acquireProcessLock } from '../../../platform/src/ce/process-lock';
import type { AwsExecApi } from '../aws/exec';
import { canonicalSha256 } from './canonical';
import { scopedAwsApi } from './scoped-exec';
import type { AwsCePlan } from './types';
import { type AwsWholeSitePowerPlan, verifyAwsWholeSitePowerPlan } from './whole-site-power';
import { powerServiceComponentSha256 } from './whole-site-power-service-binding';
import { collectAwsPowerStaticTgwRoutes } from './whole-site-power-tgw';

type Effect = 'withdraw' | 'restore';
type RawObservation = Awaited<ReturnType<typeof collectAwsPowerStaticTgwRoutes>>;
function serviceRoutes(services: RawObservation['services']) {
  return services.destinationCidrs.map((destinationCidr) => ({
    routeTableId: services.routeTableId,
    destinationCidr,
    transportAttachmentId: services.transportAttachmentId,
  }));
}
type Observation = RawObservation;
type Route = ReturnType<typeof serviceRoutes>[number];
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
    base.engine !== 'native' ||
    plan.operation !== (effect === 'withdraw' ? 'stop' : 'start') ||
    canonicalSha256(storage.owner) !== canonicalSha256(plan.bindings.owner) ||
    canonicalSha256(await storage.read(`${plan.planId}.json`)) !== canonicalSha256(plan)
  )
    throw Error('Native static TGW route owner or plan differs');
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
    canonicalSha256(cp.attempts?.[effect]) !== canonicalSha256(attempt) ||
    !Number.isFinite(Date.parse(attempt.originalAttemptAt)) ||
    Date.parse(attempt.originalAttemptAt) > Date.now()
  )
    throw Error('Native static TGW route original attempt differs');
  return {
    schemaVersion: 1,
    engine: 'native',
    planSha256: plan.planSha256,
    bindingsSha256: plan.bindingsSha256,
    servicesSha256: powerServiceComponentSha256(base, plan.bindings, 'static-tgw'),
    attempt,
  };
}
type Marker = Awaited<ReturnType<typeof context>>;
interface Dispatch {
  marker: Marker;
  services: Observation['services'];
  route: Route;
}
async function observe(
  base: AwsCePlan,
  plan: AwsWholeSitePowerPlan,
  values: Record<string, string>,
  api: AwsExecApi,
  signal?: AbortSignal,
) {
  const observed = await collectAwsPowerStaticTgwRoutes(base, values, api, signal);
  if (observed.servicesSha256 !== powerServiceComponentSha256(base, plan.bindings, 'static-tgw'))
    throw Error('Native static TGW route service identity differs');
  return observed;
}
async function retainedStop(base: AwsCePlan, plan: AwsWholeSitePowerPlan, storage: CeDeploymentStore) {
  if (!plan.maintenance) throw Error('Native static TGW route maintenance missing');
  const id = `aws-ce-power-${plan.maintenance.stopPlanSha256.slice(0, 24)}`;
  const stop = (await storage.read(`${id}.json`)) as AwsWholeSitePowerPlan;
  verifyAwsWholeSitePowerPlan(base, stop);
  const outcome = (await storage.read(`${id}-withdraw-native-static-tgw-outcome.json`)) as {
    marker: Marker;
    observed: Observation;
  };
  if (
    stop.operation !== 'stop' ||
    stop.planSha256 !== plan.maintenance.stopPlanSha256 ||
    stop.transitionId !== plan.transitionId ||
    stop.bindingsSha256 !== plan.bindingsSha256 ||
    outcome.marker.planSha256 !== stop.planSha256 ||
    outcome.marker.bindingsSha256 !== stop.bindingsSha256 ||
    outcome.marker.attempt.effect !== 'withdraw' ||
    outcome.observed.status !== 'withdrawn' ||
    outcome.observed.servicesSha256 !== powerServiceComponentSha256(base, plan.bindings, 'static-tgw') ||
    canonicalSha256(outcome.observed.services) !== powerServiceComponentSha256(base, plan.bindings, 'static-tgw')
  )
    throw Error('Native static TGW route completed withdrawal differs');
  for (const [index, route] of serviceRoutes(outcome.observed.services).entries()) {
    const saved = (await storage.read(`${id}-withdraw-native-static-tgw-${index}-dispatch.json`)) as Dispatch;
    if (
      canonicalSha256(saved.marker) !== canonicalSha256(outcome.marker) ||
      canonicalSha256(saved.services) !== powerServiceComponentSha256(base, plan.bindings, 'static-tgw') ||
      canonicalSha256(saved.route) !== canonicalSha256(route)
    )
      throw Error('Native static TGW route retained dispatch differs');
  }
}
/** Internal adapter. Each route has its own pre-call marker; ambiguous calls are observed and never replayed. */
export async function dispatchAwsNativeStaticTgwRoutes(
  base: AwsCePlan,
  plan: AwsWholeSitePowerPlan,
  authorization: string,
  effect: Effect,
  storage: CeDeploymentStore,
  values: Record<string, string>,
  api: AwsExecApi,
  signal?: AbortSignal,
): Promise<void> {
  if (authorization !== plan.planSha256) throw Error('Native static TGW route authorization differs');
  const release = await acquireProcessLock(`${storage.directory}/.native-static-tgw-lock`);
  try {
    const marker = await context(base, plan, effect, storage);
    const observed = await observe(base, plan, values, api, signal);
    if (effect === 'restore') await retainedStop(base, plan, storage);
    for (const [index, route] of serviceRoutes(observed.services).entries()) {
      const name = `${plan.planId}-${effect}-native-static-tgw-${index}-dispatch.json`;
      const expected = { marker, services: observed.services, route };
      const saved = await optional(storage, name);
      if (saved !== undefined) {
        if (canonicalSha256(saved) !== canonicalSha256(expected))
          throw Error('Native static TGW route dispatch marker differs');
        const current = await routeState(base, plan, values, api, route, signal);
        if (current !== (effect === 'withdraw' ? 'withdrawn' : 'active'))
          throw Error('Native static TGW route submitted attempt pending; reconcile');
        continue;
      }
      const current = await routeState(base, plan, values, api, route, signal);
      if (current !== (effect === 'withdraw' ? 'active' : 'withdrawn'))
        throw Error('Native static TGW route prerequisite differs');
      signal?.throwIfAborted();
      await storage.write(name, expected);
      const result = await scopedAwsApi(api, base.intent.awsProfile ?? 'default', signal).exec('aws', [
        'ec2',
        effect === 'withdraw' ? 'delete-transit-gateway-route' : 'create-transit-gateway-route',
        '--transit-gateway-route-table-id',
        route.routeTableId,
        '--destination-cidr-block',
        route.destinationCidr,
        ...(effect === 'restore' ? ['--transit-gateway-attachment-id', route.transportAttachmentId] : []),
        '--region',
        base.region,
        '--output',
        'json',
      ]);
      if (result.exitCode) throw Error('Native static TGW route submission failed; reconcile original attempt');
      const ack = JSON.parse(result.stdout || '{}') as { Route?: Record<string, unknown> };
      if (
        !ack ||
        typeof ack !== 'object' ||
        Array.isArray(ack) ||
        Object.keys(ack).join(',') !== 'Route' ||
        !ack.Route ||
        typeof ack.Route !== 'object' ||
        Array.isArray(ack.Route) ||
        ack.Route.DestinationCidrBlock !== route.destinationCidr ||
        ack.Route.Type !== 'static'
      )
        throw Error('Native static TGW route acknowledgement malformed');
    }
  } finally {
    await release();
  }
}
async function routeState(
  base: AwsCePlan,
  plan: AwsWholeSitePowerPlan,
  values: Record<string, string>,
  api: AwsExecApi,
  route: Route,
  signal?: AbortSignal,
) {
  const observed = await observe(base, plan, values, api, signal);
  const matches = observed.memberships.filter((r) => r.destinationCidr === route.destinationCidr);
  if (matches.length !== 1) throw Error('Native static TGW route inventory incomplete');
  return matches[0].status;
}
export async function reconcileAwsNativeStaticTgwRoutes(
  base: AwsCePlan,
  plan: AwsWholeSitePowerPlan,
  effect: Effect,
  originalAttemptAt: string,
  storage: CeDeploymentStore,
  values: Record<string, string>,
  api: AwsExecApi,
  signal?: AbortSignal,
): Promise<'completed' | 'pending' | 'not-submitted'> {
  const release = await acquireProcessLock(`${storage.directory}/.native-static-tgw-lock`);
  try {
    const marker = await context(base, plan, effect, storage);
    if (originalAttemptAt !== marker.attempt.originalAttemptAt)
      throw Error('Native static TGW route original attempt differs');
    if (effect === 'restore') await retainedStop(base, plan, storage);
    const observed = await observe(base, plan, values, api, signal);
    let missing = false;
    let submittedPending = false;
    for (const [index, route] of serviceRoutes(observed.services).entries()) {
      const saved = await optional(storage, `${plan.planId}-${effect}-native-static-tgw-${index}-dispatch.json`);
      if (saved === undefined) {
        missing = true;
        continue;
      }

      if (canonicalSha256(saved) !== canonicalSha256({ marker, services: observed.services, route }))
        throw Error('Native static TGW route dispatch marker differs');
      if (
        (await routeState(base, plan, values, api, route, signal)) !== (effect === 'withdraw' ? 'withdrawn' : 'active')
      )
        submittedPending = true;
    }
    if (missing) return submittedPending ? 'pending' : 'not-submitted';
    if (observed.status !== (effect === 'withdraw' ? 'withdrawn' : 'active')) return 'pending';
    await storage.write(`${plan.planId}-${effect}-native-static-tgw-outcome.json`, { marker, observed });
    return 'completed';
  } finally {
    await release();
  }
}
