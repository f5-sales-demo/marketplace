import type { AzExecApi } from '../az/exec';
import type { AzureCePlan } from './types';

/** No caller health claims are admitted. The current published Azure operational semantics are unavailable. */
export async function observeAzureHealth(
  plan: AzureCePlan,
  node: number,
  api: AzExecApi,
  environment: Record<string, string | undefined>,
) {
  const hostname = `${plan.deploymentName}-${node}`;
  const vm = await api.exec('az', [
    'vm',
    'show',
    '--resource-group',
    plan.intent.resourceGroup,
    '--name',
    hostname,
    '--subscription',
    plan.subscription.id,
    '--output',
    'json',
  ]);
  if (vm.exitCode !== 0) return { status: 'unknown', reason: 'Azure VM observation unavailable' };
  let actual: any;
  try {
    actual = JSON.parse(vm.stdout);
  } catch {
    return { status: 'unknown', reason: 'Azure VM observation malformed' };
  }
  const expectedId = `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Compute/virtualMachines/${hostname}`;
  if (
    actual.id?.toLowerCase() !== expectedId.toLowerCase() ||
    !actual.vmId ||
    actual.tags?.['xcsh-deployment-id'] !== plan.deploymentName
  )
    return { status: 'unknown', reason: 'Azure VM identity differs' };
  // Registration visibility alone cannot establish service/process or site health.
  if (!environment.XCSH_API_URL || !environment.XCSH_API_TOKEN)
    return { status: 'unknown', reason: 'F5 context unavailable' };
  return {
    status: 'unknown',
    instanceId: actual.vmId,
    hostname,
    reason: 'Published Azure operational-health mapping is unavailable; use separate registration observation',
  };
}
