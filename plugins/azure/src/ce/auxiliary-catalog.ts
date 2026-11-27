import type { AzExecApi } from '../az/exec';
import { verifyAzureCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import { type AzureRelayResolvedCatalog, resolveAzureRelayCatalog } from './relay-catalog';
import type { AzureCePlan } from './types';
import { resolveAzureWorkloadCatalog } from './workload-plan';

const identity = (catalog: AzureRelayResolvedCatalog) => ({
  region: catalog.region,
  image: catalog.image,
  vmSizes: catalog.vmSizes,
});

/** Refresh only auxiliary image/SKU identity. Catalog collector time does not qualify CE heartbeat freshness. */
export async function revalidateAzureAuxiliaryCatalogs(plan: AzureCePlan, api: AzExecApi, signal?: AbortSignal) {
  signal?.throwIfAborted();
  verifyAzureCePlan(plan);
  const evidence: Array<{ kind: 'workload' | 'relay'; catalog: AzureRelayResolvedCatalog }> = [];
  const compare = (
    kind: 'workload' | 'relay',
    saved: AzureRelayResolvedCatalog,
    current: AzureRelayResolvedCatalog,
  ) => {
    if (canonicalSha256(identity(saved)) !== canonicalSha256(identity(current)))
      throw Error(`Azure auxiliary preflight: saved ${kind} catalog identity or eligibility changed; replan required`);
    evidence.push({ kind, catalog: current });
  };
  if (plan.workloadProfile)
    compare('workload', plan.workloadProfile.catalog, await resolveAzureWorkloadCatalog(plan, api, signal));
  if (plan.relayProfile)
    compare(
      'relay',
      plan.relayProfile.catalog,
      await resolveAzureRelayCatalog(plan, plan.relayProfile.selection, api, signal),
    );
  signal?.throwIfAborted();
  return evidence;
}
