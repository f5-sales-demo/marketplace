import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { AzExecApi } from '../az/exec';
import { collectAzurePlatformHealth } from './platform-health';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCeAction, AzureCePlan } from './types';

export interface NativeWorkflowCheckpoint {
  schemaVersion: 1;
  engine: 'native';
  planSha256: string;
  siteReserved: boolean;
  bootstrapByNode: Record<string, string>;
  launchedAtByNode: Record<string, string>;
}

const checkpointName = (plan: AzureCePlan) => `native-admission-${plan.planSha256}.json`;

async function readCheckpoint(
  plan: AzureCePlan,
  storage: Pick<CeDeploymentStore, 'read' | 'write'>,
): Promise<NativeWorkflowCheckpoint> {
  let checkpoint: NativeWorkflowCheckpoint;
  try {
    checkpoint = (await storage.read(checkpointName(plan))) as NativeWorkflowCheckpoint;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    checkpoint = {
      schemaVersion: 1,
      engine: 'native',
      planSha256: plan.planSha256,
      siteReserved: false,
      bootstrapByNode: {},
      launchedAtByNode: {},
    };
    await storage.write(checkpointName(plan), checkpoint);
  }
  const bootstrappedNodes = Object.keys(checkpoint.bootstrapByNode);
  const launchedNodes = Object.keys(checkpoint.launchedAtByNode);
  if (
    checkpoint.schemaVersion !== 1 ||
    checkpoint.engine !== 'native' ||
    checkpoint.planSha256 !== plan.planSha256 ||
    typeof checkpoint.siteReserved !== 'boolean' ||
    !checkpoint.bootstrapByNode ||
    typeof checkpoint.bootstrapByNode !== 'object' ||
    Object.entries(checkpoint.bootstrapByNode).some(
      ([node, bootstrap], index) =>
        !/^[1-3]$/.test(node) ||
        Number(node) > plan.topology.nodeCount ||
        Number(node) !== index + 1 ||
        typeof bootstrap !== 'string' ||
        !bootstrap.startsWith('#cloud-config') ||
        !bootstrap.includes('/etc/vpm/user_data') ||
        /__\w+__/.test(bootstrap),
    ) ||
    !checkpoint.launchedAtByNode ||
    typeof checkpoint.launchedAtByNode !== 'object' ||
    Object.entries(checkpoint.launchedAtByNode).some(
      ([node, launchedAt], index) =>
        Number(node) !== index + 1 || !checkpoint.bootstrapByNode[node] || Number.isNaN(Date.parse(launchedAt)),
    ) ||
    launchedNodes.length > bootstrappedNodes.length ||
    (plan.intent.operation === 'deploy' && bootstrappedNodes.length > 0 && !checkpoint.siteReserved)
  )
    throw new Error('Azure native admission checkpoint differs from the owning plan');
  return checkpoint;
}

const waitUntil = async (notBefore: number, signal?: AbortSignal) => {
  const remaining = notBefore - Date.now();
  if (remaining <= 0) return;
  await new Promise<void>((resolve, reject) => {
    const aborted = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error('Azure native HA admission cancelled'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', aborted);
      resolve();
    }, remaining);
    signal?.addEventListener('abort', aborted, { once: true });
    if (signal?.aborted) aborted();
  });
};

export async function prepareAzureNativeAdmission(
  plan: AzureCePlan,
  runtime: Pick<CeRuntime, 'engine' | 'requireBootstrapContract' | 'reserveSite'>,
  storage: Pick<CeDeploymentStore, 'read' | 'write' | 'verify'>,
  signal?: AbortSignal,
) {
  if (plan.engine !== 'native' || runtime.engine !== 'native')
    throw new Error('Azure native workflow requires native ownership');
  if (plan.intent.operation === 'replace-node')
    throw new Error('Azure node replacement requires coupled VM and site replacement evidence before deletion');
  if (plan.actions.some((action) => action.requiresBootstrap)) runtime.requireBootstrapContract('azure');
  await storage.verify();
  const checkpoint = await readCheckpoint(plan, storage);
  if (plan.intent.operation === 'deploy') {
    await runtime.reserveSite(azureUpgradeBinding(plan), (record) => storage.write('native-site.json', record), signal);
    checkpoint.siteReserved = true;
    await storage.write(checkpointName(plan), checkpoint);
  }
  return checkpoint;
}

export async function azureNativeBootstrapForAction(
  plan: AzureCePlan,
  action: AzureCeAction,
  checkpoint: NativeWorkflowCheckpoint,
  runtime: Pick<CeRuntime, 'bootstrap'>,
  storage: Pick<CeDeploymentStore, 'write' | 'verify'>,
  signal?: AbortSignal,
  haSerialDelayMs = 180_000,
): Promise<string> {
  if (!action.requiresBootstrap || !action.node) throw new Error('Azure bootstrap action identity is unavailable');
  const node = String(action.node);
  if (plan.topology.ha && action.node > 1) {
    const previous = checkpoint.launchedAtByNode[String(action.node - 1)];
    if (!previous) throw new Error('Prior Azure HA node launch boundary is unavailable');
    await waitUntil(Date.parse(previous) + haSerialDelayMs, signal);
  }
  await storage.verify();
  if (!checkpoint.bootstrapByNode[node]) {
    const nodeName = `${plan.deploymentName}-${node}`;
    const tokenName = `${plan.deploymentName.slice(0, 40)}-${node}-${plan.planSha256.slice(0, 12)}`;
    checkpoint.bootstrapByNode[node] = await runtime.bootstrap(
      azureUpgradeBinding(plan),
      nodeName,
      tokenName,
      (secret) => storage.write(`${tokenName}.json`, secret),
      signal,
    );
    await storage.write(checkpointName(plan), checkpoint);
  }
  return checkpoint.bootstrapByNode[node];
}

export async function recordAzureNativeLaunch(
  plan: AzureCePlan,
  node: number,
  checkpoint: NativeWorkflowCheckpoint,
  storage: Pick<CeDeploymentStore, 'write'>,
): Promise<void> {
  checkpoint.launchedAtByNode[String(node)] ??= new Date().toISOString();
  await storage.write(checkpointName(plan), checkpoint);
}

export async function withAzureNativeBootstrapFile<T>(
  bootstrap: string,
  run: (path: string) => Promise<T>,
): Promise<T> {
  if (!bootstrap.startsWith('#cloud-config') || !bootstrap.includes('/etc/vpm/user_data') || /__\w+__/.test(bootstrap))
    throw new Error('Azure native admission requires resolved platform cloud-init');
  const directory = await mkdtemp(join(tmpdir(), 'xcsh-azure-ce-'));
  await chmod(directory, 0o700);
  const path = join(directory, 'cloud-init.yaml');
  try {
    await writeFile(path, bootstrap, { mode: 0o600, flag: 'wx' });
    return await run(path);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function collectAzureNativeVmState(
  plan: AzureCePlan,
  action: AzureCeAction,
  api: AzExecApi,
  signal?: AbortSignal,
) {
  if (
    action.kind !== 'vm-state-gate' ||
    !action.node ||
    !action.expectedPowerState ||
    !action.expectedOwnerPlanSha256 ||
    !/^[a-f0-9]{64}$/.test(action.expectedOwnerPlanSha256) ||
    action.mutates ||
    action.command ||
    action.args
  )
    throw new Error('Azure VM state gate is malformed');
  const name = `${plan.deploymentName}-${action.node}`;
  const vm = plan.actions.filter((candidate) => candidate.kind === 'vm-create' && candidate.node === action.node);
  const resourceId =
    vm.length === 1 && vm[0].resourceId
      ? vm[0].resourceId
      : `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Compute/virtualMachines/${name}`;
  signal?.throwIfAborted();
  const result = await api.exec(
    'az',
    ['vm', 'show', '--ids', resourceId, '--show-details', '--subscription', plan.subscription.id, '--output', 'json'],
    signal ? { signal } : undefined,
  );
  signal?.throwIfAborted();
  if (result.exitCode !== 0) throw new Error('Azure VM state observation unavailable');
  let value: {
    id?: unknown;
    name?: unknown;
    location?: unknown;
    provisioningState?: unknown;
    powerState?: unknown;
    hardwareProfile?: { vmSize?: unknown };
    tags?: Record<string, unknown>;
  };
  try {
    value = JSON.parse(result.stdout);
  } catch {
    throw new Error('Malformed Azure VM state observation');
  }
  const powerState =
    typeof value.powerState === 'string' ? value.powerState.toLowerCase().replace(/^vm\s+/, '') : 'unknown';
  const tags = value.tags;
  if (
    typeof value.id !== 'string' ||
    value.id.toLowerCase() !== resourceId.toLowerCase() ||
    value.name !== name ||
    typeof value.location !== 'string' ||
    value.location.toLowerCase() !== plan.region.toLowerCase() ||
    value.provisioningState !== 'Succeeded' ||
    tags?.['xcsh-managed-by'] !== 'azure-ce' ||
    tags?.['xcsh-deployment-id'] !== plan.deploymentName ||
    tags?.['xcsh-execution-engine'] !== plan.engine ||
    tags?.['xcsh-plan-sha256'] !== action.expectedOwnerPlanSha256
  )
    throw new Error('Azure VM state identity or ownership differs');
  return {
    planId: plan.planId,
    planSha256: plan.planSha256,
    engine: plan.engine,
    subscriptionId: plan.subscription.id,
    region: plan.region,
    deploymentId: plan.deploymentName,
    node: action.node,
    resourceId,
    source: 'azure-cli-live' as const,
    observedAt: new Date().toISOString(),
    expectedPowerState: action.expectedPowerState,
    ownerPlanSha256: action.expectedOwnerPlanSha256,
    expectedVmSize: action.expectedVmSize,
    vmSize: typeof value.hardwareProfile?.vmSize === 'string' ? value.hardwareProfile.vmSize : 'unknown',
    powerState,
    status:
      powerState === action.expectedPowerState &&
      (action.expectedVmSize === undefined || value.hardwareProfile?.vmSize === action.expectedVmSize)
        ? ('healthy' as const)
        : ('degraded' as const),
  };
}

export async function listAzureNativeVms(plan: AzureCePlan, api: AzExecApi): Promise<unknown[]> {
  const result = await api.exec('az', [
    'vm',
    'list',
    '--resource-group',
    plan.intent.resourceGroup,
    '--show-details',
    '--subscription',
    plan.subscription.id,
    '--output',
    'json',
  ]);
  if (result.exitCode !== 0) throw new Error('Azure VM identity observation unavailable');
  let value: unknown;
  try {
    value = JSON.parse(result.stdout);
  } catch {
    throw new Error('Malformed Azure VM identity observation');
  }
  if (!Array.isArray(value)) throw new Error('Incomplete Azure VM identity observation');
  return value;
}

export async function collectAzureNativeAdmissionHealth(
  plan: AzureCePlan,
  admittedNodeCount: number,
  api: AzExecApi,
  runtime: Pick<
    CeRuntime,
    'approveRegistrations' | 'observeHealth' | 'observeRegistrations' | 'observeRegisteredConfiguration'
  >,
  storage: Pick<CeDeploymentStore, 'write' | 'verify'>,
  signal?: AbortSignal,
) {
  await storage.verify();
  const vms = await listAzureNativeVms(plan, api);
  const admittedNodes = Array.from({ length: admittedNodeCount }, (_, index) => `${plan.deploymentName}-${index + 1}`);
  const scope =
    `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Compute/virtualMachines/`.toLowerCase();
  const instances = Object.fromEntries(
    admittedNodes.map((node) => {
      const matches = vms.filter(
        (vm) =>
          vm &&
          typeof vm === 'object' &&
          typeof (vm as { id?: unknown }).id === 'string' &&
          (vm as { id: string }).id.toLowerCase() === scope + node.toLowerCase(),
      );
      if (matches.length !== 1) throw new Error('Azure admitted VM identity is missing or ambiguous');
      const vmId = (matches[0] as { vmId?: unknown }).vmId;
      if (typeof vmId !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(vmId))
        throw new Error('Azure admitted VM UUID is unavailable');
      return [node, vmId];
    }),
  );
  const binding = azureUpgradeBinding(plan);
  await runtime.approveRegistrations(
    binding,
    instances,
    (record) => storage.write(`native-registration-node-${admittedNodeCount}.json`, record),
    signal,
    admittedNodes,
  );
  const health = await collectAzurePlatformHealth(plan, vms, runtime, signal, admittedNodeCount);
  if (admittedNodeCount !== plan.topology.nodeCount) return health;
  const expectedInterfaces: Array<{ node: string; role: 'slo' | 'sli'; mac: string }> = [];
  for (const node of admittedNodes)
    for (const nic of plan.nics.filter((item) => item.role === 'slo' || item.role === 'sli')) {
      const name = `${node}-nic${nic.index}`;
      const result = await api.exec('az', [
        'network',
        'nic',
        'show',
        '--resource-group',
        plan.intent.resourceGroup,
        '--name',
        name,
        '--subscription',
        plan.subscription.id,
        '--output',
        'json',
      ]);
      if (result.exitCode !== 0) throw new Error('Azure NIC identity observation unavailable');
      let value: {
        id?: unknown;
        macAddress?: unknown;
        provisioningState?: unknown;
        virtualMachine?: { id?: unknown };
        tags?: Record<string, unknown>;
      };
      try {
        value = JSON.parse(result.stdout);
      } catch {
        throw new Error('Malformed Azure NIC identity observation');
      }
      const expectedId = `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Network/networkInterfaces/${name}`;
      const expectedVm = `${scope}${node}`;
      const tags = value.tags;
      const rawMac = typeof value.macAddress === 'string' ? value.macAddress.replaceAll('-', ':').toLowerCase() : '';
      if (
        typeof value.id !== 'string' ||
        value.id.toLowerCase() !== expectedId.toLowerCase() ||
        value.provisioningState !== 'Succeeded' ||
        typeof value.virtualMachine?.id !== 'string' ||
        value.virtualMachine.id.toLowerCase() !== expectedVm ||
        tags?.['xcsh-managed-by'] !== 'azure-ce' ||
        tags?.['xcsh-deployment-id'] !== plan.deploymentName ||
        tags?.['xcsh-execution-engine'] !== plan.engine ||
        tags?.['xcsh-plan-sha256'] !== plan.planSha256 ||
        !/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(rawMac)
      )
        throw new Error('Azure NIC ownership or MAC binding is unavailable');
      expectedInterfaces.push({ node, role: nic.role as 'slo' | 'sli', mac: rawMac });
    }
  const configuration = await runtime.observeRegisteredConfiguration(binding, instances, expectedInterfaces, signal);
  return {
    ...health,
    configuration,
    status: health.status === 'healthy' && configuration.status === 'configured' ? 'healthy' : 'unknown',
  };
}
