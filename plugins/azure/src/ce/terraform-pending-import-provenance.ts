import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { PlanReceipt } from '../../../terraform/src/runner';
import type { TerraformSession } from '../../../terraform/src/service';
import { verifyAzureCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import { azureTerraformCurrentDeployment } from './terraform-foundation';
import {
  type AzureTerraformNetworkEmptyMainAdmission,
  recheckAzureTerraformNetworkEmptyMainBinding,
} from './terraform-network-empty-main-binding';
import { readAzureTerraformParentPrivateFile } from './terraform-parent-file-custody';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

const hash = (v: string | Uint8Array) => createHash('sha256').update(v).digest('hex');
const same = (a: unknown, b: unknown) => canonicalSha256({ value: a }) === canonicalSha256({ value: b });
const sha = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
function require(v: unknown, message: string): asserts v {
  if (!v) throw Error(`Azure pending import provenance: ${message}`);
}
function object(v: unknown): Record<string, unknown> {
  require(v && typeof v === 'object' && !Array.isArray(v), 'record required');
  return v as Record<string, unknown>;
}
function keys(v: unknown, fields: string[]) {
  require(same(Object.keys(object(v)).sort(), fields.toSorted()), 'schema fields differ');
}

/** Read-only historical import custody before main retirement. Original cloud/state
 * outcomes are executor receipts; native archives independently authenticate the
 * original/import configurations and applied saved journal. Current operational
 * acceptance and permission to delete are separate contracts. Secret-bearing
 * configuration bytes never leave this reader.
 */
export async function readAzureTerraformPendingImportProvenance(
  request: AzureCePlan,
  store: CeDeploymentStore,
  session: TerraformSession,
  signal?: AbortSignal,
  emptyMainAdmission?: AzureTerraformNetworkEmptyMainAdmission,
) {
  const base = structuredClone(request),
    owner = structuredClone(store.owner),
    directory = store.directory,
    admittedWitness = emptyMainAdmission?.witness,
    admittedContext = emptyMainAdmission?.context,
    admittedDigest = admittedWitness ? canonicalSha256(admittedWitness) : undefined;
  const dependencies = [
    { target: store, key: 'read', value: store.read },
    { target: store, key: 'verify', value: store.verify },
    { target: session, key: 'readPlanApplicationHistory', value: session.readPlanApplicationHistory },
    { target: session, key: 'readPlanJournalInventory', value: session.readPlanJournalInventory },
  ];
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const seal = () => {
    deadline.throwIfAborted();
    require(same(request, base) &&
      same(store.owner, owner) &&
      store.directory === directory &&
      emptyMainAdmission?.witness === admittedWitness &&
      emptyMainAdmission?.context === admittedContext &&
      (!admittedWitness || canonicalSha256(admittedWitness) === admittedDigest) &&
      dependencies.every((row) => Reflect.get(row.target, row.key) === row.value), 'owning input or observer changed');
  };
  const step = async <T>(action: () => Promise<T>) => {
    seal();
    const aborted = Promise.withResolvers<never>();
    const onAbort = () => aborted.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const value = await Promise.race([action(), aborted.promise]);
      seal();
      return value;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  const recheckCancellation = async () => {
    if (emptyMainAdmission)
      await step(() =>
        recheckAzureTerraformNetworkEmptyMainBinding(
          emptyMainAdmission.witness,
          base.planSha256,
          store,
          emptyMainAdmission.context,
          deadline,
        ),
      );
  };
  verifyAzureCePlan(base);
  require(base.engine === 'terraform' &&
    same(owner, azureUpgradeBinding(base).owner) &&
    session.readPlanApplicationHistory &&
    session.readPlanJournalInventory, 'owning native observers required');
  const readHistory = session.readPlanApplicationHistory.bind(session),
    readInventory = session.readPlanJournalInventory.bind(session);
  const name = 'azure-terraform-pending-vm-import.json';
  const snapshot = async () => {
    await step(() => store.verify());
    const native = await step(() => readAzureTerraformParentPrivateFile(join(directory, name), deadline));
    let parsed: unknown;
    try {
      parsed = JSON.parse(native.bytes.toString());
    } catch {
      throw Error('Azure pending import provenance: malformed native packet');
    }
    const logical = await step(() => store.read(name));
    const nativeAfter = await step(() => readAzureTerraformParentPrivateFile(join(directory, name), deadline));
    require(nativeAfter.identity === native.identity &&
      hash(nativeAfter.bytes) === hash(native.bytes), 'native packet changed during logical read');
    require(same(parsed, logical), 'logical and native packet differ');
    return {
      value: object(logical),
      identity: native.identity,
      bytesSha256: hash(native.bytes),
      packetSha256: canonicalSha256(logical),
    };
  };
  await recheckCancellation();
  const first = await snapshot(),
    value = first.value;
  keys(value, [
    'schemaVersion',
    'sourcePlanSha256',
    'vmId',
    'id',
    'address',
    'originalConfiguration',
    'configurationSha256',
    'importedConfiguration',
    'importedConfigurationSha256',
    'receipt',
    'status',
    'application',
  ]);
  const id = `/subscriptions/${base.subscription.id}/resourceGroups/${base.intent.resourceGroup}/providers/Microsoft.Compute/virtualMachines/${base.deploymentName}-1`;
  const address = 'azurerm_linux_virtual_machine.node_1';
  require(value.schemaVersion === 2 &&
    value.sourcePlanSha256 === base.planSha256 &&
    value.id === id &&
    value.address === address &&
    typeof value.vmId === 'string' &&
    value.vmId.length > 0 &&
    value.status === 'imported' &&
    typeof value.originalConfiguration === 'string' &&
    hash(value.originalConfiguration) === value.configurationSha256 &&
    typeof value.importedConfiguration === 'string' &&
    hash(value.importedConfiguration) ===
      value.importedConfigurationSha256, 'completed owning import configuration required');
  const imported = object(JSON.parse(value.importedConfiguration));
  require(same(imported.import, [{ to: address, id }]), 'exact import declaration required');
  const receipt = object(value.receipt) as unknown as PlanReceipt;
  require(receipt.schemaVersion === 1 &&
    receipt.engine === 'terraform' &&
    receipt.deploymentId === base.deploymentName &&
    receipt.backendIdentity === `local:${base.deploymentName}` &&
    receipt.configurationSha256 === value.importedConfigurationSha256 &&
    sha(receipt.planSha256) &&
    sha(receipt.providerLockSha256) &&
    receipt.noChanges === false &&
    !receipt.operation &&
    !receipt.refreshOriginSha256 &&
    !receipt.actionInvocations?.length &&
    !receipt.relinquishments?.length &&
    same(receipt.imports, [
      {
        address,
        type: 'azurerm_linux_virtual_machine',
        providerName: 'registry.terraform.io/hashicorp/azurerm',
        idSha256: hash(id),
      },
    ]) &&
    Array.isArray(receipt.changes) &&
    new Set(receipt.changes.map((row) => row.address)).size === receipt.changes.length &&
    receipt.changes.every(
      (row) => row.actions.join(',') === 'no-op',
    ), 'nonmutating exact saved import receipt required');
  const application = object(value.application);
  keys(application, [
    'schemaVersion',
    'receiptSha256',
    'vmObservationSha256',
    'stateIdentity',
    'history',
    'historySha256',
    'originalConfigurationSha256',
    'importedConfigurationSha256',
    'evidenceSha256',
  ]);
  const { evidenceSha256, ...body } = application;
  require(application.schemaVersion === 1 &&
    evidenceSha256 === canonicalSha256(body) &&
    sha(application.vmObservationSha256) &&
    application.receiptSha256 === canonicalSha256(receipt) &&
    application.historySha256 === canonicalSha256(application.history) &&
    application.originalConfigurationSha256 === value.configurationSha256 &&
    application.importedConfigurationSha256 === value.importedConfigurationSha256 &&
    same(application.stateIdentity, {
      address,
      type: 'azurerm_linux_virtual_machine',
      id,
    }), 'restricted state receipt differs');
  const deployment = await step(() => azureTerraformCurrentDeployment(base));
  const { configuration: _configuration, providerLock, ...manifestIdentity } = deployment;
  require(hash(providerLock) === receipt.providerLockSha256, 'installed owning provider lock differs');
  const expectedImportedManifestSha256 = canonicalSha256({
    ...manifestIdentity,
    configurationSha256: value.importedConfigurationSha256,
    providerLockSha256: receipt.providerLockSha256,
  });
  const history = await step(() => readHistory(receipt, deadline)),
    inventory = await step(() => readInventory(deadline));
  require(history.incompleteArchives === 0 &&
    history.receiptSha256 === canonicalSha256(receipt) &&
    same(history.matches, object(application.history).matches) &&
    history.matches.length > 0 &&
    history.matches.some((row) => row.state === 'applied') &&
    history.matches.every(
      (row) =>
        ['planned', 'applied'].includes(row.state) &&
        row.configurationSha256 === value.importedConfigurationSha256 &&
        row.savedPlanSha256 === receipt.planSha256 &&
        row.manifestSha256 === expectedImportedManifestSha256,
    ) &&
    (emptyMainAdmission
      ? inventory.status === 'partial' &&
        same(inventory.unrecognizedRootEntrySha256s, [emptyMainAdmission.witness.cancellationRecordNameSha256])
      : inventory.status === 'complete' && inventory.unrecognizedRootEntrySha256s?.length === 0) &&
    inventory.incompleteArchives === 0 &&
    inventory.entries.some((row) => row.configurationSha256 === value.configurationSha256) &&
    inventory.entries.some(
      (row) =>
        row.configurationSha256 === value.importedConfigurationSha256 &&
        row.receiptSha256 === canonicalSha256(receipt) &&
        row.state === 'applied',
    ), `original/import configuration and applied native archives required: ${JSON.stringify({
    incompleteHistoryArchives: history.incompleteArchives,
    exactReceipt: history.receiptSha256 === canonicalSha256(receipt),
    retainedMatchesEqual: same(history.matches, object(application.history).matches),
    historyMatches: history.matches.length,
    appliedMatch: history.matches.some((row) => row.state === 'applied'),
    manifestMatches: history.matches.every((row) => row.manifestSha256 === expectedImportedManifestSha256),
    inventoryStatus: inventory.status,
    incompleteInventoryArchives: inventory.incompleteArchives,
    unrecognizedRootCount: inventory.unrecognizedRootEntrySha256s?.length,
    originalArchivePresent: inventory.entries.some((row) => row.configurationSha256 === value.configurationSha256),
    appliedImportedArchivePresent: inventory.entries.some(
      (row) =>
        row.configurationSha256 === value.importedConfigurationSha256 &&
        row.receiptSha256 === canonicalSha256(receipt) &&
        row.state === 'applied',
    ),
  })}`);
  require(same(await snapshot(), first) &&
    same(await step(() => readHistory(receipt, deadline)), history) &&
    same(await step(() => readInventory(deadline)), inventory) &&
    same(await snapshot(), first), 'native custody changed during observation');
  await recheckCancellation();
  require(same(await snapshot(), first), 'native custody changed after cancellation recheck');
  seal();
  return {
    schemaVersion: 1 as const,
    scope: 'azure-terraform-pending-import-provenance' as const,
    sourcePlanSha256: base.planSha256,
    path: name,
    identity: first.identity,
    bytesSha256: first.bytesSha256,
    packetSha256: first.packetSha256,
    applicationEvidenceSha256: evidenceSha256,
    receiptSha256: canonicalSha256(receipt),
    historySha256: canonicalSha256(history),
    inventorySha256: canonicalSha256(inventory),
    payloadSha256ByField: {
      originalConfiguration: String(value.configurationSha256),
      importedConfiguration: String(value.importedConfigurationSha256),
    },
    nativeImportJournalCustodyQualified: true as const,
    historicalStateReceiptCustodyQualified: true as const,
    currentOperationalAcceptanceQualified: false as const,
    retirementQualified: false as const,
  };
}
