import { isIP } from 'node:net';
import type { AzExecApi } from '../az/exec';
import type { AzureCePlan } from './types';

export async function resolveInterfaceAddress(
  api: AzExecApi,
  plan: AzureCePlan,
  node: number,
  role: 'slo' | 'sli',
): Promise<string> {
  const interfaces = plan.nics.filter((nic) => nic.role === role);
  if (interfaces.length !== 1) throw new Error('CE interface role is missing or ambiguous');
  const iface = interfaces[0];
  const nics = plan.actions.filter((action) => action.kind === 'nic-create' && action.node === node);
  const nic = nics.find((action) => {
    const nameIndex = action.args?.indexOf('--name') ?? -1;
    return nameIndex >= 0 && action.args?.[nameIndex + 1]?.endsWith(`-nic${iface.index}`);
  });
  const vms = plan.actions.filter((action) => action.kind === 'vm-create' && action.node === node);
  if (!nic?.resourceId || vms.length !== 1 || !vms[0].resourceId)
    throw new Error('Planned NIC and VM identities are unavailable');
  const vmId = vms[0].resourceId;
  const scope = `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/`.toLowerCase();
  for (const id of [nic.resourceId, vmId])
    if (!id.toLowerCase().startsWith(scope)) throw new Error('Planned interface is outside deployment scope');
  const read = async (kind: 'nic' | 'vm', id: string) => {
    const result = await api.exec('az', [
      ...(kind === 'nic' ? ['network', 'nic'] : ['vm']),
      'show',
      '--ids',
      id,
      '--subscription',
      plan.subscription.id,
      '--output',
      'json',
    ]);
    if (result.exitCode !== 0) throw new Error('CE interface observation unavailable');
    let value: {
      id?: string;
      nextLink?: string;
      provisioningState?: string;
      tags?: Record<string, string>;
      virtualMachine?: { id?: string };
      macAddress?: string;
      networkProfile?: { networkInterfaces?: Array<{ id?: string }> };
      ipConfigurations?: Array<{
        primary?: boolean;
        privateIPAddressVersion?: string;
        privateIPAddress?: string;
        subnet?: { id?: string };
      }>;
    };
    try {
      value = JSON.parse(result.stdout);
    } catch {
      throw new Error('Malformed CE interface observation');
    }
    if (
      !value ||
      value.id?.toLowerCase() !== id.toLowerCase() ||
      value.nextLink ||
      value.provisioningState !== 'Succeeded'
    )
      throw new Error('CE resource identity or readiness does not match');
    if (
      value.tags?.['xcsh-managed-by'] !== 'azure-ce' ||
      value.tags?.['xcsh-deployment-id'] !== plan.deploymentName ||
      value.tags?.['xcsh-plan-sha256'] !== plan.planSha256
    )
      throw new Error('CE interface ownership does not match');
    return value;
  };
  const observed = await read('nic', nic.resourceId);
  const vm = await read('vm', vmId);
  if (
    observed.virtualMachine?.id?.toLowerCase() !== vmId.toLowerCase() ||
    !/^(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i.test(observed.macAddress ?? '')
  )
    throw new Error('CE NIC attachment or MAC is unavailable');
  const attachments = vm.networkProfile?.networkInterfaces;
  if (
    !Array.isArray(attachments) ||
    attachments.filter((entry: { id?: string }) => entry.id?.toLowerCase() === nic.resourceId?.toLowerCase()).length !==
      1
  )
    throw new Error('VM does not uniquely reference the planned NIC');
  const configs = observed.ipConfigurations;
  if (!Array.isArray(configs)) throw new Error('CE IP configurations unavailable');
  const primary = configs.filter(
    (config) => config.primary === true || (configs.length === 1 && config.primary === undefined),
  );
  if (
    primary.length !== 1 ||
    primary[0].privateIPAddressVersion !== 'IPv4' ||
    isIP(primary[0].privateIPAddress ?? '') !== 4
  )
    throw new Error('CE primary IPv4 address is missing or ambiguous');
  if (iface.subnet.resourceId && primary[0].subnet?.id?.toLowerCase() !== iface.subnet.resourceId.toLowerCase())
    throw new Error('CE subnet identity does not match');
  return primary[0].privateIPAddress ?? '';
}
