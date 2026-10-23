import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { CeTerraformService } from '../../../terraform/src/service';
import type { AwsExecApi } from '../aws/exec';
import { retireAwsNativeBgpPowerPolicy, retireAwsTerraformBgpPowerPolicy } from './bgp-power-controller';
import { canonicalSha256 } from './canonical';
import { dispatchAwsNativePowerState, reconcileAwsNativePowerState } from './native-whole-site-power';
import { dispatchAwsTerraformPowerState, reconcileAwsTerraformPowerState } from './terraform-power-controller';
import type { AwsCePlan } from './types';
import {
  type AwsWholeSitePowerDriver,
  type AwsWholeSitePowerPlan,
  evidencePasses,
  verifyAwsWholeSitePowerPlan,
} from './whole-site-power';
import type { AwsBgpPowerSiteBinding } from './whole-site-power-bgp-services';
import { collectAwsPowerBindings } from './whole-site-power-bindings';
import { collectAwsWholeSitePowerEvidence } from './whole-site-power-evidence';
import { continueAwsPowerServices, reconcileAwsPowerServices } from './whole-site-power-service-controller';

/** Owning driver uses actual collectors; current unqualified CE freshness leaves mutation gates pending. */
export function createAwsWholeSitePowerDriver(
  base: AwsCePlan,
  boundPlan: AwsWholeSitePowerPlan,
  values: Record<string, string>,
  storage: CeDeploymentStore,
  api: AwsExecApi,
  runtime: CeRuntime,
  terraform?: CeTerraformService,
): AwsWholeSitePowerDriver {
  verifyAwsWholeSitePowerPlan(base, boundPlan);
  const inventory = boundPlan.bindings.servicesInventory;
  if (!inventory) throw Error('Owning power driver requires complete service inventory');
  if (base.engine === 'terraform' && !terraform) throw Error('Terraform power owner unavailable');
  const bgp = inventory.components.find((row) => row.kind === 'bgp');
  const retained = bgp ? (bgp.services as { platform: AwsBgpPowerSiteBinding[] }).platform : undefined;
  const assertPlan = (plan: AwsWholeSitePowerPlan) => {
    verifyAwsWholeSitePowerPlan(base, plan);
    if (canonicalSha256(plan) !== canonicalSha256(boundPlan)) throw Error('Owning power driver plan differs');
  };
  const observe = (
    plan: AwsWholeSitePowerPlan,
    gate: Parameters<AwsWholeSitePowerDriver['observe']>[1],
    signal?: AbortSignal,
  ) => {
    assertPlan(plan);
    return collectAwsWholeSitePowerEvidence(base, plan, gate, values, api, runtime, signal, retained, storage);
  };
  const attempt = async (plan: AwsWholeSitePowerPlan, effect: string) => {
    const checkpoint = (await storage.read(`${plan.planId}-checkpoint.json`)) as {
      pending?: { effect: string; originalAttemptAt: string };
    };
    if (checkpoint.pending?.effect !== effect) throw Error('Owning power driver original attempt missing');
    return checkpoint.pending.originalAttemptAt;
  };
  const restored = async (plan: AwsWholeSitePowerPlan, signal?: AbortSignal) => {
    const evidence = await observe(plan, 'restored', signal);
    await storage.write(`${plan.planId}-restored-last-evidence.json`, evidence);
    if (!evidencePasses(plan, 'restored', evidence, Date.now())) throw Error('Current restored power gate unavailable');
  };
  const releasePolicy = async (plan: AwsWholeSitePowerPlan, signal?: AbortSignal) => {
    if (!bgp) return 'completed' as const;
    await restored(plan, signal);
    return (base.engine === 'native' ? retireAwsNativeBgpPowerPolicy : retireAwsTerraformBgpPowerPolicy)(
      base,
      plan,
      plan.planSha256,
      storage,
      values,
      api,
      runtime,
      signal,
    );
  };
  return {
    engine: base.engine,
    readBindings: async (signal) =>
      (await collectAwsPowerBindings(base, values, api, runtime, signal, retained)).bindings,
    observe,
    execute: async (plan, effect, signal) => {
      assertPlan(plan);
      const gate =
        effect === 'withdraw'
          ? 'ready-to-stop'
          : effect === 'restore'
            ? 'running'
            : effect === 'stop'
              ? 'withdrawn'
              : effect === 'start'
                ? 'ready-to-start'
                : 'restored';
      const prerequisite = await observe(plan, gate, signal);
      if (!evidencePasses(plan, gate, prerequisite, Date.now()))
        throw Error(`Owning driver current ${gate} prerequisite unavailable`);
      if (effect === 'withdraw' || effect === 'restore') {
        await continueAwsPowerServices(
          base,
          plan,
          effect,
          await attempt(plan, effect),
          storage,
          values,
          api,
          runtime,
          signal,
          terraform,
        );
      } else if (effect === 'release') {
        if ((await releasePolicy(plan, signal)) !== 'completed') return;
        if (base.engine === 'terraform' && terraform)
          await dispatchAwsTerraformPowerState(
            base,
            plan,
            plan.planSha256,
            effect,
            storage,
            terraform,
            api,
            runtime,
            signal,
          );
        else await restored(plan, signal);
      } else if (base.engine === 'terraform' && terraform)
        await dispatchAwsTerraformPowerState(
          base,
          plan,
          plan.planSha256,
          effect,
          storage,
          terraform,
          api,
          runtime,
          signal,
        );
      else await dispatchAwsNativePowerState(base, plan, plan.planSha256, effect, storage, api, runtime, signal);
    },
    reconcile: async (plan, effect, at, signal) => {
      assertPlan(plan);
      if ((await attempt(plan, effect)) !== at) throw Error('Owning driver original attempt differs');
      if (effect === 'withdraw' || effect === 'restore') {
        const status = await reconcileAwsPowerServices(
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
        if (status !== 'pending') return status;
        // A partially completed membership cannot satisfy the original fully active prerequisite.
        // Continue only after current qualified operation/hardware evidence is established.
        const current = await observe(plan, effect === 'withdraw' ? 'ready-to-stop' : 'running', signal);
        if (
          current.identity !== 'verified' ||
          current.cloud !== 'running' ||
          current.registration !== 'healthy' ||
          current.configuration !== 'verified' ||
          current.versions !== 'stable' ||
          current.interfaces !== 'up' ||
          !current.canSatisfyInterfaceMutationGate
        )
          return 'pending';
        return continueAwsPowerServices(base, plan, effect, at, storage, values, api, runtime, signal, terraform);
      }
      if (effect === 'release') {
        if ((await releasePolicy(plan, signal)) !== 'completed') return 'pending';
        if (base.engine === 'native') {
          await restored(plan, signal);
          return 'completed';
        }
      }
      if (base.engine === 'terraform' && terraform)
        return reconcileAwsTerraformPowerState(base, plan, effect, at, storage, terraform, api, runtime, signal);
      if (effect === 'release') throw Error('Power release owner unavailable');
      return reconcileAwsNativePowerState(base, plan, effect, at, storage, api, runtime, signal);
    },
    finish: async (plan, signal) => {
      assertPlan(plan);
      await restored(plan, signal);
      const current = await collectAwsPowerBindings(base, values, api, runtime, signal, retained);
      if (canonicalSha256(current.bindings) !== plan.bindingsSha256 || current.status !== 'active')
        throw Error('Final owning power bindings changed');
      if (base.engine === 'terraform') {
        const complete = (await storage.read(`${plan.planId}-release-terraform-complete.json`)) as {
          marker?: { planSha256: string; bindingsSha256: string };
          receipt?: { noChanges: boolean };
        };
        if (
          complete.marker?.planSha256 !== plan.planSha256 ||
          complete.marker?.bindingsSha256 !== plan.bindingsSha256 ||
          complete.receipt?.noChanges !== true
        )
          throw Error('Final Terraform release verification missing');
      }
      return { engine: base.engine, noChanges: true };
    },
  };
}
