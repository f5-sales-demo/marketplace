import { type AzExecApi, detectAzError } from '../az/exec';
import type { AzureCePlan } from './types';

type Json = Record<string, unknown>;
function object(value: unknown, message: string): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message);
  return value as Json;
}
function fields(value: Json, required: string[], optional: string[] = []) {
  if (
    required.some((key) => !(key in value)) ||
    Object.keys(value).some((key) => !required.includes(key) && !optional.includes(key))
  )
    throw new Error('Azure ingress identity fields differ');
}
async function read(api: AzExecApi, args: string[], signal?: AbortSignal): Promise<Json> {
  signal?.throwIfAborted();
  const result = await api.exec('az', [...args, '--output', 'json'], signal ? { signal } : undefined);
  signal?.throwIfAborted();
  if (result.exitCode !== 0) throw detectAzError(result.stderr, result.exitCode);
  try {
    return object(JSON.parse(result.stdout), 'Malformed Azure CE ingress identity observation');
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('Malformed Azure CE ingress identity observation');
    throw error;
  }
}

export interface AzureIngressInterfaceIdentity {
  vm: Json;
  nic: Json;
}
export function validateAzureIngressInterfaceIdentity(plan: AzureCePlan, value: unknown) {
  const identity = object(value, 'Malformed Azure ingress identity');
  fields(identity, ['vm', 'nic']);
  const vm = object(identity.vm, 'Malformed Azure ingress VM');
  const nic = object(identity.nic, 'Malformed Azure ingress NIC');
  fields(vm, ['id', 'provisioningState', 'tags', 'networkProfile']);
  fields(nic, ['id', 'provisioningState', 'tags', 'macAddress', 'virtualMachine']);
  for (const tags of [vm.tags, nic.tags])
    fields(object(tags, 'Malformed Azure ingress owner'), [
      'xcsh-plan-sha256',
      'xcsh-managed-by',
      'xcsh-deployment-id',
      'xcsh-execution-engine',
    ]);
  const profile = object(vm.networkProfile, 'Malformed Azure ingress attachments');
  fields(profile, ['networkInterfaces']);
  if (!Array.isArray(profile.networkInterfaces)) throw new Error('Malformed Azure ingress attachments');
  const seen = new Set<string>();
  for (const raw of profile.networkInterfaces) {
    const row = object(raw, 'Malformed Azure ingress attachment');
    fields(row, ['id'], ['primary']);
    if (
      typeof row.id !== 'string' ||
      seen.has(row.id.toLowerCase()) ||
      (row.primary !== undefined && typeof row.primary !== 'boolean')
    )
      throw new Error('Duplicate or malformed Azure ingress attachment');
    seen.add(row.id.toLowerCase());
  }
  fields(object(nic.virtualMachine, 'Malformed Azure ingress back reference'), ['id']);
  const sli = plan.nics.filter((nic) => nic.role === 'sli');
  if (sli.length !== 1) throw new Error('Azure platform ingress requires exactly one SLI interface');
  const node = `${plan.deploymentName}-1`;
  const scope = `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/`;
  const vmResourceId = `${scope}Microsoft.Compute/virtualMachines/${node}`;
  const nicResourceId = `${scope}Microsoft.Network/networkInterfaces/${node}-nic${sli[0].index}`;
  for (const id of [vmResourceId, nicResourceId])
    if (
      !plan.ownershipInventory.some(
        (row) => row.resourceId.toLowerCase() === id.toLowerCase() && row.owned && row.action !== 'delete',
      )
    )
      throw new Error('Azure platform ingress interface is outside the owned inventory');

  const vmTags = object(vm.tags, 'Azure platform ingress VM ownership is unavailable');
  const nicTags = object(nic.tags, 'Azure platform ingress NIC ownership is unavailable');
  const ownerPlanSha256 = vmTags['xcsh-plan-sha256'];
  const attachments = object(
    vm.networkProfile,
    'Azure platform ingress VM network profile is unavailable',
  ).networkInterfaces;
  const attached =
    Array.isArray(attachments) &&
    attachments.filter(
      (value) =>
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        typeof (value as Json).id === 'string' &&
        String((value as Json).id).toLowerCase() === nicResourceId.toLowerCase(),
    );
  const mac = typeof nic.macAddress === 'string' ? nic.macAddress.replaceAll('-', ':').toLowerCase() : '';
  if (
    typeof vm.id !== 'string' ||
    vm.id.toLowerCase() !== vmResourceId.toLowerCase() ||
    vm.provisioningState !== 'Succeeded' ||
    !Array.isArray(attached) ||
    attached.length !== 1 ||
    typeof nic.id !== 'string' ||
    nic.id.toLowerCase() !== nicResourceId.toLowerCase() ||
    nic.provisioningState !== 'Succeeded' ||
    typeof object(nic.virtualMachine, 'Azure platform ingress NIC attachment is unavailable').id !== 'string' ||
    String(object(nic.virtualMachine, 'Azure platform ingress NIC attachment is unavailable').id).toLowerCase() !==
      vmResourceId.toLowerCase() ||
    !/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(mac) ||
    typeof ownerPlanSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(ownerPlanSha256) ||
    nicTags['xcsh-plan-sha256'] !== ownerPlanSha256 ||
    [vmTags, nicTags].some(
      (tags) =>
        tags['xcsh-managed-by'] !== 'azure-ce' ||
        tags['xcsh-deployment-id'] !== plan.deploymentName ||
        tags['xcsh-execution-engine'] !== plan.engine,
    )
  )
    throw new Error('Azure platform ingress VM, NIC, or ownership identity differs');
  return { node, mac, vmResourceId, nicResourceId, ownerPlanSha256 };
}

function project(value: Json, names: string[]) {
  return Object.fromEntries(names.filter((name) => value[name] !== undefined).map((name) => [name, value[name]]));
}
export async function observeAzureIngressInterface(plan: AzureCePlan, api: AzExecApi, signal?: AbortSignal) {
  const sli = plan.nics.filter((nic) => nic.role === 'sli');
  if (sli.length !== 1) throw new Error('Azure platform ingress requires exactly one SLI interface');
  const node = `${plan.deploymentName}-1`;
  const scope = `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/`;
  const vmResourceId = `${scope}Microsoft.Compute/virtualMachines/${node}`;
  const nicResourceId = `${scope}Microsoft.Network/networkInterfaces/${node}-nic${sli[0].index}`;
  for (const id of [vmResourceId, nicResourceId])
    if (
      !plan.ownershipInventory.some(
        (row) => row.resourceId.toLowerCase() === id.toLowerCase() && row.owned && row.action !== 'delete',
      )
    )
      throw new Error('Azure platform ingress interface is outside the owned inventory');
  const vm = await read(api, ['vm', 'show', '--ids', vmResourceId, '--subscription', plan.subscription.id], signal);
  const nic = await read(
    api,
    ['network', 'nic', 'show', '--ids', nicResourceId, '--subscription', plan.subscription.id],
    signal,
  );
  const ownerFields = ['xcsh-plan-sha256', 'xcsh-managed-by', 'xcsh-deployment-id', 'xcsh-execution-engine'];
  const profile = object(vm.networkProfile, 'Azure ingress attachments unavailable');
  const identity: AzureIngressInterfaceIdentity = {
    vm: {
      ...project(vm, ['id', 'provisioningState']),
      tags: project(object(vm.tags, 'Azure ingress owner unavailable'), ownerFields),
      networkProfile: {
        networkInterfaces: Array.isArray(profile.networkInterfaces)
          ? profile.networkInterfaces.map((row) =>
              project(object(row, 'Malformed Azure ingress attachment'), ['id', 'primary']),
            )
          : [],
      },
    },
    nic: {
      ...project(nic, ['id', 'provisioningState', 'macAddress']),
      tags: project(object(nic.tags, 'Azure ingress owner unavailable'), ownerFields),
      virtualMachine: project(object(nic.virtualMachine, 'Azure ingress back reference unavailable'), ['id']),
    },
  };
  return { ...validateAzureIngressInterfaceIdentity(plan, identity), identity };
}
