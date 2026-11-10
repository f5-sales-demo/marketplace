import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open as openFile, readdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { verifyAzureCePlan } from './artifacts';
import { canonicalEqual, canonicalSha256, canonicalSnapshot } from './canonical';
import type { AzureTerraformNetworkAcceptanceVerifier } from './terraform-network-checkpoint';
import { readAzureTerraformNetworkCompletionOne } from './terraform-network-completion-history';
import {
  type AzureTerraformNetworkHistoryLoaders,
  runAzureTerraformNetworkGenerationHistory,
} from './terraform-network-generation-history';
import {
  type AzureTerraformNetworkReplacementCompletedVerifier,
  azureTerraformNetworkReplacementCompletionName,
  openAzureTerraformNetworkReplacementCompletionArtifacts,
  validateAzureTerraformNetworkReplacementCompletion,
} from './terraform-network-replacement-completion';
import { verifyAzureTerraformNetworkReplacementProfile } from './terraform-network-replacement-plan';
import { readAzureTerraformReplacementRefreshInventory } from './terraform-network-replacement-refresh-inventory';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure Terraform replacement receipt provenance: ${message}`);
}
/** Private historical receipt provenance only. Expected immutable completion identity is
 * authenticated through the owning outcome and complete ordered generation history, never
 * inferred from a caller allowlist or the packet being qualified. Actual native saved-journal
 * inventory, current health, interrupted prefixes and parent admission remain separate gates.
 * No enrollment source, Terraform/cloud command, or publication is returned or performed.
 */
export async function readAzureTerraformNetworkReplacementReceiptProvenance(
  request: AzureCePlan,
  store: CeDeploymentStore,
  loaders: AzureTerraformNetworkHistoryLoaders,
  siteRequest: { siteUid: string; siteConfigurationSha256: string },
  verifier: AzureTerraformNetworkAcceptanceVerifier,
  replacementVerifier: AzureTerraformNetworkReplacementCompletedVerifier,
  signal?: AbortSignal,
) {
  const plan = structuredClone(request),
    owner = structuredClone(store.owner),
    site = structuredClone(siteRequest),
    directory = store.directory;
  const bindings = [
    { target: store, key: 'read', value: store.read },
    { target: store, key: 'verify', value: store.verify },
    { target: loaders, key: 'loadSource', value: loaders.loadSource },
    { target: loaders, key: 'loadOutcome', value: loaders.loadOutcome },
  ];
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const requestMatches = canonicalSnapshot(plan),
    ownerMatches = canonicalSnapshot(owner),
    siteMatches = canonicalSnapshot(site);
  const seal = () => {
    deadline.throwIfAborted();
    require(requestMatches(request) &&
      ownerMatches(store.owner) &&
      siteMatches(siteRequest) &&
      store.directory === directory &&
      bindings.every(({ target, key, value }) => Reflect.get(target, key) === value), 'owning context changed');
  };
  const step = async <T>(action: () => Promise<T>): Promise<T> => {
    seal();
    const abort = Promise.withResolvers<never>(),
      onAbort = () => abort.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([action(), abort.promise]);
      seal();
      return result;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  seal();
  verifyAzureCePlan(plan);
  verifyAzureTerraformNetworkReplacementProfile(plan);
  require(canonicalEqual(azureUpgradeBinding(plan).owner, owner) &&
    typeof verifier === 'function' &&
    typeof replacementVerifier === 'function', 'owned replacement and distinct historical verifiers required');
  await step(() => store.verify());
  // Native root packet bytes seal the complete external-callback span. In particular,
  // a final valid completion read cannot conceal a changed earlier stage packet.
  const packetSnapshot = async () => {
    seal();
    const before = await step(() => lstat(directory));
    require(before.isDirectory() &&
      !before.isSymbolicLink() &&
      before.uid === process.getuid?.() &&
      (before.mode & 0o077) === 0 &&
      (await step(() => realpath(directory))) === directory, 'private receipt packet directory ownership differs');
    const names = (await step(() => readdir(directory))).sort(),
      bytesByName: Record<string, string> = {},
      fileIdentitiesByName: Record<string, string> = {};
    for (const name of names.filter((name) => name.endsWith('.json'))) {
      require(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*\.json$/.test(name), 'private receipt packet filename differs');
      const path = join(directory, name),
        handle = await step(() => openFile(path, constants.O_RDONLY | constants.O_NOFOLLOW));
      try {
        const stat = await step(() => handle.stat());
        require(stat.isFile() &&
          stat.uid === process.getuid?.() &&
          stat.nlink === 1 &&
          (stat.mode & 0o077) === 0, 'private receipt packet file ownership differs');
        const bytes = await step(() => handle.readFile()),
          after = await step(() => handle.stat()),
          named = await step(() => lstat(path));
        require(after.dev === stat.dev &&
          after.ino === stat.ino &&
          after.size === stat.size &&
          after.mtimeMs === stat.mtimeMs &&
          after.ctimeMs === stat.ctimeMs &&
          named.isFile() &&
          !named.isSymbolicLink() &&
          named.dev === stat.dev &&
          named.ino === stat.ino &&
          named.uid === stat.uid &&
          named.nlink === 1 &&
          (named.mode & 0o077) === 0, 'private receipt packet changed during native read');
        bytesByName[name] = createHash('sha256').update(bytes).digest('hex');
        fileIdentitiesByName[name] = `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;
      } finally {
        await handle.close();
      }
    }
    const after = await step(() => lstat(directory));
    require(after.dev === before.dev &&
      after.ino === before.ino &&
      canonicalEqual((await step(() => readdir(directory))).sort(), names), 'private receipt packet namespace changed');
    return { identity: `${before.dev}:${before.ino}:${before.birthtimeMs}`, names, bytesByName, fileIdentitiesByName };
  };
  const originalPackets = await packetSnapshot();
  const readHistory = () =>
    step(() =>
      runAzureTerraformNetworkGenerationHistory(
        plan,
        store,
        loaders,
        verifier,
        readAzureTerraformNetworkCompletionOne,
        undefined,
        deadline,
        replacementVerifier,
      ),
    );
  const generation = await readHistory(),
    history = generation.completion;
  require(history?.kind === 'azure-terraform-network-replacement-completion-history' &&
    history.sourcePlanSha256 === plan.planSha256 &&
    canonicalEqual(history.owner, owner) &&
    canonicalEqual(history.site, site), 'complete owning replacement generation and site required');
  const context = await step(() =>
    openAzureTerraformNetworkReplacementCompletionArtifacts(
      plan,
      store,
      {
        loaders,
        site,
        journalSha256: history.journalSha256,
        sourceBindingSha256: history.sourceBindingSha256,
        qualifyHistorical: verifier,
        qualifyCompletedOperational: replacementVerifier,
      },
      deadline,
    ),
  );
  const name = azureTerraformNetworkReplacementCompletionName(plan);
  const raw = await step(() => context.read(name));
  require(canonicalSha256(raw) ===
    history.completionSha256, 'immutable receipt publication differs from authenticated outcome');
  const packet = validateAzureTerraformNetworkReplacementCompletion(context, raw);
  await step(() => context.qualify(packet.operational, 'historical'));
  const outcome = structuredClone(await step(() => loaders.loadOutcome(plan)));
  require(outcome.networkReplacementCompletionSha256 === history.completionSha256, 'owning completion outcome changed');
  const refresh = await step(() =>
    readAzureTerraformReplacementRefreshInventory(
      context,
      store,
      packet,
      outcome.networkReplacementRefreshInventorySha256 as string | undefined,
    ),
  );
  const receipts = [
    {
      stage: 'quiesce' as const,
      publicationName: `${plan.planId}-terraform-quiesce-plan.json`,
      publicationSha256: packet.stageRecordSha256.quiesce,
      receipt: structuredClone(context.stageRecords.quiesce.receipt),
    },
    {
      stage: 'launch' as const,
      publicationName: `${plan.planId}-terraform-launch-plan.json`,
      publicationSha256: packet.stageRecordSha256.launch,
      receipt: structuredClone(context.stageRecords.launch.receipt),
    },
    {
      stage: 'immutable-final' as const,
      publicationName: name,
      publicationSha256: history.completionSha256,
      receipt: structuredClone(packet.finalReceipt),
    },
    ...(refresh?.record.receipts.map((row) => ({
      stage: 'refreshed-final' as const,
      publicationName: refresh.name,
      publicationSha256: refresh.publicationSha256,
      receipt: structuredClone(row.receipt),
    })) ?? []),
  ].map((row) => ({
    ...row,
    receiptSha256: canonicalSha256(row.receipt),
    configurationSha256: row.receipt.configurationSha256,
  }));
  await step(() => context.finish());
  // Re-run complete owning outcome/source/operational provenance across the extra stage reads.
  const fresh = await readHistory();
  require(canonicalEqual(fresh, generation), 'owning generation changed across receipt collection');
  await step(() => context.finish());
  require(canonicalSha256(await step(() => context.read(name))) ===
    history.completionSha256, 'immutable receipt publication changed at final boundary');
  require(canonicalEqual(
    await packetSnapshot(),
    originalPackets,
  ), 'native receipt packet changed across provenance callbacks');
  require(canonicalEqual(await step(() => loaders.loadOutcome(plan)), outcome), 'owning refresh outcome changed');
  seal();
  return {
    schemaVersion: 1 as const,
    scope: 'authenticated-completed-replacement-original-receipt-provenance' as const,
    engine: 'terraform' as const,
    owner,
    site,
    planSha256: plan.planSha256,
    originalPlanSha256: history.originalPlanSha256,
    retainedPlanSha256: history.retainedPlanSha256,
    completionSha256: history.completionSha256,
    checkpointSha256: history.checkpointSha256,
    journalSha256: history.journalSha256,
    sourceBindingSha256: history.sourceBindingSha256,
    finalConfigurationSha256: history.finalConfigurationSha256,
    providerLockSha256: history.providerLockSha256,
    receipts,
    nativeSavedJournalsQualified: false as const,
    refreshedFinalReceiptsQualified: true as const,
    refreshInventorySha256: refresh?.publicationSha256,
    interruptedPrefixQualified: false as const,
    currentOperationalAcceptanceQualified: false as const,
    parentRetirementQualified: false as const,
  };
}
