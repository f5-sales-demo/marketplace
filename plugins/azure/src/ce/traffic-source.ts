import { isIP } from 'node:net';
import { type AzExecApi, detectAzError } from '../az/exec';
import type { AzureCePlan } from './types';

type Json = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

function object(value: unknown, message: string): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message);
  return value as Json;
}

async function read(api: AzExecApi, args: string[], signal?: AbortSignal): Promise<Json> {
  signal?.throwIfAborted();
  const result = await api.exec('az', [...args, '--output', 'json'], signal ? { signal } : undefined);
  signal?.throwIfAborted();
  if (result.exitCode !== 0) throw detectAzError(result.stderr, result.exitCode);
  try {
    return object(JSON.parse(result.stdout), 'Malformed Azure traffic source observation');
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('Malformed Azure traffic source observation');
    throw error;
  }
}

/** Resolve one reviewed, running Azure VM to its exact attached primary IPv4 address. */
export async function observeAzureTrafficSource(plan: AzureCePlan, api: AzExecApi, signal?: AbortSignal) {
  if (plan.intent.ingress?.mode !== 'platform-http')
    throw new Error('Azure traffic source requires explicit platform HTTP ingress');
  const resourceId = plan.intent.ingress.probe.sourceVmResourceId;
  if (
    !plan.intent.brownfield.resourceIds.some((id) => id.toLowerCase() === resourceId.toLowerCase()) ||
    !plan.ownershipInventory.some(
      (row) =>
        row.resourceId.toLowerCase() === resourceId.toLowerCase() && !row.owned && row.action === 'modify-approved',
    )
  )
    throw new Error('Azure traffic source is outside the reviewed inventory');

  const account = await read(api, ['account', 'show', '--subscription', plan.subscription.id], signal);
  if (
    typeof account.id !== 'string' ||
    account.id.toLowerCase() !== plan.subscription.id.toLowerCase() ||
    typeof account.tenantId !== 'string' ||
    account.tenantId.toLowerCase() !== plan.subscription.tenantId.toLowerCase() ||
    account.environmentName !== plan.subscription.cloud ||
    account.state !== 'Enabled'
  )
    throw new Error('Azure traffic source account differs from the reviewed deployment');

  const vm = await read(
    api,
    ['vm', 'show', '--ids', resourceId, '--show-details', '--subscription', plan.subscription.id],
    signal,
  );
  const profile = object(vm.networkProfile, 'Azure traffic source VM network profile is unavailable');
  const attachments = Array.isArray(profile.networkInterfaces)
    ? profile.networkInterfaces.map((value) => object(value, 'Malformed Azure traffic source VM attachment'))
    : [];
  const primaryAttachments = attachments.filter((attachment) => attachment.primary === true);
  const attachment =
    primaryAttachments.length === 1
      ? primaryAttachments[0]
      : primaryAttachments.length === 0 && attachments.length === 1
        ? attachments[0]
        : undefined;
  const nicResourceId = attachment?.id;
  const powerState = typeof vm.powerState === 'string' ? vm.powerState.toLowerCase().replace(/^vm\s+/, '') : '';
  if (
    typeof vm.id !== 'string' ||
    vm.id.toLowerCase() !== resourceId.toLowerCase() ||
    typeof vm.vmId !== 'string' ||
    !UUID.test(vm.vmId) ||
    typeof vm.location !== 'string' ||
    vm.location.toLowerCase() !== plan.region.toLowerCase() ||
    vm.provisioningState !== 'Succeeded' ||
    powerState !== 'running' ||
    typeof nicResourceId !== 'string' ||
    !nicResourceId.toLowerCase().startsWith(`/subscriptions/${plan.subscription.id}/`.toLowerCase())
  )
    throw new Error('Azure traffic source VM identity or readiness differs');

  const nic = await read(
    api,
    ['network', 'nic', 'show', '--ids', nicResourceId, '--subscription', plan.subscription.id],
    signal,
  );
  const ipConfigurations = Array.isArray(nic.ipConfigurations)
    ? nic.ipConfigurations.map((value) => object(value, 'Malformed Azure traffic source IP configuration'))
    : [];
  const primaryConfigurations = ipConfigurations.filter((configuration) => configuration.primary === true);
  const configuration =
    primaryConfigurations.length === 1
      ? primaryConfigurations[0]
      : primaryConfigurations.length === 0 && ipConfigurations.length === 1
        ? ipConfigurations[0]
        : undefined;
  const privateAddress = configuration?.privateIPAddress;
  const attachedVm = object(nic.virtualMachine, 'Azure traffic source NIC attachment is unavailable').id;
  if (
    typeof nic.id !== 'string' ||
    nic.id.toLowerCase() !== nicResourceId.toLowerCase() ||
    nic.provisioningState !== 'Succeeded' ||
    typeof attachedVm !== 'string' ||
    attachedVm.toLowerCase() !== resourceId.toLowerCase() ||
    configuration?.privateIPAddressVersion !== 'IPv4' ||
    typeof privateAddress !== 'string' ||
    isIP(privateAddress) !== 4
  )
    throw new Error('Azure traffic source NIC identity or private address differs');

  return {
    subscriptionId: plan.subscription.id,
    tenantId: plan.subscription.tenantId,
    cloud: plan.subscription.cloud,
    resourceId,
    vmId: vm.vmId,
    nicResourceId,
    privateAddress,
    source: 'azure-cli-live' as const,
    observedAt: new Date().toISOString(),
  };
}
