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
import { type AzureRouteServerOwnership, captureAzureRouteServerOwnership } from './route-server-health';
import { configureAzureRouteServerRouting } from './routing-workflow';
import { azureTerraformCurrentDeployment } from './terraform-foundation';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

type Json = Record<string, unknown>;
type Phase = 'prepared' | 'quiesced' | 'launched' | 'complete';

interface RetainedNic {
  resourceId: string;
  subnetId: string;
  mac: string;
  privateIp: string;
  ownerPlanSha256: string;
}

interface ReplacementCheckpoint {
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
  newVmId?: string;
}

interface ReplacementStage {
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

function stages(plan: AzureCePlan, source: string, sourceSha256: string, bootstrap: string) {
  verifyAzureCePlan(plan);
  const node = selectedNode(plan);
  if (digest(source) !== sourceSha256) throw new Error('Azure Terraform replacement source configuration changed');
  validateBootstrap(bootstrap);
  const original = object(JSON.parse(source));
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

function validateStageReceipt(plan: AzureCePlan, stage: ReplacementStage, receipt: PlanReceipt): void {
  const nonNoop = receipt.changes.filter((change) => change.actions.join(',') !== 'no-op');
  if (
    receipt.schemaVersion !== 1 ||
    receipt.engine !== 'terraform' ||
    receipt.deploymentId !== plan.deploymentName ||
    receipt.backendIdentity !== `local:${plan.deploymentName}` ||
    receipt.configurationSha256 !== stage.configurationSha256 ||
    receipt.operation !== undefined ||
    receipt.actionInvocations?.length ||
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
      (node === selected && ownerPlanSha256 !== deleteAction?.expectedOwnerPlanSha256)
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
        !/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(mac) ||
        typeof privateIp !== 'string' ||
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
  const routeServer =
    plan.routing.mode === 'route-server' ? await captureAzureRouteServerOwnership(plan, api, signal) : undefined;
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
  const expectedInterfaces: Array<{ node: string; role: 'slo' | 'sli'; mac: string }> = [];
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
        tags['xcsh-managed-by'] !== 'azure-ce' ||
        tags['xcsh-execution-engine'] !== 'terraform' ||
        tags['xcsh-deployment-id'] !== plan.deploymentName ||
        tags['xcsh-plan-sha256'] !== expected.ownerPlanSha256 ||
        lower(value.macAddress).replaceAll('-', ':') !== expected.mac ||
        config.privateIPAddress !== expected.privateIp ||
        lower(object(config.subnet).id) !== lower(expected.subnetId)
      )
        throw new Error('Azure Terraform retained NIC identity, attachment, or address changed');
      if (nic.role === 'slo' || nic.role === 'sli')
        expectedInterfaces.push({ node: name, role: nic.role, mac: expected.mac });
    }
  }
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

function validateCheckpoint(plan: AzureCePlan, value: unknown): ReplacementCheckpoint {
  const checkpoint = object(value) as unknown as ReplacementCheckpoint;
  const nodes = Array.from({ length: plan.topology.nodeCount }, (_, index) => `${plan.deploymentName}-${index + 1}`);
  const nicKeys = nodes.flatMap((_name, index) => plan.nics.map((nic) => `${index + 1}:${nic.index}`));
  if (
    checkpoint.schemaVersion !== 1 ||
    checkpoint.engine !== 'terraform' ||
    checkpoint.planSha256 !== plan.planSha256 ||
    checkpoint.node !== selectedNode(plan) ||
    !['prepared', 'quiesced', 'launched', 'complete'].includes(checkpoint.phase) ||
    [
      checkpoint.sourceConfigurationSha256,
      checkpoint.quiesceConfigurationSha256,
      checkpoint.launchConfigurationSha256,
      checkpoint.bootstrapSha256,
      checkpoint.siteConfigurationSha256,
    ].some((item) => !/^[a-f0-9]{64}$/.test(item)) ||
    !checkpoint.siteUid ||
    Object.keys(checkpoint.oldVmIds).sort().join(',') !== [...nodes].sort().join(',') ||
    Object.keys(checkpoint.ownerPlanSha256ByNode).sort().join(',') !== [...nodes].sort().join(',') ||
    Object.keys(checkpoint.retainedNics).sort().join(',') !== [...nicKeys].sort().join(',') ||
    Object.values(checkpoint.oldVmIds).some((item) => !uuid(item)) ||
    Object.values(checkpoint.ownerPlanSha256ByNode).some((item) => !/^[a-f0-9]{64}$/.test(item)) ||
    nicKeys.some((key) => {
      const nic = checkpoint.retainedNics[key];
      const [node, index] = key.split(':').map(Number);
      return (
        !nic ||
        lower(nic.resourceId) !== lower(nicResourceId(plan, node, index)) ||
        !lower(nic.subnetId).startsWith(`/subscriptions/${plan.subscription.id}/`.toLowerCase()) ||
        !/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(nic.mac) ||
        typeof nic.privateIp !== 'string' ||
        !/^[a-f0-9]{64}$/.test(nic.ownerPlanSha256)
      );
    }) ||
    (plan.routing.mode === 'route-server') !== Boolean(checkpoint.routeServer) ||
    (checkpoint.routeServer !== undefined &&
      (lower(checkpoint.routeServer.routeServerId) !==
        lower(
          `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Network/virtualHubs/${plan.deploymentName}-rs`,
        ) ||
        !/^[a-f0-9]{64}$/.test(checkpoint.routeServer.ownerPlanSha256) ||
        Object.keys(checkpoint.routeServer.peerIds).sort().join(',') !==
          Array.from({ length: plan.topology.nodeCount }, (_, index) => String(index + 1)).join(',') ||
        Object.entries(checkpoint.routeServer.peerIds).some(
          ([node, id]) =>
            lower(id) !==
            lower(`${checkpoint.routeServer?.routeServerId}/bgpConnections/${plan.deploymentName}-${node}`),
        ))) ||
    (checkpoint.phase === 'prepared' || checkpoint.phase === 'quiesced'
      ? checkpoint.newVmId !== undefined
      : !uuid(checkpoint.newVmId)) ||
    (checkpoint.newVmId !== undefined &&
      lower(checkpoint.newVmId) === lower(checkpoint.oldVmIds[`${plan.deploymentName}-${checkpoint.node}`]))
  )
    throw new Error('Azure Terraform replacement checkpoint differs from the immutable plan');
  return checkpoint;
}

async function applyStage(
  plan: AzureCePlan,
  session: TerraformSession,
  stage: ReplacementStage,
  storage: CeDeploymentStore,
  api: AzExecApi,
  checkpoint: ReplacementCheckpoint,
  env: Record<string, string | undefined>,
  signal?: AbortSignal,
) {
  const evidencePhase = stage.phase === 'quiesce' ? 'quiesced' : 'launched';
  let currentSha256 = await session.readConfigurationSha256?.();
  if (!currentSha256) throw new Error('Terraform replacement configuration identity is unavailable');
  const receiptName = `${plan.planId}-terraform-${stage.phase}-plan.json`;
  if (currentSha256 === stage.configurationSha256) {
    try {
      const previous = object(await storage.read(receiptName));
      const receipt = previous.receipt as PlanReceipt;
      validateStageReceipt(plan, stage, receipt);
      const evidence = await currentCloudEvidence(plan, checkpoint, api, evidencePhase, signal);
      await session.reconcileApplyFromEvidence(receipt, canonicalSha256(evidence));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        if (!(error instanceof Error) || !error.message.includes('has not converged')) throw error;
      }
    }
  } else if (currentSha256 === stage.previousConfigurationSha256) {
    await currentCloudEvidence(plan, checkpoint, api, stage.phase === 'quiesce' ? 'intact' : 'quiesced', signal);
    await session.reviseConfiguration(currentSha256, stage.configuration);
    currentSha256 = stage.configurationSha256;
  } else {
    throw new Error('Terraform replacement configuration differs from the persisted stage');
  }
  const receipt = await session.plan(env, signal);
  validateStageReceipt(plan, stage, receipt);
  const identities = await session.readPlannedResourceIds(receipt, [stage.address], env, signal);
  const expectedId = vmResourceId(plan, selectedNode(plan));
  if (
    (!receipt.noChanges && stage.phase === 'quiesce' && lower(identities[stage.address]) !== lower(expectedId)) ||
    (!receipt.noChanges && stage.phase === 'launch' && identities[stage.address] !== null)
  )
    throw new Error('Azure Terraform replacement saved plan targets a different VM identity');
  await storage.write(receiptName, { receipt, identities });
  if (!receipt.noChanges) {
    try {
      await session.apply(receipt, env, signal);
    } catch {
      const evidence = await currentCloudEvidence(plan, checkpoint, api, evidencePhase, signal);
      await storage.write(`${plan.planId}-terraform-${stage.phase}-recovery.json`, evidence);
      await session.reconcileApplyFromEvidence(receipt, canonicalSha256(evidence));
      return evidence;
    }
  }
  return currentCloudEvidence(plan, checkpoint, api, evidencePhase, signal);
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
    | 'approveRegistrations'
    | 'observeHealth'
    | 'observeRegistrations'
    | 'observeRegisteredConfiguration'
    | 'observeOwnedSite'
    | 'ownedSiteConfiguration'
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
) {
  verifyAzureCePlan(plan);
  const node = selectedNode(plan);
  if (runtime.engine !== 'terraform' || storage.owner.engine !== 'terraform')
    throw new Error('Only the owning Terraform engine may replace an Azure node');
  if (canonicalSha256(storage.owner) !== canonicalSha256(azureUpgradeBinding(plan).owner))
    throw new Error('Azure Terraform replacement storage ownership differs');
  runtime.requireBootstrapContract('azure');
  if (plan.routing.mode === 'route-server') runtime.requireRoutingContract('azure');
  const release = await acquireProcessLock(`${storage.directory}/.terraform-replacement-lock`);
  try {
    await storage.verify();
    const session = await terraform.open(
      azureUpgradeBinding(plan).owner,
      await azureTerraformCurrentDeployment(plan),
      'current',
    );
    let checkpoint: ReplacementCheckpoint;
    let source: string;
    let bootstrap: string;
    try {
      checkpoint = validateCheckpoint(plan, await storage.read(checkpointName(plan)));
      const snapshot = object(await storage.read(sourceName(plan)));
      if (
        snapshot.planSha256 !== plan.planSha256 ||
        typeof snapshot.source !== 'string' ||
        typeof snapshot.bootstrap !== 'string' ||
        digest(snapshot.source) !== checkpoint.sourceConfigurationSha256 ||
        digest(snapshot.bootstrap) !== checkpoint.bootstrapSha256
      )
        throw new Error('Azure Terraform replacement private source snapshot differs');
      source = snapshot.source;
      bootstrap = snapshot.bootstrap;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      const sourceConfigurationSha256 = await session.readConfigurationSha256?.();
      if (!sourceConfigurationSha256)
        throw new Error('Terraform replacement source configuration identity is unavailable');
      source = await session.readConfiguration(sourceConfigurationSha256);
      const cloud = await initialCloudEvidence(plan, api, signal);
      const binding = azureUpgradeBinding(plan);
      const site = await runtime.observeOwnedSite(binding, signal);
      const siteUid = object(site.system_metadata).uid;
      if (typeof siteUid !== 'string' || !siteUid)
        throw new Error('Azure Terraform replacement site UID is unavailable');
      const siteConfigurationSha256 = canonicalSha256(runtime.ownedSiteConfiguration(binding, site));
      const nodeName = `${plan.deploymentName}-${node}`;
      const tokenName = `${plan.deploymentName.slice(0, 40)}-${node}-${plan.planSha256.slice(0, 12)}`;
      bootstrap = await runtime.bootstrap(
        binding,
        nodeName,
        tokenName,
        (secret) => storage.write(`${tokenName}.json`, secret),
        signal,
      );
      const built = stages(plan, source, sourceConfigurationSha256, bootstrap);
      checkpoint = {
        schemaVersion: 1,
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
      await storage.write(sourceName(plan), { schemaVersion: 1, planSha256: plan.planSha256, source, bootstrap });
      await storage.write(checkpointName(plan), checkpoint);
    }
    const built = stages(plan, source, checkpoint.sourceConfigurationSha256, bootstrap);
    if (
      built.quiesce.configurationSha256 !== checkpoint.quiesceConfigurationSha256 ||
      built.launch.configurationSha256 !== checkpoint.launchConfigurationSha256
    )
      throw new Error('Azure Terraform replacement stage configuration changed');
    if (checkpoint.phase === 'prepared') {
      await applyStage(plan, session, built.quiesce, storage, api, checkpoint, env, signal);
      checkpoint.phase = 'quiesced';
      await storage.write(checkpointName(plan), checkpoint);
    }
    let launchEvidence: Awaited<ReturnType<typeof currentCloudEvidence>>;
    if (checkpoint.phase === 'quiesced') {
      launchEvidence = await applyStage(plan, session, built.launch, storage, api, checkpoint, env, signal);
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
    await validateOutputs(plan, session, checkpoint, launchEvidence.currentVmIds, env, signal);
    const binding = azureUpgradeBinding(plan);
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
    let routing: 'healthy' | 'unknown' = 'unknown';
    if (plan.routing.mode === 'route-server') {
      const evidence = await configureAzureRouteServerRouting(
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
    const final = await session.plan(env, signal);
    validateStageReceipt(plan, built.launch, final);
    if (!final.noChanges || final.changes.some((change) => change.actions.join(',') !== 'no-op'))
      throw new Error('Azure Terraform replacement requires a final refresh-enabled no-change plan');
    await storage.write(`${plan.planId}-terraform-replacement-final-plan.json`, final);
    checkpoint.phase = 'complete';
    await storage.write(checkpointName(plan), checkpoint);
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
    };
  } finally {
    await release();
  }
}
