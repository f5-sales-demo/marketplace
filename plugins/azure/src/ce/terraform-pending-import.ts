import { createHash } from 'node:crypto';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { PlanReceipt } from '../../../terraform/src/runner';
import type { TerraformSession } from '../../../terraform/src/service';
import type { AzExecApi } from '../az/exec';
import { canonicalSha256 } from './canonical';
import { observeAzureTerraformDestroyBoundary } from './terraform-destroy-ownership';
import type { AzureCePlan } from './types';

const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const object = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error('Malformed pending Azure VM identity');
  return v as Record<string, unknown>;
};
const journalName = 'azure-terraform-pending-vm-import.json';
/** Import the exact failed allocation object through a no-op saved plan before destroy. */
export async function reconcileAzurePendingVm(
  base: AzureCePlan,
  session: TerraformSession,
  storage: CeDeploymentStore,
  api: AzExecApi,
  env: Record<string, string | undefined>,
  signal?: AbortSignal,
) {
  if (!session.readResourceIdentities || !session.readConfigurationSha256 || !session.planImports)
    throw Error('Pending Azure VM owning import service unavailable');
  const id = `/subscriptions/${base.subscription.id}/resourceGroups/${base.intent.resourceGroup}/providers/Microsoft.Compute/virtualMachines/${base.deploymentName}-1`;
  const address = 'azurerm_linux_virtual_machine.node_1';
  const observe = async () => {
    if ((await observeAzureTerraformDestroyBoundary(base, api, signal)).status !== 'owned') return undefined;
    const r = await api.exec(
      'az',
      ['vm', 'show', '--ids', id, '--subscription', base.subscription.id, '--output', 'json'],
      signal ? { signal } : undefined,
    );
    if (r.exitCode !== 0) {
      if (/ResourceNotFound|ResourceGroupNotFound/.test(r.stderr)) return undefined;
      throw Error('Pending Azure VM observation unavailable');
    }
    const vm = object(JSON.parse(r.stdout)),
      tags = object(vm.tags);
    const expected = base.nics
      .map((n) => n.index)
      .map(
        (i) =>
          `${id.split('/providers/')[0]}/providers/Microsoft.Network/networkInterfaces/${base.deploymentName}-1-nic${i}`,
      );
    const nics = object(vm.networkProfile).networkInterfaces;
    if (
      vm.id !== id ||
      vm.name !== `${base.deploymentName}-1` ||
      vm.location !== base.region ||
      vm.provisioningState !== 'Failed' ||
      typeof vm.vmId !== 'string' ||
      !vm.vmId ||
      object(vm.hardwareProfile).vmSize !== base.vm.size ||
      tags['xcsh-managed-by'] !== 'azure-ce' ||
      tags['xcsh-execution-engine'] !== 'terraform' ||
      tags['xcsh-deployment-id'] !== base.deploymentName ||
      tags['xcsh-plan-sha256'] !== base.planSha256 ||
      tags['xcsh-node-index'] !== '1' ||
      tags['ves-io-site-name'] !== base.siteName ||
      !Array.isArray(nics) ||
      nics.length !== base.nics.length ||
      canonicalSha256(nics.map((n: unknown) => object(n).id).sort()) !==
        canonicalSha256(expected.slice(0, base.nics.length).sort())
    )
      throw Error('Pending Azure VM is foreign, replaced or no longer failed');
    return vm;
  };
  interface Journal {
    schemaVersion: 1;
    sourcePlanSha256: string;
    vmId: string;
    id: string;
    address: string;
    originalConfiguration: string;
    configurationSha256: string;
    importedConfiguration: string;
    importedConfigurationSha256: string;
    receipt?: PlanReceipt;
    status?: 'imported';
  }
  let saved: Journal | undefined;
  try {
    saved = object(await storage.read(journalName)) as unknown as Journal;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
  const identities = await session.readResourceIdentities(env, signal);
  const existing = identities.filter((r) => r.address === address);
  if (existing.length && (existing.length !== 1 || existing[0].id !== id))
    throw Error('Pending VM state identity differs');
  if (existing.length && !saved) return false;
  const vm = await observe();
  if (!vm) {
    if (saved && saved.status !== 'imported') throw Error('Pending VM disappeared before import reconciliation');
    return;
  }
  if (!saved) {
    const configurationSha256 = await session.readConfigurationSha256();
    const originalConfiguration = await session.readConfiguration(configurationSha256);
    const config = object(JSON.parse(originalConfiguration)),
      resources = object(config.resource);
    const desired = object(object(resources.azurerm_linux_virtual_machine).node_1);
    const keys = object(object(object(vm.osProfile).linuxConfiguration).ssh).publicKeys;
    if (!Array.isArray(keys) || keys.length !== 1 || typeof object(keys[0]).keyData !== 'string')
      throw Error('Pending VM public bootstrap identity unavailable');
    desired.admin_ssh_key = [{ username: object(vm.osProfile).adminUsername, public_key: object(keys[0]).keyData }];
    desired.lifecycle = { ignore_changes: 'all' };
    if (!identities.some((r) => r.type === 'tls_private_key')) delete resources.tls_private_key;
    if (config.output) {
      const names = Object.keys(object(config.output));
      const values = await session.readOutputs(names, env, signal);
      const output: Record<string, unknown> = {};
      for (const name of names) if (Object.hasOwn(values, name)) output[name] = { value: values[name] };
      if (Object.keys(output).length) config.output = output;
      else delete config.output;
    }
    config.import = [{ to: address, id }];
    const importedConfiguration = JSON.stringify(config);
    saved = {
      schemaVersion: 1,
      sourcePlanSha256: base.planSha256,
      vmId: String(vm.vmId),
      id,
      address,
      originalConfiguration,
      configurationSha256,
      importedConfiguration,
      importedConfigurationSha256: hash(importedConfiguration),
    };
    await storage.write(journalName, saved);
  }
  if (
    saved.schemaVersion !== 1 ||
    saved.sourcePlanSha256 !== base.planSha256 ||
    saved.id !== id ||
    saved.address !== address ||
    saved.vmId !== vm.vmId ||
    typeof saved.originalConfiguration !== 'string' ||
    typeof saved.importedConfiguration !== 'string' ||
    hash(saved.originalConfiguration) !== saved.configurationSha256 ||
    hash(saved.importedConfiguration) !== saved.importedConfigurationSha256
  )
    throw Error('Pending Azure VM import journal differs');
  let receipt = saved.receipt as PlanReceipt | undefined;
  const current = await session.readConfigurationSha256();
  if (current === saved.configurationSha256) {
    if (existing.length) {
      saved.status = 'imported';
      await storage.write(journalName, saved);
      return true;
    }
    await session.reviseConfiguration(current, saved.importedConfiguration);
  } else if (current !== saved.importedConfigurationSha256)
    throw Error('Pending import executor configuration differs');
  const intents = [
    {
      address,
      type: 'azurerm_linux_virtual_machine',
      providerName: 'registry.terraform.io/hashicorp/azurerm',
      idSha256: hash(id),
    },
  ];
  receipt ??= await session.planImports(intents, env, signal);
  if (
    receipt.engine !== 'terraform' ||
    receipt.deploymentId !== base.deploymentName ||
    receipt.backendIdentity !== `local:${base.deploymentName}` ||
    receipt.configurationSha256 !== saved.importedConfigurationSha256 ||
    receipt.operation ||
    receipt.actionInvocations?.length ||
    receipt.relinquishments?.length ||
    canonicalSha256(receipt.imports) !== canonicalSha256(intents) ||
    receipt.changes.some((c) => c.actions.join(',') !== 'no-op')
  )
    throw Error('Pending VM import plan is mutating or foreign');
  saved.receipt = receipt;
  await storage.write(journalName, saved);
  if (canonicalSha256(await observe()) !== canonicalSha256(vm))
    throw Error('Pending VM changed before import submission');
  const state = await session.readPlanApplicationState(receipt);
  if (state === 'planned') await session.apply(receipt, env, signal);
  const projected = await session.readResourceIdentities(env, signal);
  if (
    projected.filter((r) => r.address === address && r.id === id).length !== 1 ||
    canonicalSha256(await observe()) !== canonicalSha256(vm)
  )
    throw Error('Pending VM import outcome unavailable');
  if ((await session.readPlanApplicationState(receipt)) === 'applying')
    await session.reconcileApplyFromEvidence(receipt, canonicalSha256({ projected, vm }));
  await session.reviseConfiguration(saved.importedConfigurationSha256, saved.originalConfiguration);
  saved.status = 'imported';
  await storage.write(journalName, saved);
  return true;
}
