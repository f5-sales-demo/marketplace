import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { AwsExecApi } from '../aws/exec';
import { readAwsTrafficProbeEvidence } from './traffic-probe';
import type { AwsCePlan } from './types';
import type { AwsPowerEvidence, AwsPowerGate, AwsWholeSitePowerPlan } from './whole-site-power';
import type { AwsBgpPowerSiteBinding } from './whole-site-power-bgp-services';
import { collectAwsPowerOperational } from './whole-site-power-operational';
import { collectAwsPowerServiceInventory } from './whole-site-power-service-inventory';

/** Collect actual separate gates. Missing traffic or CE freshness cannot become successful power acceptance. */
export async function collectAwsWholeSitePowerEvidence(
  base: AwsCePlan,
  plan: AwsWholeSitePowerPlan,
  gate: AwsPowerGate,
  values: Record<string, string>,
  api: AwsExecApi,
  runtime: CeRuntime,
  signal?: AbortSignal,
  retainedBgp?: AwsBgpPowerSiteBinding[],
  storage?: CeDeploymentStore,
): Promise<AwsPowerEvidence> {
  const operational = await collectAwsPowerOperational(base, plan, values, api, runtime, signal);
  let services: AwsPowerEvidence['services'] = 'unknown';
  try {
    const inventory = await collectAwsPowerServiceInventory(base, values, api, runtime, signal, retainedBgp);
    if (inventory.servicesSha256 === plan.bindings.servicesSha256 && inventory.status !== 'pending')
      services = inventory.status;
  } catch {
    signal?.throwIfAborted();
  }
  let traffic: AwsPowerEvidence['traffic'] = 'unknown';
  if (storage) {
    const receipt = await readAwsTrafficProbeEvidence(base, storage, values);
    if (receipt.status === 'healthy') traffic = 'passing';
  }
  return {
    source: 'live',
    planSha256: plan.planSha256,
    bindingsSha256: plan.bindingsSha256,
    gate,
    identity: operational.identity,
    cloud: operational.cloud,
    registration: operational.registration,
    configuration: operational.configuration,
    versions: operational.versions,
    interfaces: operational.interfaceState,
    canSatisfyInterfaceMutationGate: operational.canSatisfyInterfaceMutationGate,
    services,
    traffic,
    collectedAt: new Date().toISOString(),
  };
}
