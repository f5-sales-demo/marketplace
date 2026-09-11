import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { VerifiedIngressContract } from '../../../platform/src/ce/ingress-contract';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import { type AzExecApi, detectAzError } from '../az/exec';
import { verifyAzureCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import { azureUpgradeBinding } from './terraform-upgrade';
import { observeAzureTrafficSource } from './traffic-source';
import type { AzureCePlan } from './types';

type Json = Record<string, unknown>;
interface Marker {
  schemaVersion: 1;
  engine: 'native' | 'terraform';
  configurationSha256: string;
  ingressPlanId: string;
  contractFingerprint: string;
}

function object(value: unknown, message: string): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message);
  return value as Json;
}

async function optional(storage: Pick<CeDeploymentStore, 'read'>, name: string): Promise<unknown> {
  try {
    return await storage.read(name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

async function read(api: AzExecApi, args: string[], signal?: AbortSignal): Promise<Json> {
  const result = await api.exec('az', [...args, '--output', 'json'], signal ? { signal } : undefined);
  if (result.exitCode !== 0) throw detectAzError(result.stderr, result.exitCode);
  try {
    return object(JSON.parse(result.stdout), 'Malformed Azure CE ingress identity observation');
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('Malformed Azure CE ingress identity observation');
    throw error;
  }
}

async function observeAzureIngressInterface(plan: AzureCePlan, api: AzExecApi, signal?: AbortSignal) {
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
  return { node, mac };
}

/** Create or resume the exact platform listener after Azure registration and SLI discovery. */
export async function ensureAzurePlatformIngress(
  plan: AzureCePlan,
  runtime: CeRuntime,
  storage: CeDeploymentStore,
  contract: VerifiedIngressContract,
  api: AzExecApi,
  signal?: AbortSignal,
) {
  verifyAzureCePlan(plan);
  if (plan.intent.ingress?.mode !== 'platform-http') return undefined;
  await storage.verify();
  const ingress = plan.intent.ingress;
  const source = await observeAzureTrafficSource(plan, api, signal);
  const selected = await observeAzureIngressInterface(plan, api, signal);
  const binding = azureUpgradeBinding(plan);
  const selections = [
    {
      binding,
      node: selected.node,
      mac: selected.mac,
      insideAddress: ingress.listener.privateAddress,
    },
  ];
  const intent = { ...ingress.listener, port: ingress.port, originAddress: source.privateAddress };
  const configurationSha256 = canonicalSha256({ owner: binding.owner, intent });
  const lifecycle = runtime.ingress(contract, storage);
  const saved = await optional(storage, 'azure-platform-ingress.json');
  let marker: Marker;
  if (saved !== undefined) {
    const candidate = object(saved, 'Malformed Azure platform ingress checkpoint') as unknown as Marker;
    if (
      candidate.schemaVersion !== 1 ||
      candidate.engine !== plan.engine ||
      candidate.configurationSha256 !== configurationSha256 ||
      candidate.contractFingerprint !== contract.fingerprint ||
      !/^[a-f0-9]{24}$/.test(candidate.ingressPlanId)
    )
      throw new Error('Platform ingress checkpoint differs from the owning Azure configuration');
    marker = candidate;
    if (!(await lifecycle.matchesAzure(marker.ingressPlanId, intent, selections, signal))) {
      if (!['replace-node', 'update-network'].includes(plan.intent.operation))
        throw new Error('Azure platform ingress identities changed outside an approved replacement operation');
      await lifecycle.retire(marker.ingressPlanId, signal);
      const replacement = await lifecycle.planAzure(intent, selections, signal);
      marker = { ...marker, ingressPlanId: replacement.id };
      await storage.write('azure-platform-ingress.json', marker);
    }
  } else {
    const ingressPlan = await lifecycle.planAzure(intent, selections, signal);
    marker = {
      schemaVersion: 1,
      engine: plan.engine,
      configurationSha256,
      ingressPlanId: ingressPlan.id,
      contractFingerprint: contract.fingerprint,
    };
    await storage.write('azure-platform-ingress.json', marker);
  }
  const receipt = await lifecycle.apply(marker.ingressPlanId, signal);
  return {
    ingressPlanId: marker.ingressPlanId,
    contractFingerprint: marker.contractFingerprint,
    uid: receipt.uid,
    listener: receipt.listener,
    routes: receipt.routes,
    traffic: receipt.traffic,
    observedAt: receipt.observedAt,
  };
}
