import type { CeRuntime, SiteBinding } from '../../../platform/src/ce/runtime';
import type { AzureCePlan } from './types';

export async function collectAzurePlatformHealth(
  plan: AzureCePlan,
  vms: unknown,
  runtime: Pick<CeRuntime, 'observeHealth' | 'observeRegistrations'>,
  signal?: AbortSignal,
) {
  const base = {
    planId: plan.planId,
    engine: plan.engine,
    subscriptionId: plan.subscription.id,
    siteName: plan.siteName,
    observedAt: new Date().toISOString(),
    scope: 'site-global-and-registration-only',
    nodeHealth: 'unknown',
    bgp: 'unknown',
    routes: 'unknown',
    traffic: 'unknown',
  };
  if (!Array.isArray(vms))
    return {
      ...base,
      status: 'unknown',
      reason: 'cloud-inventory-unavailable',
    };
  const scope =
    `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Compute/virtualMachines/`.toLowerCase();
  const instances: Record<string, string> = {};
  const used = new Set<string>();
  for (let node = 1; node <= plan.topology.nodeCount; node++) {
    const name = `${plan.deploymentName}-${node}`;
    const matches = vms.filter(
      (vm) => vm && typeof vm.id === 'string' && vm.id.toLowerCase() === scope + name.toLowerCase(),
    );
    if (matches.length !== 1)
      return {
        ...base,
        status: 'unknown',
        reason: 'cloud-node-identity-ambiguous',
      };
    const vm = matches[0];
    if (
      vm.name !== name ||
      typeof vm.location !== 'string' ||
      vm.location.toLowerCase() !== plan.region.toLowerCase() ||
      vm.tags?.['xcsh-managed-by'] !== 'azure-ce' ||
      vm.tags?.['xcsh-deployment-id'] !== plan.deploymentName ||
      vm.tags?.['xcsh-execution-engine'] !== plan.engine ||
      typeof vm.vmId !== 'string' ||
      !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(vm.vmId) ||
      used.has(vm.vmId.toLowerCase())
    )
      return {
        ...base,
        status: 'unknown',
        reason: 'cloud-node-binding-incomplete',
      };
    used.add(vm.vmId.toLowerCase());
    instances[name] = vm.vmId;
  }
  const binding: SiteBinding = {
    owner: {
      deploymentId: plan.deploymentName,
      engine: plan.engine,
      provider: 'azure',
      account: plan.subscription.id,
      region: plan.region,
    },
    siteName: plan.siteName,
    nodes: Object.keys(instances),
  };
  try {
    const [health, registrations] = await Promise.all([
      runtime.observeHealth(binding, signal),
      runtime.observeRegistrations(binding, instances, signal),
    ]);
    const values = [health.status, registrations.status];
    const status = values.every((value) => value === 'healthy')
      ? 'healthy'
      : values.some((value) => !['healthy', 'degraded'].includes(String(value)))
        ? 'unknown'
        : 'degraded';
    return { ...base, status, health, registrations };
  } catch (error) {
    if (signal?.aborted) throw error;
    return {
      ...base,
      status: 'unknown',
      reason: 'platform-observation-unavailable',
    };
  }
}
