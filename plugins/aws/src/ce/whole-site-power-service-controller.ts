import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { acquireProcessLock } from '../../../platform/src/ce/process-lock';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { CeTerraformService } from '../../../terraform/src/service';
import type { AwsExecApi } from '../aws/exec';
import {
  dispatchAwsNativeBgpPower,
  dispatchAwsTerraformBgpPower,
  reconcileAwsNativeBgpPower,
  reconcileAwsTerraformBgpPower,
} from './bgp-power-controller';
import { canonicalSha256 } from './canonical';
import { dispatchAwsNativeDirectRoutes, reconcileAwsNativeDirectRoutes } from './direct-route-power-controller';
import {
  dispatchAwsNativeNlbMembership,
  dispatchAwsTerraformNlbMembership,
  reconcileAwsNativeNlbMembership,
  reconcileAwsTerraformNlbMembership,
} from './nlb-power-controller';
import { dispatchAwsNativeStaticTgwRoutes, reconcileAwsNativeStaticTgwRoutes } from './static-tgw-power-controller';
import {
  dispatchAwsTerraformStaticTgwRoutes,
  reconcileAwsTerraformStaticTgwRoutes,
} from './terraform-static-tgw-power-controller';
import type { AwsCePlan } from './types';
import { type AwsWholeSitePowerPlan, verifyAwsWholeSitePowerPlan } from './whole-site-power';
import type { AwsPowerServiceKind } from './whole-site-power-service-binding';

type Effect = 'withdraw' | 'restore';
type Status = 'completed' | 'pending' | 'not-submitted';
async function components(
  base: AwsCePlan,
  plan: AwsWholeSitePowerPlan,
  effect: Effect,
  at: string,
  storage: CeDeploymentStore,
  terraform?: CeTerraformService,
) {
  verifyAwsWholeSitePowerPlan(base, plan);
  if (
    !plan.bindings.servicesInventory ||
    base.topology.nodeCount !== 1 ||
    plan.operation !== (effect === 'withdraw' ? 'stop' : 'start') ||
    canonicalSha256(storage.owner) !== canonicalSha256(plan.bindings.owner)
  )
    throw Error('Complete owning single-node service plan required');
  await storage.verify();
  if (canonicalSha256(await storage.read(`${plan.planId}.json`)) !== canonicalSha256(plan))
    throw Error('Complete service saved plan differs');
  const checkpoint = (await storage.read(`${plan.planId}-checkpoint.json`)) as {
    schemaVersion: number;
    planSha256: string;
    bindingsSha256: string;
    step: number;
    complete: boolean;
    pending?: { effect: string; originalAttemptAt: string; requestSha256: string };
    attempts?: Record<string, unknown>;
  };
  const attempt = checkpoint.pending;
  if (
    checkpoint.schemaVersion !== 1 ||
    checkpoint.planSha256 !== plan.planSha256 ||
    checkpoint.bindingsSha256 !== plan.bindingsSha256 ||
    checkpoint.step !== (effect === 'withdraw' ? 1 : 3) ||
    checkpoint.complete !== false ||
    !attempt ||
    attempt.effect !== effect ||
    attempt.originalAttemptAt !== at ||
    !Number.isFinite(Date.parse(at)) ||
    Date.parse(at) > Date.now() ||
    attempt.requestSha256 !== canonicalSha256({ planSha256: plan.planSha256, effect }) ||
    canonicalSha256(attempt) !== canonicalSha256(checkpoint.attempts?.[effect])
  )
    throw Error('Complete service original attempt differs');
  const kinds = plan.bindings.servicesInventory.components.map((row) => row.kind);
  if (base.engine === 'terraform' && (kinds.includes('direct') || (kinds.some((k) => k !== 'bgp') && !terraform)))
    throw Error('Terraform service owner is unavailable or direct routing is unqualified');
  return kinds;
}
async function component(
  kind: AwsPowerServiceKind,
  dispatch: boolean,
  base: AwsCePlan,
  plan: AwsWholeSitePowerPlan,
  effect: Effect,
  at: string,
  storage: CeDeploymentStore,
  values: Record<string, string>,
  api: AwsExecApi,
  runtime: CeRuntime,
  signal?: AbortSignal,
  terraform?: CeTerraformService,
): Promise<Status> {
  if (kind === 'bgp') {
    if (dispatch)
      await (base.engine === 'native' ? dispatchAwsNativeBgpPower : dispatchAwsTerraformBgpPower)(
        base,
        plan,
        plan.planSha256,
        effect,
        storage,
        values,
        api,
        runtime,
        signal,
      );
    return (base.engine === 'native' ? reconcileAwsNativeBgpPower : reconcileAwsTerraformBgpPower)(
      base,
      plan,
      effect,
      at,
      storage,
      values,
      api,
      runtime,
      signal,
    );
  }
  if (base.engine === 'native') {
    const submit =
      kind === 'nlb'
        ? dispatchAwsNativeNlbMembership
        : kind === 'direct'
          ? dispatchAwsNativeDirectRoutes
          : dispatchAwsNativeStaticTgwRoutes;
    const reconcile =
      kind === 'nlb'
        ? reconcileAwsNativeNlbMembership
        : kind === 'direct'
          ? reconcileAwsNativeDirectRoutes
          : reconcileAwsNativeStaticTgwRoutes;
    if (dispatch) await submit(base, plan, plan.planSha256, effect, storage, values, api, signal);
    return reconcile(base, plan, effect, at, storage, values, api, signal);
  }
  if (!terraform || kind === 'direct') throw Error('Terraform component is unqualified');
  const submit = kind === 'nlb' ? dispatchAwsTerraformNlbMembership : dispatchAwsTerraformStaticTgwRoutes;
  const reconcile = kind === 'nlb' ? reconcileAwsTerraformNlbMembership : reconcileAwsTerraformStaticTgwRoutes;
  if (dispatch) await submit(base, plan, plan.planSha256, effect, storage, values, api, terraform, signal);
  return reconcile(base, plan, effect, at, storage, values, api, terraform, signal);
}
/** Read-only reconciliation never calls a provider mutation. Mixed progress is pending. */
export async function reconcileAwsPowerServices(
  base: AwsCePlan,
  plan: AwsWholeSitePowerPlan,
  effect: Effect,
  at: string,
  storage: CeDeploymentStore,
  values: Record<string, string>,
  api: AwsExecApi,
  runtime: CeRuntime,
  signal?: AbortSignal,
  terraform?: CeTerraformService,
): Promise<Status> {
  const kinds = await components(base, plan, effect, at, storage, terraform);
  const statuses: Status[] = [];
  for (const kind of kinds)
    statuses.push(
      await component(kind, false, base, plan, effect, at, storage, values, api, runtime, signal, terraform),
    );
  return statuses.every((s) => s === 'completed')
    ? 'completed'
    : statuses.every((s) => s === 'not-submitted')
      ? 'not-submitted'
      : 'pending';
}
/** Internal authorized continuation: reconcile each component before dispatching its unsubmitted original attempt. */
export async function continueAwsPowerServices(
  base: AwsCePlan,
  plan: AwsWholeSitePowerPlan,
  effect: Effect,
  at: string,
  storage: CeDeploymentStore,
  values: Record<string, string>,
  api: AwsExecApi,
  runtime: CeRuntime,
  signal?: AbortSignal,
  terraform?: CeTerraformService,
): Promise<Status> {
  const release = await acquireProcessLock(`${storage.directory}/.power-service-continuation-lock`);
  try {
    const kinds = await components(base, plan, effect, at, storage, terraform);
    for (const kind of kinds) {
      signal?.throwIfAborted();
      let status = await component(
        kind,
        false,
        base,
        plan,
        effect,
        at,
        storage,
        values,
        api,
        runtime,
        signal,
        terraform,
      );
      if (status === 'not-submitted')
        status = await component(kind, true, base, plan, effect, at, storage, values, api, runtime, signal, terraform);
      if (status !== 'completed') return 'pending';
    }
    return 'completed';
  } finally {
    await release();
  }
}
