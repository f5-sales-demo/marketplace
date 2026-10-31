import { isIP } from 'node:net';
import type { AzExecApi } from '../az/exec';
import type { AzureCePlan } from './types';

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const lower = (value: unknown) => (typeof value === 'string' ? value.toLowerCase() : '');
const uuid = (value: unknown) =>
  typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);

export interface AzureTerraformInterface {
  resourceId: string;
  subnetId: string;
  vmResourceId: string;
  vmId: string;
  siteName: string;
  node: number;
  index: number;
  role: AzureCePlan['nics'][number]['role'];
  mac: string;
  privateIp: string;
}

/** Post-attachment discovery. Terraform locates resources; current Azure reads bind their identities.
 * Missing MAC/address observations remain unavailable, including during initial VM admission.
 * Cloud attachment indices do not assert guest device names or platform interface identities.
 */
export async function discoverAzureTerraformInterfaces(
  plan: AzureCePlan,
  outputs: Record<string, unknown>,
  api: AzExecApi,
  signal?: AbortSignal,
) {
  if (plan.engine !== 'terraform') throw new Error('Azure interface discovery requires Terraform ownership');
  const observedAt = new Date().toISOString();
  const run = async (args: string[]) => {
    signal?.throwIfAborted();
    const result = await api.exec('az', [...args, '--subscription', plan.subscription.id, '--output', 'json'], {
      signal,
    });
    signal?.throwIfAborted();
    if (result.exitCode !== 0) throw new Error('Azure Terraform interface observation unavailable');
    let value: Record<string, unknown>;
    try {
      value = object(JSON.parse(result.stdout));
    } catch {
      throw new Error('Malformed Azure Terraform interface observation');
    }
    if (!Object.keys(value).length || value.nextLink)
      throw new Error('Incomplete Azure Terraform interface observation');
    return value;
  };
  const account = await run(['account', 'show']);
  if (
    lower(account.id) !== lower(plan.subscription.id) ||
    lower(account.tenantId) !== lower(plan.subscription.tenantId) ||
    account.environmentName !== plan.subscription.cloud ||
    account.state !== 'Enabled'
  )
    throw new Error('Azure Terraform observation account differs from deployment');
  const scope = `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/`;
  const instances = object(outputs.ce_instances);
  const candidates = object(outputs.ce_interfaces);
  if (
    ![1, 3].includes(plan.topology.nodeCount) ||
    plan.nics.length < 1 ||
    plan.nics.some((nic, index) => nic.index !== index) ||
    Object.keys(instances).length !== plan.topology.nodeCount ||
    Object.keys(candidates).length !== plan.topology.nodeCount * plan.nics.length
  )
    throw new Error('Terraform Azure node/interface inventory is incomplete');
  const owned = async (kind: 'nic' | 'vm', id: string) => {
    if (!lower(id).startsWith(lower(scope))) throw new Error('Terraform Azure resource is outside deployment scope');
    const value = await run([...(kind === 'nic' ? ['network', 'nic'] : ['vm']), 'show', '--ids', id]);
    const tags = object(value.tags);
    if (
      lower(value.id) !== lower(id) ||
      lower(value.location) !== lower(plan.region) ||
      value.provisioningState !== 'Succeeded' ||
      tags['xcsh-managed-by'] !== 'azure-ce' ||
      tags['xcsh-execution-engine'] !== 'terraform' ||
      tags['xcsh-deployment-id'] !== plan.deploymentName ||
      tags['xcsh-plan-sha256'] !== plan.planSha256
    )
      throw new Error('Azure Terraform resource identity, readiness, or ownership differs');
    return value;
  };
  const interfaces: AzureTerraformInterface[] = [];
  const macs = new Set<string>();
  const vmIds = new Set<string>();
  for (let node = 1; node <= plan.topology.nodeCount; node++) {
    const instance = object(instances[String(node)]);
    const plannedVms = plan.actions.filter((action) => action.kind === 'vm-create' && action.node === node);
    if (
      plannedVms.length !== 1 ||
      !plannedVms[0].resourceId ||
      lower(instance.id) !== lower(plannedVms[0].resourceId) ||
      !uuid(instance.vm_id) ||
      instance.site_name !== plan.siteName ||
      instance.hostname !== `${plan.deploymentName}-${node}`
    )
      throw new Error('Terraform Azure VM locator differs from planned identity');
    const vmResourceId = plannedVms[0].resourceId;
    const vm = await owned('vm', vmResourceId);
    if (!uuid(vm.vmId) || lower(vm.vmId) !== lower(instance.vm_id) || vmIds.has(lower(vm.vmId)))
      throw new Error('Terraform Azure VM instance identity is stale or ambiguous');
    vmIds.add(lower(vm.vmId));
    const attachments = object(vm.networkProfile).networkInterfaces;
    if (!Array.isArray(attachments) || attachments.length !== plan.nics.length)
      throw new Error('Azure VM NIC attachment inventory is incomplete');
    const attachedIds = attachments.map((entry) => lower(object(entry).id));
    if (attachedIds.some((id) => !id) || new Set(attachedIds).size !== attachedIds.length)
      throw new Error('Azure VM NIC attachment inventory is ambiguous');
    for (const nic of plan.nics) {
      const candidate = object(candidates[`${node}:${nic.index}`]);
      const plannedSubnets = plan.actions.filter(
        (action) =>
          action.kind === 'subnet-create' &&
          nic.subnet.name &&
          action.args?.includes('--name') &&
          action.args[action.args.indexOf('--name') + 1] === nic.subnet.name,
      );
      const subnetId =
        nic.subnet.resourceId ?? (plannedSubnets.length === 1 ? plannedSubnets[0].resourceId : undefined);
      const plannedNics = plan.actions.filter(
        (action) =>
          action.kind === 'nic-create' &&
          action.node === node &&
          action.args?.[action.args.indexOf('--name') + 1] === `${plan.deploymentName}-${node}-nic${nic.index}`,
      );
      if (
        plannedNics.length !== 1 ||
        !plannedNics[0].resourceId ||
        lower(candidate.id) !== lower(plannedNics[0].resourceId) ||
        candidate.node !== node ||
        candidate.index !== nic.index ||
        candidate.role !== nic.role ||
        candidate.site_name !== plan.siteName ||
        typeof candidate.subnet_id !== 'string' ||
        !subnetId ||
        lower(candidate.subnet_id) !== lower(subnetId) ||
        !lower(subnetId).startsWith(`/subscriptions/${plan.subscription.id}/`.toLowerCase()) ||
        !attachedIds.includes(lower(candidate.id))
      )
        throw new Error('Terraform Azure interface locator differs from planned identity');
      const resourceId = plannedNics[0].resourceId;
      const current = await owned('nic', resourceId);
      const mac = lower(current.macAddress).replaceAll('-', ':');
      if (
        lower(object(current.virtualMachine).id) !== lower(vmResourceId) ||
        !/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(mac) ||
        macs.has(mac)
      )
        throw new Error('Azure NIC attachment or MAC is missing or ambiguous');
      const configs = current.ipConfigurations;
      if (!Array.isArray(configs)) throw new Error('Azure NIC IP configurations unavailable');
      const primary = configs
        .map(object)
        .filter((config) => config.primary === true || (configs.length === 1 && config.primary === undefined));
      const config = primary[0] ?? {};
      if (
        primary.length !== 1 ||
        config.privateIPAddressVersion !== 'IPv4' ||
        typeof config.privateIPAddress !== 'string' ||
        isIP(config.privateIPAddress) !== 4 ||
        lower(object(config.subnet).id) !== lower(candidate.subnet_id) ||
        (nic.subnet.resourceId && lower(candidate.subnet_id) !== lower(nic.subnet.resourceId))
      )
        throw new Error('Azure NIC primary address or subnet binding differs');
      macs.add(mac);
      interfaces.push({
        resourceId,
        subnetId: candidate.subnet_id,
        vmResourceId,
        vmId: String(vm.vmId),
        siteName: plan.siteName,
        node,
        index: nic.index,
        role: nic.role,
        mac,
        privateIp: config.privateIPAddress,
      });
    }
  }
  return {
    source: 'azure:account-show+vm-show+network-nic-show',
    observedAt,
    planId: plan.planId,
    planSha256: plan.planSha256,
    engine: plan.engine,
    subscriptionId: plan.subscription.id,
    tenantId: plan.subscription.tenantId,
    cloud: plan.subscription.cloud,
    region: plan.region,
    interfaces,
  };
}
