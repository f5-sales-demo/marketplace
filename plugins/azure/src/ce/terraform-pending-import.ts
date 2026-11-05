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
  if (
    !session.readResourceIdentities ||
    !session.readConfigurationSha256 ||
    !session.planImports ||
    !session.readPlanApplicationHistory
  )
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
    schemaVersion: 2;
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
    application?: {
      schemaVersion: 1;
      receiptSha256: string;
      vmObservationSha256: string;
      stateIdentity: { address: string; type: string; id: string };
      history: Awaited<ReturnType<NonNullable<TerraformSession['readPlanApplicationHistory']>>>;
      historySha256: string;
      originalConfigurationSha256: string;
      importedConfigurationSha256: string;
      evidenceSha256: string;
    };
  }
  let saved: Journal | undefined;
  try {
    saved = object(await storage.read(journalName)) as unknown as Journal;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
  const identities = await session.readResourceIdentities(env, signal);
  const existing = identities.filter((r) => r.address === address);
  if (
    existing.length &&
    (existing.length !== 1 || existing[0].id !== id || existing[0].type !== 'azurerm_linux_virtual_machine')
  )
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
      const values = await session.readOutputs(names, env, signal, true);
      const output: Record<string, unknown> = {};
      for (const name of names) if (Object.hasOwn(values, name)) output[name] = { value: values[name] };
      if (Object.keys(output).length) config.output = output;
      else delete config.output;
    }
    config.import = [{ to: address, id }];
    const importedConfiguration = JSON.stringify(config);
    saved = {
      schemaVersion: 2,
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
    saved.schemaVersion !== 2 ||
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
  const intents = [
    {
      address,
      type: 'azurerm_linux_virtual_machine',
      providerName: 'registry.terraform.io/hashicorp/azurerm',
      idSha256: hash(id),
    },
  ];
  const validateReceipt = (receipt: PlanReceipt) => {
    if (
      receipt.schemaVersion !== 1 ||
      receipt.engine !== 'terraform' ||
      receipt.deploymentId !== base.deploymentName ||
      receipt.backendIdentity !== `local:${base.deploymentName}` ||
      receipt.configurationSha256 !== saved?.importedConfigurationSha256 ||
      !/^[a-f0-9]{64}$/.test(receipt.planSha256) ||
      !/^[a-f0-9]{64}$/.test(receipt.providerLockSha256) ||
      receipt.noChanges !== false ||
      receipt.operation ||
      receipt.refreshOriginSha256 ||
      receipt.actionInvocations?.length ||
      receipt.relinquishments?.length ||
      canonicalSha256(receipt.imports) !== canonicalSha256(intents) ||
      !Array.isArray(receipt.changes) ||
      new Set(receipt.changes.map((c) => c.address)).size !== receipt.changes.length ||
      receipt.changes.some((c) => c.actions.join(',') !== 'no-op')
    )
      throw Error('Pending VM import plan is mutating or foreign');
  };
  const appliedHistory = async (receipt: PlanReceipt) => {
    validateReceipt(receipt);
    const readHistory = session.readPlanApplicationHistory;
    if (!readHistory) throw Error('Pending VM import history service unavailable');
    const history = await readHistory.call(session, receipt, signal);
    // The runner authenticates archived configuration, manifest, saved binary and journal.
    // Its current manifest can differ after original configuration restoration.
    if (
      history.schemaVersion !== 1 ||
      history.scope !== 'exact-saved-plan-journal-history' ||
      history.receiptSha256 !== canonicalSha256(receipt) ||
      !/^[a-f0-9]{64}$/.test(history.manifestSha256) ||
      history.incompleteArchives !== 0 ||
      history.applicationOutcomeQualified !== false ||
      history.retirementQualified !== false ||
      !Array.isArray(history.matches) ||
      !history.matches.length
    )
      throw Error('Pending VM import exact journal history unavailable');
    const seen = new Set<string>();
    let applied = false;
    for (const match of history.matches) {
      const key = `${match.location}/${match.archiveSha256}`;
      if (
        !['current', 'revision', 'plan-history'].includes(match.location) ||
        seen.has(key) ||
        !['planned', 'applied'].includes(match.state) ||
        !/^[a-f0-9]{64}$/.test(match.archiveSha256) ||
        !/^[a-f0-9]{64}$/.test(match.journalSha256) ||
        !/^[a-f0-9]{64}$/.test(match.manifestSha256) ||
        match.savedPlanSha256 !== receipt.planSha256 ||
        match.configurationSha256 !== receipt.configurationSha256
      )
        throw Error('Pending VM import archived journal differs');
      seen.add(key);
      applied ||= match.state === 'applied';
    }
    if (!applied) throw Error('Pending VM import applied history unavailable');
    return history;
  };
  const recheckCompletion = async (expectedConfigurationSha256: string) => {
    signal?.throwIfAborted();
    if (!session.readResourceIdentities || !session.readConfigurationSha256)
      throw Error('Pending VM import owning observer changed');
    const rows = (await session.readResourceIdentities(env, signal)).filter((row) => row.address === address);
    if (rows.length !== 1 || rows[0].id !== id || rows[0].type !== 'azurerm_linux_virtual_machine')
      throw Error('Pending VM state identity differs');
    if (canonicalSha256(await observe()) !== canonicalSha256(vm))
      throw Error('Pending VM changed before import completion');
    if ((await session.readConfigurationSha256()) !== expectedConfigurationSha256)
      throw Error('Pending VM import configuration changed');
    signal?.throwIfAborted();
    return { address: rows[0].address, type: rows[0].type, id: rows[0].id };
  };
  let receipt = saved.receipt as PlanReceipt | undefined;
  const retainApplication = async (appliedReceipt: PlanReceipt) => {
    const history = await appliedHistory(appliedReceipt);
    const stateIdentity = await recheckCompletion(saved.configurationSha256);
    const body = {
      schemaVersion: 1 as const,
      receiptSha256: canonicalSha256(appliedReceipt),
      vmObservationSha256: canonicalSha256(vm),
      stateIdentity,
      history,
      historySha256: canonicalSha256(history),
      originalConfigurationSha256: saved.configurationSha256,
      importedConfigurationSha256: saved.importedConfigurationSha256,
    };
    return { ...body, evidenceSha256: canonicalSha256(body) };
  };
  if (saved.status === 'imported') {
    const application = saved.application;
    if (!application || !receipt) throw Error('Pending VM imported checkpoint lacks state provenance');
    const { evidenceSha256, ...body } = application;
    if (
      application.schemaVersion !== 1 ||
      evidenceSha256 !== canonicalSha256(body) ||
      application.receiptSha256 !== canonicalSha256(receipt) ||
      application.historySha256 !== canonicalSha256(application.history) ||
      application.originalConfigurationSha256 !== saved.configurationSha256 ||
      application.importedConfigurationSha256 !== saved.importedConfigurationSha256 ||
      canonicalSha256(application.stateIdentity) !==
        canonicalSha256({ address, type: 'azurerm_linux_virtual_machine', id })
    )
      throw Error('Pending VM imported checkpoint state provenance differs');
  }
  const current = await session.readConfigurationSha256();
  if (current === saved.configurationSha256) {
    if (existing.length) {
      if (!receipt) throw Error('Pending VM reconciliation lacks saved import receipt');
      const observedHistory = await appliedHistory(receipt);
      await recheckCompletion(saved.configurationSha256);
      if (canonicalSha256(await observe()) !== canonicalSha256(vm))
        throw Error('Pending VM changed before import reconciliation');
      if (saved.status === 'imported') {
        if (
          !saved.application ||
          canonicalSha256(saved.application.history.matches) !== canonicalSha256(observedHistory.matches)
        )
          throw Error('Pending VM original applied history changed');
        return true;
      }
      saved.application = await retainApplication(receipt);
      saved.status = 'imported';
      await storage.write(journalName, saved);
      return true;
    }
    await session.reviseConfiguration(current, saved.importedConfiguration);
  } else if (current !== saved.importedConfigurationSha256)
    throw Error('Pending import executor configuration differs');
  receipt ??= await session.planImports(intents, env, signal);
  validateReceipt(receipt);
  saved.receipt = receipt;
  await storage.write(journalName, saved);
  if (canonicalSha256(await observe()) !== canonicalSha256(vm))
    throw Error('Pending VM changed before import submission');
  const state = await session.readPlanApplicationState(receipt);
  if (state === 'planned') await session.apply(receipt, env, signal);
  const projected = await session.readResourceIdentities(env, signal);
  if (
    projected.filter((r) => r.address === address).length !== 1 ||
    projected.find((r) => r.address === address)?.id !== id ||
    projected.find((r) => r.address === address)?.type !== 'azurerm_linux_virtual_machine' ||
    canonicalSha256(await observe()) !== canonicalSha256(vm)
  )
    throw Error('Pending VM import outcome unavailable');
  if ((await session.readPlanApplicationState(receipt)) === 'applying')
    await session.reconcileApplyFromEvidence(receipt, canonicalSha256({ projected, vm }));
  if ((await session.readPlanApplicationState(receipt)) !== 'applied')
    throw Error('Pending VM import lacks applied journal');
  await appliedHistory(receipt);
  await recheckCompletion(saved.importedConfigurationSha256);
  await session.reviseConfiguration(saved.importedConfigurationSha256, saved.originalConfiguration);
  saved.application = await retainApplication(receipt);
  saved.status = 'imported';
  await storage.write(journalName, saved);
  return true;
}
