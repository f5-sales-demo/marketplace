import type { AzExecApi } from '../az/exec';
import { type NodeIdentity, observeOriginalNode } from './node-admission';
import type { AzureCePlan } from './types';

/** Uses measured cloud identity and F5 registration/provisioning for controlled probe admission. */
export async function observeAzureHealth(
  plan: AzureCePlan,
  node: number,
  api: AzExecApi,
  environment: Record<string, string | undefined>,
  observe: (
    expected: NodeIdentity,
    env: Record<string, string | undefined>,
  ) => Promise<Record<string, any>> = observeOriginalNode,
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
    typeof actual.vmId !== 'string' ||
    !actual.vmId ||
    actual.tags?.['xcsh-deployment-id'] !== plan.deploymentName ||
    actual.tags?.['xcsh-managed-by'] !== 'azure-ce'
  )
    return { status: 'unknown', reason: 'Azure VM identity differs' };
  if (actual.provisioningState !== 'Succeeded')
    return { status: 'not-ready', reason: 'Azure VM provisioning has not converged' };
  const nicId = `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Network/networkInterfaces/${hostname}-nic0`;
  const attached = actual.networkProfile?.networkInterfaces;
  if (
    plan.nics.length !== 1 ||
    !Array.isArray(attached) ||
    attached.length !== 1 ||
    attached[0].id?.toLowerCase() !== nicId.toLowerCase()
  )
    return { status: 'unknown', reason: 'Original Azure SLO NIC attachment differs' };
  const nic = await api.exec('az', [
    'network',
    'nic',
    'show',
    '--ids',
    nicId,
    '--subscription',
    plan.subscription.id,
    '--output',
    'json',
  ]);
  if (nic.exitCode !== 0) return { status: 'unknown', reason: 'Original Azure NIC observation unavailable' };
  let physical: any;
  try {
    physical = JSON.parse(nic.stdout);
  } catch {
    return { status: 'unknown', reason: 'Original Azure NIC observation malformed' };
  }
  const mac = String(physical.macAddress ?? '')
    .replaceAll('-', ':')
    .toLowerCase();
  if (
    physical.id?.toLowerCase() !== nicId.toLowerCase() ||
    physical.virtualMachine?.id?.toLowerCase() !== expectedId.toLowerCase() ||
    !/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(mac) ||
    physical.tags?.['xcsh-deployment-id'] !== plan.deploymentName
  )
    return { status: 'unknown', reason: 'Original Azure NIC identity differs' };
  // Complete internal-service health remains separate from registration/provisioning.
  if (!environment.XCSH_API_URL || !environment.XCSH_API_TOKEN)
    return { status: 'unknown', reason: 'F5 context unavailable' };
  try {
    return await observe({ siteName: plan.siteName, hostname, instanceId: actual.vmId, mac }, environment);
  } catch {
    return { status: 'unknown', reason: 'Original-node F5 observation or schema verification unavailable' };
  }
}
