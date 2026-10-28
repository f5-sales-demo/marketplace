import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { AzExecApi } from '../az/exec';
import { canonicalSha256 } from './canonical';
import { validateAzureNativePendingAction } from './native-action-recovery';
import { validateAzureNativeNetworkGenerationInventory } from './native-network-generation';
import {
  qualifyAzureNativeNetworkReplacementHistory,
  qualifyAzureNativeNetworkReplacementSource,
  verifyAzureNativeNetworkReplacementOriginalSource,
} from './native-network-replacement';
import type { NativeWorkflowCheckpoint } from './native-workflow';
import {
  type AzureNetworkUpdateInventory,
  usableAzureNetworkAddress,
  validateAzureNetworkUpdateInventory,
} from './network-update';
import { verifyAzureNativeNetworkUpdateSite } from './network-update-native-source';
import { validateAzureCeCheckpoint } from './recovery';
import type { AzureRelayRetainedNic } from './relay-replacement-identity';
import type { AzureCeCheckpoint, AzureCePlan } from './types';

function require(condition: unknown, message: string): asserts condition {
  if (!condition) throw Error(`Azure native network replacement execution: ${message}`);
}
const same = (a: unknown, b: unknown) => canonicalSha256(a) === canonicalSha256(b);
const lower = (value: unknown) => (typeof value === 'string' ? value.toLowerCase() : '');
const object = (value: unknown): Record<string, unknown> => {
  require(value && typeof value === 'object' && !Array.isArray(value), 'malformed cloud identity');
  return value as Record<string, unknown>;
};
export function azureNativeNetworkReplacementNics(
  inventory: AzureNetworkUpdateInventory,
): Record<string, AzureRelayRetainedNic> {
  return Object.fromEntries(
    Object.entries(inventory.nodes).flatMap(([node, vm]) =>
      Object.entries(vm.nics).map(([index, nic]) => [
        `${node}:${index}`,
        {
          resourceId: nic.resourceId,
          subnetId: nic.subnetId,
          mac: nic.mac,
          privateIp: nic.privateIp,
          ownerPlanSha256: nic.ownerPlanSha256,
        },
      ]),
    ),
  );
}
export function validateAzureNativeNetworkReplacementMetadata(
  plan: AzureCePlan,
  value: NonNullable<NativeWorkflowCheckpoint['replacement']>,
): void {
  require(value.originalSourcePlan &&
    value.networkSourcePlan &&
    value.networkInventory &&
    typeof value.networkHistorySha256 === 'string' &&
    /^[a-f0-9]{64}$/.test(value.networkHistorySha256), 'complete original/network identity metadata required');
  verifyAzureNativeNetworkReplacementOriginalSource(plan, value.originalSourcePlan, value.networkSourcePlan);
  if (plan.networkReplacementProfile?.schemaVersion === 2)
    validateAzureNativeNetworkGenerationInventory(value.networkSourcePlan, value.networkInventory);
  else validateAzureNetworkUpdateInventory(value.networkSourcePlan, value.networkInventory);
  const inventory = value.networkInventory;
  require(same(value.retainedNics, azureNativeNetworkReplacementNics(inventory)) &&
    Object.entries(inventory.nodes).every(
      ([index, vm]) =>
        value.oldVmIds[`${plan.deploymentName}-${index}`]?.toLowerCase() === vm.vmId.toLowerCase() &&
        value.ownerPlanSha256ByNode[`${plan.deploymentName}-${index}`] === vm.ownerPlanSha256,
    ), 'frozen network/VM generation binding differs');
}

/** NIC ownership and IP-configuration identity stay bound to original creation through selected VM absence/recreation. */
export async function captureAzureNativeNetworkReplacementNics(
  plan: AzureCePlan,
  inventory: AzureNetworkUpdateInventory,
  api: AzExecApi,
  signal?: AbortSignal,
  independentlyAbsentNode?: string,
): Promise<Record<string, AzureRelayRetainedNic>> {
  const result: Record<string, AzureRelayRetainedNic> = {};
  for (const [node, vm] of Object.entries(inventory.nodes))
    for (const [index, expected] of Object.entries(vm.nics)) {
      signal?.throwIfAborted();
      const raw = await api.exec(
        'az',
        [
          'network',
          'nic',
          'show',
          '--ids',
          expected.resourceId,
          '--subscription',
          plan.subscription.id,
          '--output',
          'json',
        ],
        signal ? { signal } : undefined,
      );
      require(raw.exitCode === 0, 'current NIC evidence unavailable');
      let row: Record<string, unknown>;
      try {
        row = object(JSON.parse(raw.stdout));
      } catch {
        throw Error('Azure native network replacement execution: malformed NIC evidence');
      }
      const tags = object(row.tags);
      const attachment = row.virtualMachine == null ? undefined : object(row.virtualMachine);
      require(lower(row.id) === lower(expected.resourceId) &&
        lower(row.location) === lower(plan.region) &&
        row.provisioningState === 'Succeeded' &&
        !['nextLink', 'error', 'errors'].some((key) => row[key] !== undefined) &&
        tags['xcsh-managed-by'] === 'azure-ce' &&
        tags['xcsh-execution-engine'] === 'native' &&
        tags['xcsh-deployment-id'] === plan.deploymentName &&
        tags['xcsh-plan-sha256'] === expected.ownerPlanSha256 &&
        lower(row.macAddress).replaceAll('-', ':') === expected.mac &&
        (node === independentlyAbsentNode
          ? attachment === undefined
          : lower(attachment?.id) === lower(vm.resourceId)) &&
        Array.isArray(row.ipConfigurations) &&
        row.ipConfigurations.length === 1, 'retained NIC ownership/MAC/attachment differs');
      const ip = object(row.ipConfigurations[0]);
      require(lower(ip.id) === lower(expected.ipConfigurationId) &&
        ip.name === expected.ipConfigurationName &&
        ip.privateIPAddressVersion === 'IPv4' &&
        ip.privateIPAllocationMethod === expected.allocation &&
        lower(object(ip.subnet).id) === lower(expected.subnetId) &&
        ip.privateIPAddress === expected.privateIp &&
        usableAzureNetworkAddress(
          ip.privateIPAddress,
          expected.subnetCidr,
        ), 'retained IP configuration/address/subnet differs');
      result[`${node}:${index}`] = {
        resourceId: expected.resourceId,
        subnetId: expected.subnetId,
        mac: expected.mac,
        privateIp: expected.privateIp,
        ownerPlanSha256: expected.ownerPlanSha256,
      };
    }
  return result;
}

/** Revalidate historical producer/source identity and current old/absent/new VM state against the owning public journal. */
export async function verifyAzureNativeNetworkReplacementExecution(
  plan: AzureCePlan,
  admission: NativeWorkflowCheckpoint | undefined,
  store: Pick<CeDeploymentStore, 'read' | 'verify'>,
  load: (source: AzureCePlan) => Promise<AzureCeCheckpoint | undefined>,
  api: AzExecApi,
  runtime: Pick<CeRuntime, 'observeOwnedSite' | 'ownedSiteConfiguration'>,
  checkpoint?: AzureCeCheckpoint,
  signal?: AbortSignal,
) {
  if (checkpoint) validateAzureCeCheckpoint(checkpoint, plan);
  if (!admission?.replacement) {
    require(!checkpoint?.completedActionIds.length &&
      !checkpoint?.pendingAction, 'executed replacement lacks frozen network identity');
    return qualifyAzureNativeNetworkReplacementSource(plan, store, load, api, runtime, signal);
  }
  const value = admission.replacement;
  validateAzureNativeNetworkReplacementMetadata(plan, value);
  const history = await qualifyAzureNativeNetworkReplacementHistory(plan, store, load);
  require(same(value.originalSourcePlan, history.original) &&
    same(value.networkSourcePlan, history.networkSource) &&
    value.networkHistorySha256 === history.historySha256 &&
    same(value.networkInventory?.nodes, history.networkInventory.nodes) &&
    value.siteUid === history.source.siteUid &&
    value.siteConfigurationSha256 ===
      history.source.siteConfigurationSha256, 'frozen history or owned site binding changed');
  const inventory = value.networkInventory as AzureNetworkUpdateInventory;
  const prefix = checkpoint?.completedActionIds ?? [];
  const deleted = plan.actions.some((a) => a.kind === 'vm-delete' && prefix.includes(a.id));
  const created = plan.actions.some((a) => a.kind === 'vm-create' && prefix.includes(a.id));
  const pending = checkpoint?.pendingAction;
  if (pending) validateAzureNativePendingAction(plan, prefix, pending);
  const allowOld = !deleted && !created;
  const allowAbsent = (deleted && !created) || pending?.kind === 'vm-delete';
  const allowNew = created || pending?.kind === 'vm-create';
  let absentNode: string | undefined;
  for (const [index, before] of Object.entries(inventory.nodes)) {
    const selected = Number(index) === plan.intent.replacementNode;
    const raw = await api.exec(
      'az',
      [
        'vm',
        'show',
        '--ids',
        before.resourceId,
        '--show-details',
        '--subscription',
        plan.subscription.id,
        '--output',
        'json',
      ],
      signal ? { signal } : undefined,
    );
    if (raw.exitCode !== 0) {
      let code: unknown;
      try {
        const error = object(JSON.parse(raw.stderr || raw.stdout));
        code = object(error.error ?? error).code;
      } catch {
        code = undefined;
      }
      require(selected && allowAbsent && code === 'ResourceNotFound', 'VM evidence unavailable or unqualified absence');
      absentNode = index;
      continue;
    }
    let row: Record<string, unknown>;
    try {
      row = object(JSON.parse(raw.stdout));
    } catch {
      throw Error('Azure native network replacement execution: malformed VM evidence');
    }
    const tags = object(row.tags),
      uuid = lower(row.vmId),
      isOld = uuid === before.vmId.toLowerCase() && tags['xcsh-plan-sha256'] === before.ownerPlanSha256;
    const isNew =
      /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(uuid) &&
      !Object.values(value.oldVmIds).some((id) => id.toLowerCase() === uuid) &&
      tags['xcsh-plan-sha256'] === plan.planSha256 &&
      (!value.newVmId || value.newVmId.toLowerCase() === uuid);
    const attached = object(row.networkProfile).networkInterfaces;
    require(Array.isArray(attached) &&
      same(
        attached.map((nic) => lower(object(nic).id)),
        Object.values(before.nics).map((nic) => lower(nic.resourceId)),
      ), 'VM-side retained interface binding differs');
    if (selected && isNew) {
      const image = object(object(row.storageProfile).imageReference),
        marketplace = object(row.plan);
      require(lower(image.publisher) === lower(plan.image.publisher) &&
        lower(image.offer) === lower(plan.image.offer) &&
        lower(image.sku) === lower(plan.image.plan) &&
        lower(image.version) === lower(plan.image.version) &&
        lower(marketplace.publisher) === lower(plan.image.publisher) &&
        lower(marketplace.product) === lower(plan.image.offer) &&
        lower(marketplace.name) === lower(plan.image.plan), 'recreated VM pinned image/Marketplace binding differs');
    }
    require(lower(row.id) === lower(before.resourceId) &&
      row.name === `${plan.deploymentName}-${index}` &&
      lower(row.location) === lower(plan.region) &&
      row.provisioningState === 'Succeeded' &&
      lower(object(row.hardwareProfile).vmSize) === lower(plan.vm.size) &&
      tags['xcsh-managed-by'] === 'azure-ce' &&
      tags['xcsh-execution-engine'] === 'native' &&
      tags['xcsh-deployment-id'] === plan.deploymentName &&
      !['nextLink', 'error', 'errors'].some((key) => row[key] !== undefined) &&
      (selected ? (allowOld && isOld) || (allowNew && isNew) : isOld), 'old/new/survivor VM generation differs');
  }
  const nics = await captureAzureNativeNetworkReplacementNics(plan, inventory, api, signal, absentNode);
  require(same(nics, value.retainedNics), 'retained interface identity changed');
  await verifyAzureNativeNetworkUpdateSite(history.networkSource, history.source, runtime, signal);
  return { ...history, networkInventory: inventory };
}
