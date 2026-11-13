import { createHash } from 'node:crypto';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { acquireProcessLock } from '../../../platform/src/ce/process-lock';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { PlanReceipt } from '../../../terraform/src/runner';
import type { CeTerraformService, TerraformSession } from '../../../terraform/src/service';
import type { AzExecApi } from '../az/exec';
import { verifyAzureCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import { collectAzurePlatformHealth } from './platform-health';
import { azureRelayHistoricalArtifacts, requireAzureRelayHistoricalAcceptance } from './relay-artifact-provenance';
import { validAzureRelayRetainedNics } from './relay-replacement-identity';
import {
  azureRelayReplacementRetainedOwner,
  azureRelayResourceSource,
  captureAzureReplacementRouteServerOwnership,
  validAzureReplacementRouteServerOwnership,
} from './relay-replacement-plan';
import { configureAzureSelectedRelayRouting, requireAzureCeRoutingContract } from './relay-routing-dispatch';
import type { AzureRouteServerOwnership } from './route-server-health';
import { configureAzureRouteServerRouting } from './routing-workflow';
import { azureTerraformCurrentDeployment, renderAzureTerraformFoundation } from './terraform-foundation';
import {
  AzureTerraformNetworkReplacementCompletionUnavailable,
  azureTerraformNetworkReplacementCompletionName,
  publishAzureTerraformNetworkReplacementCompletion,
} from './terraform-network-replacement-completion';
import { observeAzureTerraformNetworkReplacementEnrollment } from './terraform-network-replacement-enrollment';
import {
  type AzureTerraformNetworkReplacementExecution,
  type AzureTerraformNetworkReplacementExecutionDependencies,
  openAzureTerraformNetworkReplacementExecution,
} from './terraform-network-replacement-execution';
import { publishAzureTerraformReplacementRefreshInventory } from './terraform-network-replacement-refresh-inventory';
import { planAzureTerraformReplacementFinalRefresh } from './terraform-replacement-final-refresh';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

type Json = Record<string, unknown>;
type Phase = 'prepared' | 'quiesced' | 'launched' | 'complete';
class NetworkReplacementOperationalPending extends Error {}
class NetworkReplacementEnrollmentPending extends Error {}

interface RetainedNic {
  resourceId: string;
  subnetId: string;
  mac: string;
  privateIp: string;
  ownerPlanSha256: string;
}

export interface ReplacementCheckpoint {
  schemaVersion: 1;
  engine: 'terraform';
  planSha256: string;
  node: number;
  sourceConfigurationSha256: string;
  quiesceConfigurationSha256: string;
  launchConfigurationSha256: string;
  bootstrapSha256: string;
  siteUid: string;
  siteConfigurationSha256: string;
  oldVmIds: Record<string, string>;
  ownerPlanSha256ByNode: Record<string, string>;
  retainedNics: Record<string, RetainedNic>;
  routeServer?: AzureRouteServerOwnership;
  phase: Phase;
  networkExecutionJournalSha256?: string;
  networkSourceBindingSha256?: string;
  newVmId?: string;
}

export interface ReplacementStage {
  phase: 'quiesce' | 'launch';
  previousConfigurationSha256: string;
  configurationSha256: string;
  configuration: string;
  address: string;
}

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const lower = (value: unknown) => (typeof value === 'string' ? value.toLowerCase() : '');
const uuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
const object = (value: unknown, message = 'Malformed Azure Terraform replacement data'): Json => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message);
  return value as Json;
};

const checkpointName = (plan: AzureCePlan) => `${plan.planId}-terraform-replacement.json`;
const sourceName = (plan: AzureCePlan) => `${plan.planId}-terraform-replacement-source.json`;
export const azureTerraformReplacementPlanName = (plan: AzureCePlan) =>
  `${plan.planId}-terraform-replacement-plan.json`;

/** Keep the exact public generation plan discoverable before bootstrap or VM mutation. */
async function persistReplacementPlan(plan: AzureCePlan, storage: CeDeploymentStore): Promise<void> {
  const name = azureTerraformReplacementPlanName(plan);
  let saved: unknown;
  try {
    saved = await storage.read(name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    await storage.write(name, plan);
    return;
  }
  verifyAzureCePlan(saved as AzureCePlan);
  if (canonicalSha256(saved) !== canonicalSha256(plan))
    throw Error('Azure Terraform replacement saved public plan differs');
}

function selectedNode(plan: AzureCePlan): number {
  if (plan.engine !== 'terraform' || plan.intent.operation !== 'replace-node' || !plan.intent.replacementNode)
    throw new Error('Azure Terraform replacement requires one exact selected node');
  return plan.intent.replacementNode;
}

function vmResourceId(plan: AzureCePlan, node: number): string {
  return `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Compute/virtualMachines/${plan.deploymentName}-${node}`;
}

function nicResourceId(plan: AzureCePlan, node: number, index: number): string {
  return `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Network/networkInterfaces/${plan.deploymentName}-${node}-nic${index}`;
}

function validateBootstrap(value: string): void {
  if (!value.startsWith('#cloud-config') || !value.includes('/etc/vpm/user_data') || /__\w+__/.test(value))
    throw new Error('Azure Terraform replacement requires resolved platform cloud-init');
}

function parseReplacementConfiguration(value: string): Json {
  try {
    return object(JSON.parse(value));
  } catch {
    throw Error('Malformed Azure Terraform replacement configuration');
  }
}

function validateReplacementConfiguration(plan: AzureCePlan, value: string): void {
  if (plan.relayProfile?.schemaVersion !== 2) return;
  const source = parseReplacementConfiguration(value);
  const instances = object(object(source.resource).azurerm_linux_virtual_machine);
  const original = azureRelayResourceSource(plan);
  const bootstrapByNode: Record<string, string> = {};
  for (let node = 1; node <= original.topology.nodeCount; node++) {
    const encoded = object(instances[`node_${node}`]).custom_data;
    if (typeof encoded !== 'string' || !encoded || Buffer.from(encoded, 'base64').toString('base64') !== encoded)
      throw Error('Azure Terraform replacement retained bootstrap encoding differs');
    const material = Buffer.from(encoded, 'base64').toString('utf8');
    validateBootstrap(material);
    bootstrapByNode[String(node)] = material;
  }
  const expected = object(JSON.parse(renderAzureTerraformFoundation(original, bootstrapByNode)));
  const expectedVms = object(object(expected.resource).azurerm_linux_virtual_machine);
  for (let node = 1; node <= original.topology.nodeCount; node++)
    object(object(expectedVms[`node_${node}`]).tags)['xcsh-plan-sha256'] = azureRelayReplacementRetainedOwner(
      plan,
      vmResourceId(plan, node),
    );
  if (canonicalSha256(source) !== canonicalSha256(expected))
    throw Error('Azure Terraform replacement retained configuration provenance differs');
}

/** Join the saved runner configuration to read-only cloud identities before issuing a new token. */
function validateRetainedConfigurationIdentity(
  plan: AzureCePlan,
  source: string,
  cloud: Pick<ReplacementCheckpoint, 'ownerPlanSha256ByNode' | 'retainedNics'>,
): void {
  const resources = object(parseReplacementConfiguration(source).resource);
  const vms = object(resources.azurerm_linux_virtual_machine);
  const nics = object(resources.azurerm_network_interface);
  const macs = new Set<string>();
  const requireOwner = (resource: Json, owner: string) => {
    const tags = object(resource.tags);
    if (
      tags['xcsh-managed-by'] !== 'azure-ce' ||
      tags['xcsh-execution-engine'] !== 'terraform' ||
      tags['xcsh-deployment-id'] !== plan.deploymentName ||
      tags['xcsh-plan-sha256'] !== owner
    )
      throw Error('Azure Terraform replacement retained configuration identity differs');
  };
  for (let node = 1; node <= plan.topology.nodeCount; node++) {
    requireOwner(object(vms[`node_${node}`]), cloud.ownerPlanSha256ByNode[`${plan.deploymentName}-${node}`]);
    for (const nic of plan.nics) {
      const retained = cloud.retainedNics[`${node}:${nic.index}`];
      requireOwner(object(nics[`node_${node}_nic_${nic.index}`]), retained.ownerPlanSha256);
      if (macs.has(retained.mac.toLowerCase()))
        throw Error('Azure Terraform replacement retained configuration identity has duplicate MACs');
      macs.add(retained.mac.toLowerCase());
    }
  }
}

export function azureTerraformReplacementStages(
  plan: AzureCePlan,
  source: string,
  sourceSha256: string,
  bootstrap: string,
) {
  verifyAzureCePlan(plan);
  const node = selectedNode(plan);
  if (digest(source) !== sourceSha256) throw new Error('Azure Terraform replacement source configuration changed');
  validateBootstrap(bootstrap);
  validateReplacementConfiguration(plan, source);
  const original = parseReplacementConfiguration(source);
  const resources = object(original.resource);
  const instances = object(resources.azurerm_linux_virtual_machine);
  const outputs = object(object(object(original.output).ce_instances).value);
  const name = `node_${node}`;
  const instance = object(instances[name]);
  const tags = object(instance.tags);
  const deleteAction = plan.actions.find((action) => action.kind === 'vm-delete' && action.node === node);
  const imageRows = instance.source_image_reference;
  const image = Array.isArray(imageRows) && imageRows.length === 1 ? object(imageRows[0]) : {};
  const expectedNics = plan.nics.map((nic) => `\${azurerm_network_interface.${name}_nic_${nic.index}.id}`);
  if (
    !deleteAction?.resourceId ||
    lower(deleteAction.resourceId) !== lower(vmResourceId(plan, node)) ||
    tags['xcsh-managed-by'] !== 'azure-ce' ||
    tags['xcsh-execution-engine'] !== 'terraform' ||
    tags['xcsh-deployment-id'] !== plan.deploymentName ||
    tags['xcsh-plan-sha256'] !== deleteAction.expectedOwnerPlanSha256 ||
    tags['xcsh-node-index'] !== String(node) ||
    tags['ves-io-site-name'] !== plan.siteName ||
    instance.name !== `${plan.deploymentName}-${node}` ||
    instance.computer_name !== `${plan.deploymentName}-${node}` ||
    instance.size !== plan.vm.size ||
    canonicalSha256(instance.network_interface_ids) !== canonicalSha256(expectedNics) ||
    image.publisher !== plan.image.publisher ||
    image.offer !== plan.image.offer ||
    image.sku !== plan.image.plan ||
    image.version !== plan.image.version ||
    object(outputs[String(node)]).id !== `\${azurerm_linux_virtual_machine.${name}.id}` ||
    object(outputs[String(node)]).vm_id !== `\${azurerm_linux_virtual_machine.${name}.virtual_machine_id}`
  )
    throw new Error('Azure Terraform replacement source VM or output binding differs');
  const quiesced = structuredClone(original);
  delete object(object(quiesced.resource).azurerm_linux_virtual_machine)[name];
  delete object(object(object(quiesced.output).ce_instances).value)[String(node)];
  const quiesceConfiguration = JSON.stringify(quiesced);
  const launched = structuredClone(original);
  const replacement = object(object(object(launched.resource).azurerm_linux_virtual_machine)[name]);
  replacement.custom_data = Buffer.from(bootstrap).toString('base64');
  object(replacement.tags)['xcsh-plan-sha256'] = plan.planSha256;
  const launchConfiguration = JSON.stringify(launched);
  const address = `azurerm_linux_virtual_machine.${name}`;
  const make = (
    phase: ReplacementStage['phase'],
    configuration: string,
    previousConfigurationSha256: string,
  ): ReplacementStage => ({
    phase,
    configuration,
    previousConfigurationSha256,
    configurationSha256: digest(configuration),
    address,
  });
  return {
    quiesce: make('quiesce', quiesceConfiguration, sourceSha256),
    launch: make('launch', launchConfiguration, digest(quiesceConfiguration)),
  };
}

export function validateAzureTerraformReplacementStageReceipt(
  plan: AzureCePlan,
  stage: ReplacementStage,
  receipt: PlanReceipt,
  providerLockSha256: string,
): void {
  const nonNoop = receipt.changes.filter((change) => change.actions.join(',') !== 'no-op');
  if (
    receipt.schemaVersion !== 1 ||
    receipt.engine !== 'terraform' ||
    receipt.deploymentId !== plan.deploymentName ||
    receipt.backendIdentity !== `local:${plan.deploymentName}` ||
    receipt.configurationSha256 !== stage.configurationSha256 ||
    receipt.operation !== undefined ||
    receipt.providerLockSha256 !== providerLockSha256 ||
    [receipt.actionInvocations, receipt.imports, receipt.relinquishments].some(
      (value) => value !== undefined && (!Array.isArray(value) || value.length !== 0),
    ) ||
    typeof receipt.noChanges !== 'boolean' ||
    !/^[a-f0-9]{64}$/.test(receipt.planSha256) ||
    !/^[a-f0-9]{64}$/.test(receipt.providerLockSha256) ||
    nonNoop.some(
      (change) =>
        change.address !== stage.address ||
        change.type !== 'azurerm_linux_virtual_machine' ||
        change.actions.join(',') !== (stage.phase === 'quiesce' ? 'delete' : 'create'),
    ) ||
    nonNoop.length > 1 ||
    (receipt.noChanges ? nonNoop.length !== 0 : nonNoop.length !== 1)
  )
    throw new Error('Azure Terraform replacement saved plan differs from the selected VM stage');
}

async function azJson(api: AzExecApi, args: string[], signal?: AbortSignal): Promise<Json> {
  signal?.throwIfAborted();
  const result = await api.exec('az', [...args, '--output', 'json'], signal ? { signal } : undefined);
  if (result.exitCode !== 0) throw new Error('Azure Terraform replacement observation is unavailable');
  try {
    const value = object(JSON.parse(result.stdout));
    if (value.nextLink !== undefined) throw new Error('Incomplete Azure Terraform replacement observation');
    return value;
  } catch {
    throw new Error('Malformed Azure Terraform replacement observation');
  }
}

async function listVms(plan: AzureCePlan, api: AzExecApi, signal?: AbortSignal): Promise<Json[]> {
  signal?.throwIfAborted();
  const result = await api.exec(
    'az',
    [
      'vm',
      'list',
      '--resource-group',
      plan.intent.resourceGroup,
      '--show-details',
      '--subscription',
      plan.subscription.id,
      '--output',
      'json',
    ],
    signal ? { signal } : undefined,
  );
  if (result.exitCode !== 0) throw new Error('Azure Terraform replacement VM observation is unavailable');
  try {
    const value = JSON.parse(result.stdout);
    if (!Array.isArray(value)) throw new Error('not an array');
    return value.map((item) => object(item));
  } catch {
    throw new Error('Malformed Azure Terraform replacement VM observation');
  }
}

async function account(plan: AzureCePlan, api: AzExecApi, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  const result = await api.exec(
    'az',
    ['account', 'show', '--subscription', plan.subscription.id, '--output', 'json'],
    signal ? { signal } : undefined,
  );
  if (result.exitCode !== 0) throw new Error('Azure Terraform replacement account observation is unavailable');
  let value: Json;
  try {
    value = object(JSON.parse(result.stdout));
  } catch {
    throw new Error('Malformed Azure Terraform replacement account observation');
  }
  if (
    lower(value.id) !== lower(plan.subscription.id) ||
    lower(value.tenantId) !== lower(plan.subscription.tenantId) ||
    value.environmentName !== plan.subscription.cloud ||
    value.state !== 'Enabled'
  )
    throw new Error('Azure Terraform replacement account differs from the plan');
}

async function initialCloudEvidence(plan: AzureCePlan, api: AzExecApi, signal?: AbortSignal) {
  await account(plan, api, signal);
  const rows = await listVms(plan, api, signal);
  const oldVmIds: Record<string, string> = {};
  const ownerPlanSha256ByNode: Record<string, string> = {};
  const retainedNics: Record<string, RetainedNic> = {};
  const selected = selectedNode(plan);
  const deleteAction = plan.actions.find((action) => action.kind === 'vm-delete' && action.node === selected);
  for (let node = 1; node <= plan.topology.nodeCount; node++) {
    const name = `${plan.deploymentName}-${node}`;
    const resourceId = vmResourceId(plan, node);
    const matches = rows.filter((row) => lower(row.id) === lower(resourceId));
    const vm = matches.length === 1 ? matches[0] : undefined;
    const tags = vm ? object(vm.tags) : {};
    const attachments =
      vm && Array.isArray(object(vm.networkProfile).networkInterfaces)
        ? (object(vm.networkProfile).networkInterfaces as unknown[]).map((item) => lower(object(item).id))
        : [];
    const expectedAttachments = plan.nics.map((nic) => lower(nicResourceId(plan, node, nic.index)));
    const ownerPlanSha256 = tags['xcsh-plan-sha256'];
    if (
      !vm ||
      vm.name !== name ||
      lower(vm.location) !== lower(plan.region) ||
      vm.provisioningState !== 'Succeeded' ||
      lower(object(vm.hardwareProfile).vmSize) !== lower(plan.vm.size) ||
      attachments.length !== expectedAttachments.length ||
      expectedAttachments.some((id) => !attachments.includes(id)) ||
      !uuid(vm.vmId) ||
      tags['xcsh-managed-by'] !== 'azure-ce' ||
      tags['xcsh-execution-engine'] !== 'terraform' ||
      tags['xcsh-deployment-id'] !== plan.deploymentName ||
      typeof ownerPlanSha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(ownerPlanSha256) ||
      (node === selected && ownerPlanSha256 !== deleteAction?.expectedOwnerPlanSha256) ||
      (plan.relayProfile?.schemaVersion === 2 &&
        ownerPlanSha256 !== azureRelayReplacementRetainedOwner(plan, resourceId))
    )
      throw new Error('Azure Terraform replacement VM identity or ownership is unavailable');
    oldVmIds[name] = vm.vmId;
    ownerPlanSha256ByNode[name] = ownerPlanSha256;
    for (const nic of plan.nics) {
      const id = nicResourceId(plan, node, nic.index);
      const value = await azJson(
        api,
        ['network', 'nic', 'show', '--ids', id, '--subscription', plan.subscription.id],
        signal,
      );
      const nicTags = object(value.tags);
      const configs = Array.isArray(value.ipConfigurations) ? value.ipConfigurations.map((item) => object(item)) : [];
      const primary = configs.filter(
        (item) => item.primary === true || (configs.length === 1 && item.primary === undefined),
      );
      const config = primary.length === 1 ? primary[0] : {};
      const mac = lower(value.macAddress).replaceAll('-', ':');
      const privateIp = config.privateIPAddress;
      const subnetId = object(config.subnet).id;
      if (
        lower(value.id) !== lower(id) ||
        lower(value.location) !== lower(plan.region) ||
        value.provisioningState !== 'Succeeded' ||
        lower(object(value.virtualMachine).id) !== lower(resourceId) ||
        nicTags['xcsh-managed-by'] !== 'azure-ce' ||
        nicTags['xcsh-execution-engine'] !== 'terraform' ||
        nicTags['xcsh-deployment-id'] !== plan.deploymentName ||
        typeof nicTags['xcsh-plan-sha256'] !== 'string' ||
        !/^[a-f0-9]{64}$/.test(String(nicTags['xcsh-plan-sha256'])) ||
        (plan.relayProfile?.schemaVersion === 2 &&
          nicTags['xcsh-plan-sha256'] !== azureRelayReplacementRetainedOwner(plan, id)) ||
        !/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(mac) ||
        typeof privateIp !== 'string' ||
        (plan.relayProfile?.schemaVersion === 2 && configs.length !== 1) ||
        config.privateIPAddressVersion !== 'IPv4' ||
        typeof subnetId !== 'string'
      )
        throw new Error('Azure Terraform retained NIC identity is unavailable');
      retainedNics[`${node}:${nic.index}`] = {
        resourceId: id,
        subnetId,
        mac,
        privateIp,
        ownerPlanSha256: String(nicTags['xcsh-plan-sha256']),
      };
    }
  }
  if (new Set(Object.values(oldVmIds).map(lower)).size !== plan.topology.nodeCount)
    throw new Error('Azure Terraform original VM identities are ambiguous');
  if (plan.relayProfile?.schemaVersion === 2 && !validAzureRelayRetainedNics(plan, retainedNics))
    throw Error('Azure Terraform retained NIC identity joins differ');
  const routeServer =
    plan.routing.mode === 'route-server'
      ? await captureAzureReplacementRouteServerOwnership(plan, api, signal)
      : undefined;
  return { oldVmIds, ownerPlanSha256ByNode, retainedNics, ...(routeServer ? { routeServer } : {}) };
}

async function currentCloudEvidence(
  plan: AzureCePlan,
  checkpoint: ReplacementCheckpoint,
  api: AzExecApi,
  phase: 'intact' | 'quiesced' | 'launched',
  signal?: AbortSignal,
) {
  await account(plan, api, signal);
  const rows = await listVms(plan, api, signal);
  const selected = selectedNode(plan);
  const currentVmIds: Record<string, string> = {};
  const expectedInterfaces: Array<{ node: string; role: 'slo' | 'data' | 'sli'; mac: string }> = [];
  for (let node = 1; node <= plan.topology.nodeCount; node++) {
    const name = `${plan.deploymentName}-${node}`;
    const resourceId = vmResourceId(plan, node);
    const matches = rows.filter((row) => lower(row.id) === lower(resourceId));
    if (node === selected && phase === 'quiesced') {
      if (matches.length) throw new Error('Azure Terraform replacement VM deletion has not converged');
    } else {
      if (node === selected && phase === 'launched' && matches.length === 0)
        throw new Error('Azure Terraform replacement VM launch has not converged');
      const vm = matches.length === 1 ? matches[0] : undefined;
      const tags = vm ? object(vm.tags) : {};
      const attachments =
        vm && Array.isArray(object(vm.networkProfile).networkInterfaces)
          ? (object(vm.networkProfile).networkInterfaces as unknown[]).map((item) => lower(object(item).id))
          : [];
      const expectedAttachments = plan.nics.map((nic) => lower(nicResourceId(plan, node, nic.index)));
      const expectedOwner =
        node === selected && phase === 'launched' ? plan.planSha256 : checkpoint.ownerPlanSha256ByNode[name];
      if (
        !vm ||
        vm.name !== name ||
        lower(vm.location) !== lower(plan.region) ||
        vm.provisioningState !== 'Succeeded' ||
        lower(object(vm.hardwareProfile).vmSize) !== lower(plan.vm.size) ||
        attachments.length !== expectedAttachments.length ||
        expectedAttachments.some((id) => !attachments.includes(id)) ||
        !uuid(vm.vmId) ||
        tags['xcsh-managed-by'] !== 'azure-ce' ||
        tags['xcsh-execution-engine'] !== 'terraform' ||
        tags['xcsh-deployment-id'] !== plan.deploymentName ||
        tags['xcsh-plan-sha256'] !== expectedOwner ||
        (node !== selected && lower(vm.vmId) !== lower(checkpoint.oldVmIds[name])) ||
        (node === selected && phase === 'intact' && lower(vm.vmId) !== lower(checkpoint.oldVmIds[name])) ||
        (node === selected && phase === 'launched' && lower(vm.vmId) === lower(checkpoint.oldVmIds[name]))
      )
        throw new Error('Azure Terraform replacement VM identity changed outside the selected boundary');
      currentVmIds[name] = vm.vmId;
    }
    for (const nic of plan.nics) {
      const key = `${node}:${nic.index}`;
      const expected = checkpoint.retainedNics[key];
      if (!expected) throw new Error('Azure Terraform retained NIC checkpoint is incomplete');
      const value = await azJson(
        api,
        ['network', 'nic', 'show', '--ids', expected.resourceId, '--subscription', plan.subscription.id],
        signal,
      );
      const tags = object(value.tags);
      const configs = Array.isArray(value.ipConfigurations) ? value.ipConfigurations.map((item) => object(item)) : [];
      const primary = configs.filter(
        (item) => item.primary === true || (configs.length === 1 && item.primary === undefined),
      );
      const config = primary.length === 1 ? primary[0] : {};
      const attachment = lower(
        value.virtualMachine && typeof value.virtualMachine === 'object' && !Array.isArray(value.virtualMachine)
          ? (value.virtualMachine as Json).id
          : undefined,
      );
      const expectedAttachment = node === selected && phase === 'quiesced' ? '' : lower(resourceId);
      if (
        lower(value.id) !== lower(expected.resourceId) ||
        lower(value.location) !== lower(plan.region) ||
        value.provisioningState !== 'Succeeded' ||
        attachment !== expectedAttachment ||
        (plan.relayProfile?.schemaVersion === 2 && configs.length !== 1) ||
        tags['xcsh-managed-by'] !== 'azure-ce' ||
        tags['xcsh-execution-engine'] !== 'terraform' ||
        tags['xcsh-deployment-id'] !== plan.deploymentName ||
        tags['xcsh-plan-sha256'] !== expected.ownerPlanSha256 ||
        lower(value.macAddress).replaceAll('-', ':') !== expected.mac ||
        config.privateIPAddress !== expected.privateIp ||
        lower(object(config.subnet).id) !== lower(expected.subnetId)
      )
        throw new Error('Azure Terraform retained NIC identity, attachment, or address changed');
      if (nic.role === 'slo' || nic.role === 'data' || nic.role === 'sli')
        expectedInterfaces.push({ node: name, role: nic.role, mac: expected.mac });
    }
  }
  if (
    plan.relayProfile &&
    canonicalSha256(await captureAzureReplacementRouteServerOwnership(plan, api, signal)) !==
      canonicalSha256(checkpoint.routeServer)
  )
    throw Error('Azure Terraform replacement retained relay ownership changed');
  return { currentVmIds, expectedInterfaces, observedAt: new Date().toISOString() };
}

async function validateOutputs(
  plan: AzureCePlan,
  session: TerraformSession,
  checkpoint: ReplacementCheckpoint,
  currentVmIds: Record<string, string>,
  env: Record<string, string | undefined>,
  signal?: AbortSignal,
) {
  const outputs = await session.readOutputs(['ce_instances', 'ce_interfaces'], env, signal);
  const instances = object(outputs.ce_instances, 'Azure Terraform replacement instance outputs are unavailable');
  const interfaces = object(outputs.ce_interfaces, 'Azure Terraform replacement interface outputs are unavailable');
  if (
    Object.keys(instances).sort().join(',') !==
      Array.from({ length: plan.topology.nodeCount }, (_, index) => String(index + 1)).join(',') ||
    Object.keys(interfaces).sort().join(',') !== Object.keys(checkpoint.retainedNics).sort().join(',')
  )
    throw new Error('Azure Terraform replacement output inventory is incomplete');
  for (let node = 1; node <= plan.topology.nodeCount; node++) {
    const name = `${plan.deploymentName}-${node}`;
    const instance = object(instances[String(node)]);
    if (
      lower(instance.id) !== lower(vmResourceId(plan, node)) ||
      lower(instance.vm_id) !== lower(currentVmIds[name]) ||
      instance.site_name !== plan.siteName ||
      instance.hostname !== name
    )
      throw new Error('Azure Terraform replacement VM output differs from live identity');
    for (const nic of plan.nics) {
      const key = `${node}:${nic.index}`;
      const expected = checkpoint.retainedNics[key];
      const value = object(interfaces[key]);
      if (
        lower(value.id) !== lower(expected.resourceId) ||
        lower(value.subnet_id) !== lower(expected.subnetId) ||
        value.site_name !== plan.siteName ||
        value.node !== node ||
        value.index !== nic.index ||
        value.role !== nic.role
      )
        throw new Error('Azure Terraform replacement retained-interface output differs');
    }
  }
  return outputs;
}

export function validateAzureTerraformReplacementCheckpoint(plan: AzureCePlan, value: unknown): ReplacementCheckpoint {
  verifyAzureCePlan(plan);
  const checkpoint = object(value) as unknown as ReplacementCheckpoint;
  const expectedKeys = [
    'schemaVersion',
    'engine',
    'planSha256',
    'node',
    'sourceConfigurationSha256',
    'quiesceConfigurationSha256',
    'launchConfigurationSha256',
    'bootstrapSha256',
    'siteUid',
    'siteConfigurationSha256',
    'oldVmIds',
    'ownerPlanSha256ByNode',
    'retainedNics',
    'phase',
    ...(plan.terraformNetworkReplacementProfile ? ['networkExecutionJournalSha256', 'networkSourceBindingSha256'] : []),
    ...(checkpoint.routeServer !== undefined ? ['routeServer'] : []),
    ...(checkpoint.newVmId !== undefined ? ['newVmId'] : []),
  ];
  const nodes = Array.from({ length: plan.topology.nodeCount }, (_, index) => `${plan.deploymentName}-${index + 1}`);
  const nicKeys = nodes.flatMap((_name, index) => plan.nics.map((nic) => `${index + 1}:${nic.index}`));
  if (
    Object.keys(checkpoint).sort().join(',') !== expectedKeys.sort().join(',') ||
    checkpoint.schemaVersion !== 1 ||
    checkpoint.engine !== 'terraform' ||
    checkpoint.planSha256 !== plan.planSha256 ||
    checkpoint.node !== selectedNode(plan) ||
    (plan.terraformNetworkReplacementProfile &&
      [checkpoint.networkExecutionJournalSha256, checkpoint.networkSourceBindingSha256].some(
        (v) => typeof v !== 'string' || !/^[a-f0-9]{64}$/.test(v),
      )) ||
    !['prepared', 'quiesced', 'launched', 'complete'].includes(checkpoint.phase) ||
    [
      checkpoint.sourceConfigurationSha256,
      checkpoint.quiesceConfigurationSha256,
      checkpoint.launchConfigurationSha256,
      checkpoint.bootstrapSha256,
      checkpoint.siteConfigurationSha256,
    ].some((item) => !/^[a-f0-9]{64}$/.test(item)) ||
    typeof checkpoint.siteUid !== 'string' ||
    !checkpoint.siteUid ||
    Object.keys(checkpoint.oldVmIds).sort().join(',') !== [...nodes].sort().join(',') ||
    Object.keys(checkpoint.ownerPlanSha256ByNode).sort().join(',') !== [...nodes].sort().join(',') ||
    Object.keys(checkpoint.retainedNics).sort().join(',') !== [...nicKeys].sort().join(',') ||
    Object.values(checkpoint.oldVmIds).some((item) => !uuid(item)) ||
    new Set(Object.values(checkpoint.oldVmIds).map(lower)).size !== nodes.length ||
    new Set(Object.values(checkpoint.retainedNics).map((nic) => lower(nic.mac))).size !== nicKeys.length ||
    (plan.relayProfile?.schemaVersion === 2 && !validAzureRelayRetainedNics(plan, checkpoint.retainedNics)) ||
    Object.entries(checkpoint.ownerPlanSha256ByNode).some(
      ([name, item]) =>
        !/^[a-f0-9]{64}$/.test(item) ||
        (plan.relayProfile?.schemaVersion === 2 &&
          item !==
            azureRelayReplacementRetainedOwner(
              plan,
              `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Compute/virtualMachines/${name}`,
            )),
    ) ||
    nicKeys.some((key) => {
      const nic = checkpoint.retainedNics[key];
      const [node, index] = key.split(':').map(Number);
      return (
        !nic ||
        lower(nic.resourceId) !== lower(nicResourceId(plan, node, index)) ||
        !lower(nic.subnetId).startsWith(`/subscriptions/${plan.subscription.id}/`.toLowerCase()) ||
        !/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(nic.mac) ||
        typeof nic.privateIp !== 'string' ||
        !/^[a-f0-9]{64}$/.test(nic.ownerPlanSha256) ||
        (plan.relayProfile?.schemaVersion === 2 &&
          nic.ownerPlanSha256 !== azureRelayReplacementRetainedOwner(plan, nic.resourceId))
      );
    }) ||
    (plan.routing.mode === 'route-server') !== Boolean(checkpoint.routeServer) ||
    (checkpoint.routeServer !== undefined &&
      !validAzureReplacementRouteServerOwnership(plan, checkpoint.routeServer)) ||
    (checkpoint.phase === 'prepared' || checkpoint.phase === 'quiesced'
      ? checkpoint.newVmId !== undefined
      : !uuid(checkpoint.newVmId)) ||
    (checkpoint.newVmId !== undefined &&
      Object.values(checkpoint.oldVmIds).some((item) => lower(checkpoint.newVmId) === lower(item)))
  )
    throw new Error('Azure Terraform replacement checkpoint differs from the immutable plan');
  return checkpoint;
}

/** Replay private stage material with its immutable pre-mutation identity snapshot. */
export function validateAzureTerraformReplacementSource(
  plan: AzureCePlan,
  checkpoint: ReplacementCheckpoint,
  value: unknown,
) {
  validateAzureTerraformReplacementCheckpoint(plan, checkpoint);
  const snapshot = object(value);
  if (
    Object.keys(snapshot).sort().join(',') !==
      [
        'bootstrap',
        'planSha256',
        'preparedCheckpoint',
        'schemaVersion',
        'source',
        ...(plan.terraformNetworkReplacementProfile
          ? ['networkExecutionJournalSha256', 'networkSourceBindingSha256']
          : []),
      ]
        .sort()
        .join(',') ||
    (plan.terraformNetworkReplacementProfile &&
      (snapshot.networkExecutionJournalSha256 !== checkpoint.networkExecutionJournalSha256 ||
        snapshot.networkSourceBindingSha256 !== checkpoint.networkSourceBindingSha256)) ||
    snapshot.schemaVersion !== 1 ||
    snapshot.planSha256 !== plan.planSha256 ||
    typeof snapshot.source !== 'string' ||
    typeof snapshot.bootstrap !== 'string' ||
    digest(snapshot.source) !== checkpoint.sourceConfigurationSha256 ||
    digest(snapshot.bootstrap) !== checkpoint.bootstrapSha256
  )
    throw Error('Azure Terraform replacement private source snapshot differs');
  const prepared = validateAzureTerraformReplacementCheckpoint(plan, snapshot.preparedCheckpoint);
  const { newVmId: _newVmId, ...initial } = checkpoint;
  if (prepared.phase !== 'prepared' || canonicalSha256(prepared) !== canonicalSha256({ ...initial, phase: 'prepared' }))
    throw Error('Azure Terraform replacement prepared source identity differs');
  const built = azureTerraformReplacementStages(
    plan,
    snapshot.source,
    checkpoint.sourceConfigurationSha256,
    snapshot.bootstrap,
  );
  if (
    built.quiesce.configurationSha256 !== checkpoint.quiesceConfigurationSha256 ||
    built.launch.configurationSha256 !== checkpoint.launchConfigurationSha256
  )
    throw Error('Azure Terraform replacement stage configuration changed');
  return { source: snapshot.source, bootstrap: snapshot.bootstrap, stages: built };
}

/** Qualify saved stage proofs on resume; phase labels alone cannot authorize continuation. */
export function validateAzureTerraformReplacementStageHistory(
  plan: AzureCePlan,
  checkpoint: ReplacementCheckpoint,
  snapshot: unknown,
  records: Map<string, unknown>,
  providerLockSha256: string,
): void {
  const built = validateAzureTerraformReplacementSource(plan, checkpoint, snapshot).stages;
  const vmId = vmResourceId(plan, checkpoint.node);
  for (const phase of ['quiesce', 'launch'] as const) {
    const name = `${plan.planId}-terraform-${phase}-plan.json`;
    const value = records.get(name);
    const required =
      phase === 'quiesce'
        ? checkpoint.phase !== 'prepared'
        : checkpoint.phase === 'launched' || checkpoint.phase === 'complete';
    if (value === undefined) {
      if (required) throw Error('Azure Terraform replacement saved stage history is unavailable');
      continue;
    }
    const stage = built[phase];
    const record = object(value);
    const receipt = object(record.receipt) as unknown as PlanReceipt;
    validateAzureTerraformReplacementStageReceipt(plan, stage, receipt, providerLockSha256);
    const identities = object(record.identities);
    const expected = phase === 'quiesce' ? (receipt.noChanges ? null : vmId) : receipt.noChanges ? vmId : null;
    if (
      Object.keys(record).sort().join(',') !==
        [
          'identities',
          'receipt',
          ...(plan.terraformNetworkReplacementProfile
            ? ['networkExecutionJournalSha256', 'networkSourceBindingSha256']
            : []),
        ]
          .sort()
          .join(',') ||
      (plan.terraformNetworkReplacementProfile &&
        (record.networkExecutionJournalSha256 !== checkpoint.networkExecutionJournalSha256 ||
          record.networkSourceBindingSha256 !== checkpoint.networkSourceBindingSha256)) ||
      Object.keys(identities).join(',') !== stage.address ||
      (expected === null ? identities[stage.address] !== null : lower(identities[stage.address]) !== lower(expected))
    )
      throw Error('Azure Terraform replacement saved stage VM identity differs');
  }
  const final = records.get(`${plan.planId}-terraform-replacement-final-plan.json`);
  if (final === undefined) {
    if (checkpoint.phase === 'complete')
      throw Error('Azure Terraform replacement final no-change history is unavailable');
  } else {
    const receipt = object(final) as unknown as PlanReceipt;
    validateAzureTerraformReplacementStageReceipt(plan, built.launch, receipt, providerLockSha256);
    if (!receipt.noChanges || !['launched', 'complete'].includes(checkpoint.phase))
      throw Error('Azure Terraform replacement final no-change history differs');
  }
}

async function loadStageHistory(plan: AzureCePlan, storage: CeDeploymentStore): Promise<Map<string, unknown>> {
  const records = new Map<string, unknown>();
  for (const suffix of ['quiesce-plan', 'launch-plan', 'replacement-final-plan']) {
    const name = `${plan.planId}-terraform-${suffix}.json`;
    try {
      records.set(name, await storage.read(name));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return records;
}

async function applyStage(
  plan: AzureCePlan,
  session: TerraformSession,
  stage: ReplacementStage,
  storage: CeDeploymentStore,
  api: AzExecApi,
  checkpoint: ReplacementCheckpoint,
  env: Record<string, string | undefined>,
  providerLockSha256: string,
  signal?: AbortSignal,
  guard?: AzureTerraformNetworkReplacementExecution,
  enrollment?: () => ReturnType<typeof observeAzureTerraformNetworkReplacementEnrollment>,
) {
  const evidencePhase = stage.phase === 'quiesce' ? 'quiesced' : 'launched';
  let currentSha256 = await session.readConfigurationSha256?.();
  if (!currentSha256) throw new Error('Terraform replacement configuration identity is unavailable');
  const receiptName = `${plan.planId}-terraform-${stage.phase}-plan.json`;
  const fields = guard
    ? { networkExecutionJournalSha256: guard.journalSha256, networkSourceBindingSha256: guard.sourceBindingSha256 }
    : {};
  const sealExecution = async () => {
    if (!guard) return;
    const saved = validateAzureTerraformReplacementCheckpoint(plan, await storage.read(checkpointName(plan)));
    if (canonicalSha256(saved) !== canonicalSha256(checkpoint))
      throw Error('Azure Terraform network replacement execution checkpoint changed');
    const snapshot = await storage.read(sourceName(plan));
    const material = validateAzureTerraformReplacementSource(plan, saved, snapshot);
    const { oldVmIds, ownerPlanSha256ByNode, retainedNics, siteUid, siteConfigurationSha256 } = saved;
    guard.compare(material.source, { oldVmIds, ownerPlanSha256ByNode, retainedNics, siteUid, siteConfigurationSha256 });
    validateAzureTerraformReplacementStageHistory(
      plan,
      saved,
      snapshot,
      await loadStageHistory(plan, storage),
      providerLockSha256,
    );
  };
  await sealExecution();
  const strictEvidence = async () => {
    const evidence = await currentCloudEvidence(plan, checkpoint, api, evidencePhase, signal);
    const target = `${plan.deploymentName}-${selectedNode(plan)}`;
    await guard?.check(
      stage.configurationSha256,
      evidencePhase,
      evidencePhase === 'launched' ? evidence.currentVmIds[target] : undefined,
    );
    await sealExecution();
    return evidence;
  };
  const seal = async (record: unknown) => {
    await sealExecution();
    if (guard && canonicalSha256(await storage.read(receiptName)) !== canonicalSha256(record))
      throw Error('Azure Terraform network replacement saved stage changed at execution boundary');
  };
  let unsubmitted: { receipt: PlanReceipt; record: Json } | undefined;
  if (currentSha256 === stage.configurationSha256) {
    try {
      const previous = object(await storage.read(receiptName));
      const receipt = previous.receipt as PlanReceipt;
      validateAzureTerraformReplacementStageReceipt(plan, stage, receipt, providerLockSha256);
      if (guard) {
        if (
          previous.networkExecutionJournalSha256 !== guard.journalSha256 ||
          previous.networkSourceBindingSha256 !== guard.sourceBindingSha256
        )
          throw Error('Azure Terraform network replacement saved stage owning journal differs');
        const state = await session.readPlanApplicationState?.(receipt);
        if (!['planned', 'applying', 'applied'].includes(String(state)))
          throw Error('Azure Terraform network replacement exact saved application state unavailable');
        if (state !== 'planned') {
          const evidence = await strictEvidence();
          await seal(previous);
          if (state === 'applying') await session.reconcileApplyFromEvidence(receipt, canonicalSha256(evidence));
          return evidence;
        }
        await guard.check(stage.configurationSha256, stage.phase === 'quiesce' ? 'intact' : 'quiesced');
        // Keep the exact unsubmitted native receipt through acceptance interruptions.
        // Apply still rechecks the saved journal, current identities and enrollment.
        unsubmitted = { receipt: structuredClone(receipt), record: structuredClone(previous) };
      } else {
        const evidence = await currentCloudEvidence(plan, checkpoint, api, evidencePhase, signal);
        await session.reconcileApplyFromEvidence(receipt, canonicalSha256(evidence));
      }
    } catch (error) {
      if (guard && (error as NodeJS.ErrnoException).code === 'ENOENT') {
        // Preserve missing consumed-plan provenance; only an unsubmitted revision may be planned again.
        await guard.check(stage.configurationSha256, stage.phase === 'quiesce' ? 'intact' : 'quiesced');
      }
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        if (guard) throw error;
        if (!(error instanceof Error) || !error.message.includes('has not converged')) throw error;
      }
    }
  } else if (currentSha256 === stage.previousConfigurationSha256) {
    await currentCloudEvidence(plan, checkpoint, api, stage.phase === 'quiesce' ? 'intact' : 'quiesced', signal);
    await guard?.check(currentSha256, stage.phase === 'quiesce' ? 'intact' : 'quiesced');
    await sealExecution();
    await session.reviseConfiguration(currentSha256, stage.configuration);
    currentSha256 = stage.configurationSha256;
  } else {
    throw new Error('Terraform replacement configuration differs from the persisted stage');
  }
  const receipt = unsubmitted?.receipt ?? (await session.plan(env, signal));
  validateAzureTerraformReplacementStageReceipt(plan, stage, receipt, providerLockSha256);
  const identities = await session.readPlannedResourceIds(receipt, [stage.address], env, signal);
  const expectedId = vmResourceId(plan, selectedNode(plan));
  if (
    (!receipt.noChanges && stage.phase === 'quiesce' && lower(identities[stage.address]) !== lower(expectedId)) ||
    (!receipt.noChanges && stage.phase === 'launch' && identities[stage.address] !== null)
  )
    throw new Error('Azure Terraform replacement saved plan targets a different VM identity');
  const record = { receipt, identities, ...fields };
  if (unsubmitted) {
    if (canonicalSha256(unsubmitted.record) !== canonicalSha256(record))
      throw Error('Azure Terraform network replacement saved unsubmitted target identities differ');
    await seal(record);
  } else {
    await storage.write(receiptName, record);
  }
  if (guard) {
    await guard.check(
      stage.configurationSha256,
      receipt.noChanges ? evidencePhase : stage.phase === 'quiesce' ? 'intact' : 'quiesced',
      receipt.noChanges && evidencePhase === 'launched' ? checkpoint.newVmId : undefined,
    );
    if (
      !receipt.noChanges &&
      stage.phase === 'quiesce' &&
      !(await guard.operational(stage.configurationSha256, 'intact', 'preflight'))
    )
      throw new NetworkReplacementOperationalPending('Current preflight evidence unavailable');
    const currentEnrollment = receipt.noChanges ? undefined : await enrollment?.();
    if (!receipt.noChanges && !currentEnrollment)
      throw new NetworkReplacementEnrollmentPending('Current saved enrollment unavailable');
    await seal(record);
    const state = await session.readPlanApplicationState?.(receipt);
    if (state !== 'planned') throw Error('Azure Terraform network replacement saved plan is not unsubmitted');
    await seal(record);
    if (currentEnrollment) {
      // Recheck private material and expiry after the final saved-state callbacks, outside apply recovery.
      if (
        canonicalSha256(await storage.read(`${currentEnrollment.witness.tokenName}.json`)) !==
        currentEnrollment.privateTokenSha256
      )
        throw Error('Azure Terraform network replacement private token changed at apply boundary');
      if (
        canonicalSha256(storage.owner) !== canonicalSha256(currentEnrollment.witness.owner) ||
        plan.planSha256 !== currentEnrollment.planSha256
      )
        throw Error('Azure Terraform network replacement enrollment context changed at apply boundary');
      verifyAzureCePlan(plan);
      if (
        !Number.isFinite(currentEnrollment.witness.expiresAt) ||
        currentEnrollment.witness.expiresAt <= Date.now() + 60000
      )
        throw new NetworkReplacementEnrollmentPending('Current saved enrollment expired at apply boundary');
    }
  }
  if (!receipt.noChanges) {
    try {
      await session.apply(receipt, env, signal);
    } catch {
      const evidence = await strictEvidence();
      await seal(record);
      await storage.write(`${plan.planId}-terraform-${stage.phase}-recovery.json`, { ...evidence, ...fields });
      await guard?.check(
        stage.configurationSha256,
        evidencePhase,
        evidencePhase === 'launched'
          ? evidence.currentVmIds[`${plan.deploymentName}-${selectedNode(plan)}`]
          : undefined,
      );
      await seal(record);
      await session.reconcileApplyFromEvidence(receipt, canonicalSha256(evidence));
      return evidence;
    }
  }
  return strictEvidence();
}

/** Replace exactly one Terraform-owned Azure VM while retaining NIC and logical-site identities. */
export async function runAzureTerraformReplacement(
  plan: AzureCePlan,
  terraform: CeTerraformService,
  runtime: Pick<
    CeRuntime,
    | 'engine'
    | 'requireBootstrapContract'
    | 'requireRoutingContract'
    | 'bootstrap'
    | 'observeIssuedBootstrapToken'
    | 'approveRegistrations'
    | 'observeHealth'
    | 'observeRegistrations'
    | 'observeRegisteredConfiguration'
    | 'observeOwnedSite'
    | 'ownedSiteConfiguration'
    | 'requireAzureRelayRoutingContract'
    | 'ensureAzureRelayRouting'
    | 'ensureAzureRouting'
    | 'observeAzureInterfaces'
    | 'observeBgpSessions'
    | 'observeBgpRoutes'
  >,
  storage: CeDeploymentStore,
  api: AzExecApi,
  env: Record<string, string | undefined>,
  signal?: AbortSignal,
  acceptIngress?: () => Promise<{ ingress: unknown; traffic: { status: 'healthy' } }>,
  qualifySource?: (
    source: string,
    state: Pick<
      ReplacementCheckpoint,
      'oldVmIds' | 'ownerPlanSha256ByNode' | 'retainedNics' | 'siteUid' | 'siteConfigurationSha256'
    >,
  ) => Promise<void>,
  networkExecution?: AzureTerraformNetworkReplacementExecutionDependencies,
) {
  verifyAzureCePlan(plan);
  const node = selectedNode(plan);
  if (Boolean(plan.terraformNetworkReplacementProfile) !== Boolean(networkExecution))
    throw Error('Azure Terraform replacement requires the exact owning network execution binding for its profile');
  if (runtime.engine !== 'terraform' || storage.owner.engine !== 'terraform')
    throw new Error('Only the owning Terraform engine may replace an Azure node');
  if (canonicalSha256(storage.owner) !== canonicalSha256(azureUpgradeBinding(plan).owner))
    throw new Error('Azure Terraform replacement storage ownership differs');
  runtime.requireBootstrapContract('azure');
  requireAzureCeRoutingContract(plan, runtime);
  const release = await acquireProcessLock(`${storage.directory}/.terraform-replacement-lock`);
  try {
    await storage.verify();
    await persistReplacementPlan(plan, storage);
    if (
      plan.relayProfile?.schemaVersion === 2 &&
      plan.relayProfile.retainedDeploymentPlan.relayProfile?.schemaVersion === 2
    ) {
      const predecessor = plan.relayProfile.retainedDeploymentPlan;
      let previous: ReplacementCheckpoint;
      try {
        previous = validateAzureTerraformReplacementCheckpoint(
          predecessor,
          await storage.read(checkpointName(predecessor)),
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT')
          throw Error('Azure relay replacement predecessor execution history is unavailable');
        throw error;
      }
      if (previous.phase !== 'complete')
        throw Error('Azure relay replacement predecessor has not completed its public execution contract');
      const history = new Map<string, unknown>();
      for (const name of azureRelayHistoricalArtifacts)
        history.set(name, await storage.read(`${predecessor.planId}-replacement-${name}`));
      requireAzureRelayHistoricalAcceptance(predecessor, previous.siteUid, history);
      validateAzureTerraformReplacementStageHistory(
        predecessor,
        previous,
        await storage.read(sourceName(predecessor)),
        await loadStageHistory(predecessor, storage),
        digest((await azureTerraformCurrentDeployment(predecessor)).providerLock),
      );
    }
    const deployment = await azureTerraformCurrentDeployment(plan);
    const providerLockSha256 = digest(deployment.providerLock);
    const session = await terraform.open(azureUpgradeBinding(plan).owner, deployment, 'current');
    const guard = networkExecution
      ? await openAzureTerraformNetworkReplacementExecution(plan, storage, session, api, networkExecution, signal)
      : undefined;
    const networkFields = guard
      ? { networkExecutionJournalSha256: guard.journalSha256, networkSourceBindingSha256: guard.sourceBindingSha256 }
      : {};
    const pending = (purpose: 'preflight' | 'final') => ({
      engine: 'terraform' as const,
      planId: plan.planId,
      planSha256: plan.planSha256,
      status: 'operational-acceptance-pending' as const,
      purpose,
      reason: 'current-node-interface-routing-traffic-evidence-unverified',
      ...networkFields,
    });
    let checkpoint: ReplacementCheckpoint;
    let source: string;
    let bootstrap: string;
    let persistedCheckpoint: unknown;
    let snapshot: unknown;
    for (const [name, assign] of [
      [
        checkpointName(plan),
        (value: unknown) => {
          persistedCheckpoint = value;
        },
      ],
      [
        sourceName(plan),
        (value: unknown) => {
          snapshot = value;
        },
      ],
    ] as const) {
      try {
        assign(await storage.read(name));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    if (guard && persistedCheckpoint === undefined && snapshot === undefined) {
      const token = `${plan.deploymentName.slice(0, 40)}-${node}-${plan.planSha256.slice(0, 12)}`;
      const later = [
        `${token}.json`,
        ...[
          'quiesce-plan',
          'launch-plan',
          'quiesce-recovery',
          'launch-recovery',
          'replacement-registration',
          'replacement-final-plan',
          'network-replacement-complete',
        ].map((s) => `${plan.planId}-terraform-${s}.json`),
      ];
      for (const name of later) {
        try {
          await storage.read(name);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
          throw error;
        }
        throw Error(
          'Azure Terraform network replacement original execution source missing after enrollment or stage publication',
        );
      }
    }
    if (persistedCheckpoint !== undefined || snapshot !== undefined) {
      if (snapshot === undefined) throw Error('Azure Terraform replacement private source snapshot is unavailable');
      checkpoint = validateAzureTerraformReplacementCheckpoint(
        plan,
        persistedCheckpoint === undefined ? object(snapshot).preparedCheckpoint : persistedCheckpoint,
      );
      if (guard && checkpoint.phase === 'complete') {
        try {
          await storage.read(azureTerraformNetworkReplacementCompletionName(plan));
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT')
            throw Error('Azure Terraform network replacement complete checkpoint lacks immutable completion');
          throw error;
        }
      }
      ({ source, bootstrap } = validateAzureTerraformReplacementSource(plan, checkpoint, snapshot));
      if (guard) {
        if (
          checkpoint.networkExecutionJournalSha256 !== guard.journalSha256 ||
          checkpoint.networkSourceBindingSha256 !== guard.sourceBindingSha256
        )
          throw Error('Azure Terraform replacement checkpoint owning journal differs');
        const { oldVmIds, ownerPlanSha256ByNode, retainedNics, siteUid, siteConfigurationSha256 } = checkpoint;
        guard.compare(source, { oldVmIds, ownerPlanSha256ByNode, retainedNics, siteUid, siteConfigurationSha256 });
      }
      if (persistedCheckpoint === undefined) {
        // An initial checkpoint write can be lost after the private source is durable.
        // Reuse its bootstrap only while both cloud and desired configuration remain intact.
        if (
          checkpoint.phase !== 'prepared' ||
          (await session.readConfigurationSha256?.()) !== checkpoint.sourceConfigurationSha256
        )
          throw Error('Azure Terraform replacement prepared recovery configuration differs');
        await currentCloudEvidence(plan, checkpoint, api, 'intact', signal);
        await guard?.check(checkpoint.sourceConfigurationSha256, 'intact');
        await storage.write(checkpointName(plan), checkpoint);
      }
    } else {
      const sourceConfigurationSha256 = await session.readConfigurationSha256?.();
      if (!sourceConfigurationSha256)
        throw new Error('Terraform replacement source configuration identity is unavailable');
      source = await session.readConfiguration(sourceConfigurationSha256);
      validateReplacementConfiguration(plan, source);
      const cloud = await initialCloudEvidence(plan, api, signal);
      validateRetainedConfigurationIdentity(plan, source, cloud);
      const binding = azureUpgradeBinding(plan);
      const site = await runtime.observeOwnedSite(binding, signal);
      const siteUid = object(site.system_metadata).uid;
      if (typeof siteUid !== 'string' || !siteUid)
        throw new Error('Azure Terraform replacement site UID is unavailable');
      const siteConfigurationSha256 = canonicalSha256(runtime.ownedSiteConfiguration(binding, site));
      await qualifySource?.(source, { ...cloud, siteUid, siteConfigurationSha256 });
      if (guard) {
        guard.compare(source, { ...cloud, siteUid, siteConfigurationSha256 });
        if (!(await guard.operational(sourceConfigurationSha256, 'intact', 'preflight'))) return pending('preflight');
      }
      const nodeName = `${plan.deploymentName}-${node}`;
      const tokenName = `${plan.deploymentName.slice(0, 40)}-${node}-${plan.planSha256.slice(0, 12)}`;
      bootstrap = await runtime.bootstrap(
        binding,
        nodeName,
        tokenName,
        (secret) => storage.write(`${tokenName}.json`, secret),
        signal,
      );
      await guard?.check(sourceConfigurationSha256, 'intact');
      const built = azureTerraformReplacementStages(plan, source, sourceConfigurationSha256, bootstrap);
      checkpoint = {
        schemaVersion: 1,
        ...networkFields,
        engine: 'terraform',
        planSha256: plan.planSha256,
        node,
        sourceConfigurationSha256,
        quiesceConfigurationSha256: built.quiesce.configurationSha256,
        launchConfigurationSha256: built.launch.configurationSha256,
        bootstrapSha256: digest(bootstrap),
        siteUid,
        siteConfigurationSha256,
        ...cloud,
        phase: 'prepared',
      };
      validateAzureTerraformReplacementCheckpoint(plan, checkpoint);
      await storage.write(sourceName(plan), {
        schemaVersion: 1,
        ...networkFields,
        planSha256: plan.planSha256,
        source,
        bootstrap,
        preparedCheckpoint: structuredClone(checkpoint),
      });
      await storage.write(checkpointName(plan), checkpoint);
    }
    await qualifySource?.(source, checkpoint);
    validateRetainedConfigurationIdentity(plan, source, checkpoint);
    const built = azureTerraformReplacementStages(plan, source, checkpoint.sourceConfigurationSha256, bootstrap);
    if (
      built.quiesce.configurationSha256 !== checkpoint.quiesceConfigurationSha256 ||
      built.launch.configurationSha256 !== checkpoint.launchConfigurationSha256
    )
      throw new Error('Azure Terraform replacement stage configuration changed');
    validateAzureTerraformReplacementStageHistory(
      plan,
      checkpoint,
      await storage.read(sourceName(plan)),
      await loadStageHistory(plan, storage),
      providerLockSha256,
    );
    const enrollment = guard
      ? () =>
          observeAzureTerraformNetworkReplacementEnrollment(
            plan,
            bootstrap,
            checkpoint.bootstrapSha256,
            storage,
            runtime,
            signal,
          )
      : undefined;
    const sealExecution = async () => {
      if (!guard) return;
      const saved = validateAzureTerraformReplacementCheckpoint(plan, await storage.read(checkpointName(plan)));
      if (canonicalSha256(saved) !== canonicalSha256(checkpoint))
        throw Error('Azure Terraform network replacement execution checkpoint changed');
      const packet = await storage.read(sourceName(plan));
      const material = validateAzureTerraformReplacementSource(plan, saved, packet);
      const { oldVmIds, ownerPlanSha256ByNode, retainedNics, siteUid, siteConfigurationSha256 } = saved;
      guard.compare(material.source, {
        oldVmIds,
        ownerPlanSha256ByNode,
        retainedNics,
        siteUid,
        siteConfigurationSha256,
      });
      validateAzureTerraformReplacementStageHistory(
        plan,
        saved,
        packet,
        await loadStageHistory(plan, storage),
        providerLockSha256,
      );
    };
    if (
      guard &&
      checkpoint.phase === 'prepared' &&
      (await session.readConfigurationSha256?.()) === checkpoint.sourceConfigurationSha256
    ) {
      if (!(await guard.operational(checkpoint.sourceConfigurationSha256, 'intact', 'preflight')))
        return pending('preflight');
    }
    if (checkpoint.phase === 'prepared') {
      await applyStage(
        plan,
        session,
        built.quiesce,
        storage,
        api,
        checkpoint,
        env,
        providerLockSha256,
        signal,
        guard,
        enrollment,
      );
      checkpoint.phase = 'quiesced';
      await storage.write(checkpointName(plan), checkpoint);
    }
    let launchEvidence: Awaited<ReturnType<typeof currentCloudEvidence>>;
    if (checkpoint.phase === 'quiesced') {
      launchEvidence = await applyStage(
        plan,
        session,
        built.launch,
        storage,
        api,
        checkpoint,
        env,
        providerLockSha256,
        signal,
        guard,
        enrollment,
      );
      const target = `${plan.deploymentName}-${node}`;
      checkpoint.newVmId = launchEvidence.currentVmIds[target];
      if (!uuid(checkpoint.newVmId)) throw new Error('Azure Terraform replacement VM UUID is unavailable');
      checkpoint.phase = 'launched';
      await storage.write(checkpointName(plan), checkpoint);
    } else {
      launchEvidence = await currentCloudEvidence(plan, checkpoint, api, 'launched', signal);
    }
    const target = `${plan.deploymentName}-${node}`;
    if (lower(launchEvidence.currentVmIds[target]) !== lower(checkpoint.newVmId))
      throw new Error('Azure Terraform replacement VM UUID changed after launch');
    await guard?.check(checkpoint.launchConfigurationSha256, 'launched', checkpoint.newVmId);
    await sealExecution();
    await validateOutputs(plan, session, checkpoint, launchEvidence.currentVmIds, env, signal);
    const binding = azureUpgradeBinding(plan);
    await guard?.check(checkpoint.launchConfigurationSha256, 'launched', checkpoint.newVmId);
    await sealExecution();
    await runtime.approveRegistrations(
      binding,
      launchEvidence.currentVmIds,
      (record) => storage.write(`${plan.planId}-terraform-replacement-registration.json`, record),
      signal,
      binding.nodes,
    );
    const vms = (await listVms(plan, api, signal)) as unknown[];
    const expectedOwners = {
      ...checkpoint.ownerPlanSha256ByNode,
      [target]: plan.planSha256,
    };
    const health = await collectAzurePlatformHealth(
      plan,
      vms,
      runtime,
      signal,
      plan.topology.nodeCount,
      expectedOwners,
    );
    const configuration = await runtime.observeRegisteredConfiguration(
      binding,
      launchEvidence.currentVmIds,
      launchEvidence.expectedInterfaces,
      signal,
    );
    if (health.status !== 'healthy' || configuration.status !== 'configured')
      throw new Error('Azure Terraform replacement registration or configuration has not converged');
    const site = await runtime.observeOwnedSite(binding, signal);
    if (
      object(site.system_metadata).uid !== checkpoint.siteUid ||
      canonicalSha256(runtime.ownedSiteConfiguration(binding, site)) !== checkpoint.siteConfigurationSha256
    )
      throw new Error('Azure Terraform replacement changed the logical site identity or configuration');
    await guard?.check(checkpoint.launchConfigurationSha256, 'launched', checkpoint.newVmId);
    await sealExecution();
    let routing: 'healthy' | 'unknown' = 'unknown';
    if (plan.routing.mode === 'route-server') {
      const evidence = plan.relayProfile
        ? await configureAzureSelectedRelayRouting(
            plan,
            launchEvidence.expectedInterfaces,
            runtime as CeRuntime,
            storage,
            api,
            signal,
          )
        : await configureAzureRouteServerRouting(
            plan,
            launchEvidence.expectedInterfaces,
            runtime as CeRuntime,
            storage,
            api,
            signal,
            checkpoint.routeServer,
          );
      if (evidence.status !== 'healthy') throw new Error('Azure replacement Route Server routing has not converged');
      routing = 'healthy';
    }
    let traffic: 'unknown' | { status: 'healthy' } = 'unknown';
    let ingress: unknown;
    if (plan.intent.ingress?.mode === 'platform-http') {
      if (!acceptIngress) throw new Error('Azure Terraform replacement ingress acceptance driver is unavailable');
      ({ ingress, traffic } = await acceptIngress());
    }
    const finalOperational = guard
      ? await guard.operational(checkpoint.launchConfigurationSha256, 'launched', 'final', checkpoint.newVmId)
      : undefined;
    if (guard && !finalOperational) return pending('final');
    await sealExecution();
    const final = guard
      ? await planAzureTerraformReplacementFinalRefresh(
          plan,
          storage,
          session,
          {
            journalSha256: guard.journalSha256,
            sourceBindingSha256: guard.sourceBindingSha256,
            checkpointSha256: canonicalSha256({ ...checkpoint, phase: 'complete' }),
            configurationSha256: checkpoint.launchConfigurationSha256,
            providerLockSha256,
          },
          env,
          signal,
        )
      : await session.plan(env, signal);
    validateAzureTerraformReplacementStageReceipt(plan, built.launch, final, providerLockSha256);
    if (!final.noChanges || final.changes.some((change) => change.actions.join(',') !== 'no-op'))
      throw new Error('Azure Terraform replacement requires a final refresh-enabled no-change plan');
    await guard?.check(checkpoint.launchConfigurationSha256, 'launched', checkpoint.newVmId);
    await sealExecution();
    const refreshInventorySha256 =
      guard && networkExecution
        ? await publishAzureTerraformReplacementRefreshInventory(
            plan,
            storage,
            session,
            networkExecution,
            final,
            signal,
          )
        : undefined;
    await storage.write(`${plan.planId}-terraform-replacement-final-plan.json`, final);
    if (
      guard &&
      canonicalSha256(await storage.read(`${plan.planId}-terraform-replacement-final-plan.json`)) !==
        canonicalSha256(final)
    )
      throw Error('Azure Terraform network replacement final plan changed at publication');
    await guard?.check(checkpoint.launchConfigurationSha256, 'launched', checkpoint.newVmId);
    await sealExecution();
    const completion =
      guard && networkExecution && finalOperational
        ? await publishAzureTerraformNetworkReplacementCompletion(
            plan,
            storage,
            session,
            networkExecution,
            finalOperational,
            final,
            signal,
          )
        : undefined;
    if (completion) {
      await guard?.check(checkpoint.launchConfigurationSha256, 'launched', checkpoint.newVmId);
      await sealExecution();
      if (
        canonicalSha256(await storage.read(azureTerraformNetworkReplacementCompletionName(plan))) !==
          completion.completionSha256 ||
        canonicalSha256({ ...checkpoint, phase: 'complete' }) !== completion.checkpointSha256
      )
        throw Error('Azure Terraform network replacement completion changed before final checkpoint');
    }
    checkpoint.phase = 'complete';
    await storage.write(checkpointName(plan), checkpoint);
    if (
      completion &&
      (canonicalSha256(await storage.read(checkpointName(plan))) !== completion.checkpointSha256 ||
        canonicalSha256(await storage.read(azureTerraformNetworkReplacementCompletionName(plan))) !==
          completion.completionSha256)
    )
      throw Error('Azure Terraform network replacement completion changed at checkpoint publication');
    return {
      planId: plan.planId,
      planSha256: plan.planSha256,
      engine: 'terraform' as const,
      status: 'complete' as const,
      replacedNode: node,
      oldVmId: checkpoint.oldVmIds[target],
      newVmId: checkpoint.newVmId,
      retainedInterfaces: Object.values(checkpoint.retainedNics).map(({ resourceId, subnetId, mac, privateIp }) => ({
        resourceId,
        subnetId,
        mac,
        privateIp,
      })),
      siteUid: checkpoint.siteUid,
      health,
      configuration,
      routing,
      traffic,
      ...(ingress ? { ingress } : {}),
      terraformNoChanges: true as const,
      ...(completion ? { networkReplacementCompletionSha256: completion.completionSha256 } : {}),
      ...(refreshInventorySha256 ? { networkReplacementRefreshInventorySha256: refreshInventorySha256 } : {}),
    };
  } catch (error) {
    if (error instanceof AzureTerraformNetworkReplacementCompletionUnavailable)
      return {
        engine: 'terraform' as const,
        planId: plan.planId,
        planSha256: plan.planSha256,
        status: 'completion-pending' as const,
        reason: 'saved-completion-operational-provenance-unavailable',
        networkExecutionJournalSha256: networkExecution?.journalSha256,
        networkSourceBindingSha256: networkExecution?.sourceBindingSha256,
      };
    if (
      !(error instanceof NetworkReplacementOperationalPending) &&
      !(error instanceof NetworkReplacementEnrollmentPending)
    )
      throw error;
    return {
      engine: 'terraform' as const,
      planId: plan.planId,
      planSha256: plan.planSha256,
      status:
        error instanceof NetworkReplacementEnrollmentPending
          ? ('enrollment-pending' as const)
          : ('operational-acceptance-pending' as const),
      purpose: 'preflight' as const,
      reason:
        error instanceof NetworkReplacementEnrollmentPending
          ? 'saved-current-enrollment-unverified'
          : 'current-node-interface-routing-traffic-evidence-unverified',
      networkExecutionJournalSha256: networkExecution?.journalSha256,
      networkSourceBindingSha256: networkExecution?.sourceBindingSha256,
    };
  } finally {
    await release();
  }
}
