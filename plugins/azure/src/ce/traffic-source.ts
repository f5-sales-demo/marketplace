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

/** Sanitized attachment projection; raw VM responses can contain bootstrap secrets. */
export interface AzureTrafficSourceIdentity {
  account: Json;
  vm: Json;
  nic: Json;
}

function fields(value: Json, required: string[], optional: string[] = []) {
  if (
    required.some((key) => !(key in value)) ||
    Object.keys(value).some((key) => !required.includes(key) && !optional.includes(key))
  )
    throw new Error('Azure traffic source identity fields differ');
}

function validateAccount(plan: AzureCePlan, account: Json) {
  if (
    typeof account.id !== 'string' ||
    account.id.toLowerCase() !== plan.subscription.id.toLowerCase() ||
    typeof account.tenantId !== 'string' ||
    account.tenantId.toLowerCase() !== plan.subscription.tenantId.toLowerCase() ||
    account.environmentName !== plan.subscription.cloud ||
    account.state !== 'Enabled'
  )
    throw new Error('Azure traffic source account differs from the reviewed deployment');
}

function validateVm(plan: AzureCePlan, vm: Json) {
  if (plan.intent.ingress?.mode !== 'platform-http')
    throw new Error('Azure traffic source requires explicit platform HTTP ingress');
  const resourceId = plan.intent.ingress.probe.sourceVmResourceId;
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
    !nicResourceId.toLowerCase().startsWith(`/subscriptions/${plan.subscription.id}/`.toLowerCase()) ||
    !/^\/subscriptions\/[^/]+\/resourcegroups\/[^/]+\/providers\/microsoft.network\/networkinterfaces\/[^/]+$/i.test(
      nicResourceId,
    )
  )
    throw new Error('Azure traffic source VM identity or readiness differs');

  return nicResourceId;
}

/** Replay only historical identity joins. Collection time does not establish current readiness. */
export function validateAzureTrafficSourceIdentity(plan: AzureCePlan, identity: unknown) {
  const snapshot = object(identity, 'Malformed Azure traffic source identity');
  fields(snapshot, ['account', 'vm', 'nic']);
  const account = object(snapshot.account, 'Malformed Azure traffic source account');
  const vm = object(snapshot.vm, 'Malformed Azure traffic source VM');
  const nic = object(snapshot.nic, 'Malformed Azure traffic source NIC');
  fields(account, ['id', 'tenantId', 'environmentName', 'state']);
  fields(vm, ['id', 'vmId', 'location', 'provisioningState', 'powerState', 'networkProfile']);
  fields(nic, ['id', 'provisioningState', 'virtualMachine', 'ipConfigurations']);
  const network = object(vm.networkProfile, 'Malformed Azure traffic source network profile');
  fields(network, ['networkInterfaces']);
  if (!Array.isArray(network.networkInterfaces)) throw new Error('Malformed Azure traffic source attachments');
  const attachedIds = new Set<string>();
  for (const raw of network.networkInterfaces) {
    const row = object(raw, 'Malformed Azure traffic source attachment');
    fields(row, ['id'], ['primary']);
    if (
      typeof row.id !== 'string' ||
      attachedIds.has(row.id.toLowerCase()) ||
      (row.primary !== undefined && typeof row.primary !== 'boolean')
    )
      throw new Error('Azure traffic source duplicate or malformed attachment');
    attachedIds.add(row.id.toLowerCase());
  }
  fields(object(nic.virtualMachine, 'Malformed Azure traffic source back reference'), ['id']);
  if (!Array.isArray(nic.ipConfigurations)) throw new Error('Malformed Azure traffic source IP configurations');
  const addresses = new Set<string>();
  for (const raw of nic.ipConfigurations) {
    const row = object(raw, 'Malformed Azure traffic source IP configuration');
    fields(row, ['privateIPAddressVersion', 'privateIPAddress'], ['primary']);
    if (
      typeof row.privateIPAddress !== 'string' ||
      addresses.has(row.privateIPAddress) ||
      (row.primary !== undefined && typeof row.primary !== 'boolean')
    )
      throw new Error('Azure traffic source duplicate or malformed IP configuration');
    addresses.add(row.privateIPAddress);
  }
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

  validateAccount(plan, account);

  const nicResourceId = validateVm(plan, vm);

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
  };
}

function project(value: Json, names: string[]) {
  return Object.fromEntries(names.filter((name) => value[name] !== undefined).map((name) => [name, value[name]]));
}

/** Resolve one reviewed, running Azure VM and retain only replayable attachment identity. */
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
  validateAccount(plan, account);
  const vm = await read(
    api,
    ['vm', 'show', '--ids', resourceId, '--show-details', '--subscription', plan.subscription.id],
    signal,
  );
  const nicId = validateVm(plan, vm);
  const profile = object(vm.networkProfile, 'Azure traffic source VM network profile is unavailable');
  const attachments = (profile.networkInterfaces as unknown[]).map((row) =>
    object(row, 'Malformed Azure traffic source VM attachment'),
  );
  const nic = await read(
    api,
    ['network', 'nic', 'show', '--ids', nicId, '--subscription', plan.subscription.id],
    signal,
  );
  const identity: AzureTrafficSourceIdentity = {
    account: project(account, ['id', 'tenantId', 'environmentName', 'state']),
    vm: {
      ...project(vm, ['id', 'vmId', 'location', 'provisioningState', 'powerState']),
      networkProfile: { networkInterfaces: attachments.map((row) => project(row, ['id', 'primary'])) },
    },
    nic: {
      ...project(nic, ['id', 'provisioningState']),
      virtualMachine: project(object(nic.virtualMachine, 'Azure traffic source NIC attachment is unavailable'), ['id']),
      ipConfigurations: Array.isArray(nic.ipConfigurations)
        ? nic.ipConfigurations.map((row) =>
            project(object(row, 'Malformed Azure traffic source IP configuration'), [
              'primary',
              'privateIPAddressVersion',
              'privateIPAddress',
            ]),
          )
        : [],
    },
  };
  const source = validateAzureTrafficSourceIdentity(plan, identity);
  return { ...source, identity, source: 'azure-cli-live' as const, observedAt: new Date().toISOString() };
}
