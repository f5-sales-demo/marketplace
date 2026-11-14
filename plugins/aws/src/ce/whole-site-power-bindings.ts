import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { AwsExecApi } from '../aws/exec';
import { canonicalSha256 } from './canonical';
import type { AwsCePlan } from './types';
import type { AwsPowerBindings } from './whole-site-power';
import type { AwsBgpPowerSiteBinding } from './whole-site-power-bgp-services';
import { collectAwsPowerIdentities } from './whole-site-power-identities';
import { validatePowerServiceInventory } from './whole-site-power-service-binding';
import { collectAwsPowerServiceInventory } from './whole-site-power-service-inventory';

/** Read-only complete bindings; observations never grant mutation or heartbeat freshness. */
export async function collectAwsPowerBindings(
  base: AwsCePlan,
  values: Record<string, string>,
  api: AwsExecApi,
  runtime: CeRuntime,
  signal?: AbortSignal,
  retainedBgp?: AwsBgpPowerSiteBinding[],
) {
  const before = await collectAwsPowerIdentities(base, values, api, runtime, signal);
  const inventory = await collectAwsPowerServiceInventory(base, values, api, runtime, signal, retainedBgp);
  const after = await collectAwsPowerIdentities(base, values, api, runtime, signal);
  if (
    canonicalSha256({ owner: before.owner, nodes: before.nodes }) !==
    canonicalSha256({ owner: after.owner, nodes: after.nodes })
  )
    throw Error('Whole-site identities changed during service collection');
  const bindings: AwsPowerBindings = {
    sourcePlanSha256: base.planSha256,
    owner: after.owner,
    nodes: after.nodes,
    servicesSha256: inventory.servicesSha256,
    servicesInventory: inventory.services,
  };
  validatePowerServiceInventory(base, bindings);
  return {
    bindings,
    bgpBindings: inventory.bgpBindings,
    components: inventory.components,
    cloud: after.cloud,
    status: inventory.status,
    freshness: 'unqualified' as const,
    traffic: 'unknown' as const,
    canSatisfyInterfaceMutationGate: false as const,
    collectedAt: new Date().toISOString(),
  };
}
