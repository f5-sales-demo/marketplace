import { createHash } from 'node:crypto';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { PlanReceipt } from '../../../terraform/src/runner';
import type { TerraformSession } from '../../../terraform/src/service';
import { canonicalEqual, canonicalSha256 } from './canonical';
import { publishImmutableCeReceipt, readImmutableCeReceipt } from './immutable-receipt-publication';
import { azureTerraformCurrentDeployment } from './terraform-foundation';
import {
  type AzureTerraformNetworkReplacementCompletionArtifacts,
  type AzureTerraformNetworkReplacementCompletionDependencies,
  azureTerraformNetworkReplacementCompletionName,
  openAzureTerraformNetworkReplacementCompletionArtifacts,
  validateAzureTerraformNetworkReplacementCompletion,
} from './terraform-network-replacement-completion';
import { validateAzureTerraformReplacementStageReceipt } from './terraform-replacement';
import type { AzureCePlan } from './types';

const receiptNamespace = 'replacement-refresh-inventory';
const pointerName = (plan: AzureCePlan) => `${plan.planId}-terraform-replacement-refresh-inventory.json`;
const sha = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
function require(v: unknown, reason: string): asserts v {
  if (!v) throw Error(`Azure Terraform replacement refresh inventory: ${reason}`);
}
function keys(v: unknown, names: string[]): asserts v is Record<string, unknown> {
  require(v &&
    typeof v === 'object' &&
    !Array.isArray(v) &&
    Object.keys(v).sort().join(',') === names.toSorted().join(','), 'exact schema required');
}
interface Inventory {
  schemaVersion: 1;
  kind: 'azure-terraform-network-replacement-refresh-inventory';
  binding: {
    owner: CeDeploymentStore['owner'];
    planSha256: string;
    originalPlanSha256: string;
    retainedPlanSha256: string;
    completionSha256: string;
    checkpointSha256: string;
    journalSha256: string;
    sourceBindingSha256: string;
    finalConfigurationSha256: string;
    providerLockSha256: string;
    nativeManifestSha256: string;
  };
  previousInventorySha256: string | null;
  receipts: Array<{ receiptSha256: string; receipt: PlanReceipt; nativeHistory: unknown; nativeHistorySha256: string }>;
}
async function binding(c: AzureTerraformNetworkReplacementCompletionArtifacts, completion: unknown) {
  const packet = validateAzureTerraformNetworkReplacementCompletion(c, completion),
    deployment = await c.bounded(() => azureTerraformCurrentDeployment(c.plan));
  const { configuration: _source, providerLock, ...identity } = deployment;
  const providerLockSha256 = createHash('sha256').update(providerLock).digest('hex');
  require(providerLockSha256 === packet.providerLockSha256, 'native provider lock differs from immutable completion');
  c.unchanged();
  return {
    owner: structuredClone(c.owner),
    planSha256: c.plan.planSha256,
    originalPlanSha256: packet.originalPlanSha256,
    retainedPlanSha256: packet.retainedPlanSha256,
    completionSha256: canonicalSha256(packet),
    checkpointSha256: packet.checkpointSha256,
    journalSha256: packet.journalSha256,
    sourceBindingSha256: packet.sourceBindingSha256,
    finalConfigurationSha256: packet.finalConfigurationSha256,
    providerLockSha256: packet.providerLockSha256,
    nativeManifestSha256: canonicalSha256({
      ...identity,
      configurationSha256: packet.finalConfigurationSha256,
      providerLockSha256,
    }),
  };
}
function validate(
  c: AzureTerraformNetworkReplacementCompletionArtifacts,
  record: unknown,
  expected: Inventory['binding'],
) {
  keys(record, ['schemaVersion', 'kind', 'binding', 'previousInventorySha256', 'receipts']);
  require(record.schemaVersion === 1 &&
    record.kind === 'azure-terraform-network-replacement-refresh-inventory' &&
    canonicalEqual(record.binding, expected) &&
    (record.previousInventorySha256 === null || sha(record.previousInventorySha256)) &&
    Array.isArray(record.receipts) &&
    record.receipts.length > 0, 'owning ordered inventory binding differs');
  const inventory = record as unknown as Inventory,
    seen = new Set<string>();
  for (const row of inventory.receipts) {
    keys(row, ['receiptSha256', 'receipt', 'nativeHistory', 'nativeHistorySha256']);
    require(sha(row.receiptSha256) &&
      row.receiptSha256 === canonicalSha256(row.receipt) &&
      !seen.has(row.receiptSha256) &&
      sha(row.nativeHistorySha256) &&
      row.nativeHistorySha256 === canonicalSha256(row.nativeHistory), 'duplicate or altered refresh descriptor');
    validateAzureTerraformReplacementStageReceipt(
      c.plan,
      c.material.stages.launch,
      row.receipt,
      c.binding.providerLockSha256,
    );
    require(row.receipt.noChanges &&
      row.receipt.changes.every(
        (v) => v.actions.join(',') === 'no-op',
      ), 'refresh must be a complete no-change receipt');
    const h = row.nativeHistory;
    keys(h, [
      'schemaVersion',
      'scope',
      'receiptSha256',
      'manifestSha256',
      'matches',
      'incompleteArchives',
      'applicationOutcomeQualified',
      'retirementQualified',
    ]);
    require(h.schemaVersion === 1 &&
      h.scope === 'exact-saved-plan-journal-history' &&
      h.receiptSha256 === row.receiptSha256 &&
      h.manifestSha256 === expected.nativeManifestSha256 &&
      h.incompleteArchives === 0 &&
      h.applicationOutcomeQualified === false &&
      h.retirementQualified === false &&
      Array.isArray(h.matches) &&
      h.matches.length > 0, 'complete exact native refresh history required');
    const occurrences = new Set<string>();
    for (const match of h.matches) {
      keys(match, [
        'location',
        'archiveSha256',
        'state',
        'journalSha256',
        'savedPlanSha256',
        'configurationSha256',
        'manifestSha256',
      ]);
      const occurrence = `${match.location}:${match.archiveSha256}`;
      require(['current', 'revision', 'plan-history'].includes(String(match.location)) &&
        sha(match.archiveSha256) &&
        sha(match.journalSha256) &&
        !occurrences.has(occurrence) &&
        ['planned', 'applied'].includes(String(match.state)) &&
        match.savedPlanSha256 === row.receipt.planSha256 &&
        match.configurationSha256 === expected.finalConfigurationSha256 &&
        match.manifestSha256 === h.manifestSha256, 'native saved receipt identity differs');
      occurrences.add(occurrence);
    }
    seen.add(row.receiptSha256);
  }
  return structuredClone(inventory);
}

/** Each immutable inventory commits the exact prefix and a single new descriptor. */
async function readChain(
  c: AzureTerraformNetworkReplacementCompletionArtifacts,
  store: CeDeploymentStore,
  digest: string,
  expected: Inventory['binding'],
) {
  const publications: Array<{ name: string; publicationSha256: string; byteSha256: string; record: Inventory }> = [];
  const seen = new Set<string>();
  let next: string | null = digest,
    descendant: Inventory | undefined;
  while (next !== null) {
    require(sha(next) && !seen.has(next), 'inventory prefix digest is cyclic or malformed');
    seen.add(next);
    const publication = await c.bounded(() =>
      readImmutableCeReceipt(store, receiptNamespace, next as string, c.deadline),
    );
    const record = validate(c, publication.record, expected);
    if (descendant)
      require(record.receipts.length + 1 === descendant.receipts.length &&
        canonicalEqual(record.receipts, descendant.receipts.slice(0, -1)), 'inventory prefix is partial or reordered');
    require(record.previousInventorySha256 !== null || record.receipts.length === 1, 'inventory prefix root differs');
    publications.push({ ...publication, record });
    descendant = record;
    next = record.previousInventorySha256;
  }
  const finish = async () => {
    for (const original of publications) {
      const fresh = await c.bounded(() =>
        readImmutableCeReceipt(store, receiptNamespace, original.publicationSha256, c.deadline),
      );
      require(canonicalEqual(fresh, {
        name: original.name,
        publicationSha256: original.publicationSha256,
        byteSha256: original.byteSha256,
        record: original.record,
      }), 'inventory prefix changed across callbacks');
    }
    c.unchanged();
  };
  await finish();
  return { publication: publications[0], finish };
}

/** Outcome-bound descriptors only. The collector independently authenticates native saved
 * bytes/application journals; these descriptors cannot authorize an equal-configuration receipt. */
export async function readAzureTerraformReplacementRefreshInventory(
  c: AzureTerraformNetworkReplacementCompletionArtifacts,
  store: CeDeploymentStore,
  completion: unknown,
  expectedDigest?: string,
) {
  let pointer: unknown;
  try {
    pointer = await c.read(pointerName(c.plan));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    require(expectedDigest === undefined, 'outcome inventory publication is missing');
    require(canonicalEqual(
      c.latestFinal,
      validateAzureTerraformNetworkReplacementCompletion(c, completion).finalReceipt,
    ), 'missing refresh inventory cannot discard a newer final receipt');
    return undefined;
  }
  keys(pointer, ['schemaVersion', 'inventorySha256']);
  require(pointer.schemaVersion === 1 &&
    sha(pointer.inventorySha256) &&
    pointer.inventorySha256 === expectedDigest, 'inventory differs from authenticated owning outcome');
  const chain = await readChain(c, store, pointer.inventorySha256 as string, await binding(c, completion)),
    publication = chain.publication,
    record = publication.record;
  require(canonicalEqual(
    record.receipts.at(-1)?.receipt,
    c.latestFinal,
  ), 'latest refresh publication is stale or partial');
  await c.finish();
  await chain.finish();
  const again = await c.bounded(() =>
    readImmutableCeReceipt(store, receiptNamespace, publication.publicationSha256, c.deadline),
  );
  require(canonicalEqual(again, publication), 'immutable inventory changed across provenance callbacks');
  return { ...publication, record };
}

/** Owning executor, under replacement lock, before current final-plan overwrite. A durable
 * descriptor survives later interruption; old outcome readers then reject the unmatched pointer.
 * The immutable first completion/checkpoint digest is never changed by refresh publication. */
export async function publishAzureTerraformReplacementRefreshInventory(
  request: AzureCePlan,
  store: CeDeploymentStore,
  session: TerraformSession,
  dependencies: AzureTerraformNetworkReplacementCompletionDependencies,
  finalRequest: PlanReceipt,
  signal?: AbortSignal,
) {
  let completion: unknown;
  try {
    completion = await store.read(azureTerraformNetworkReplacementCompletionName(request));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return undefined;
  }
  const final = structuredClone(finalRequest),
    finalDigest = canonicalSha256(final),
    c = await openAzureTerraformNetworkReplacementCompletionArtifacts(request, store, dependencies, signal),
    expected = await binding(c, completion),
    readHistory = session.readPlanApplicationHistory,
    readState = session.readPlanApplicationState,
    readConfig = session.readConfigurationSha256,
    readSource = session.readConfiguration;
  const seal = () => {
    c.unchanged();
    require(canonicalEqual(finalRequest, final) &&
      session.readPlanApplicationHistory === readHistory &&
      session.readPlanApplicationState === readState &&
      session.readConfigurationSha256 === readConfig &&
      session.readConfiguration === readSource, 'owning refresh request/readers changed');
  };
  require(typeof readHistory === 'function' &&
    typeof readState === 'function' &&
    typeof readConfig === 'function' &&
    typeof readSource === 'function', 'native current and historical receipt readers required');
  validateAzureTerraformReplacementStageReceipt(c.plan, c.material.stages.launch, final, expected.providerLockSha256);
  require(final.noChanges &&
    final.changes.every((v) => v.actions.join(',') === 'no-op'), 'final refresh is not no-change');
  let priorDigest: string | undefined;
  try {
    const pointer = await c.read(pointerName(c.plan));
    keys(pointer, ['schemaVersion', 'inventorySha256']);
    require(pointer.schemaVersion === 1 && sha(pointer.inventorySha256), 'prior inventory pointer differs');
    priorDigest = pointer.inventorySha256;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  let rows: Inventory['receipts'] = [];
  let finishPrior = async () => {};
  if (priorDigest) {
    const chain = await readChain(c, store, priorDigest, expected);
    rows = structuredClone(chain.publication.record.receipts);
    finishPrior = chain.finish;
    require(rows.some((row) => canonicalEqual(row.receipt, c.latestFinal)) ||
      canonicalEqual(
        c.latestFinal,
        validateAzureTerraformNetworkReplacementCompletion(c, completion).finalReceipt,
      ), 'interrupted refresh does not preserve the exact prior publication');
  } else {
    require(canonicalEqual(
      c.latestFinal,
      validateAzureTerraformNetworkReplacementCompletion(c, completion).finalReceipt,
    ), 'uninventoried prior refresh cannot be discarded');
  }
  const deployment = await c.bounded(() => azureTerraformCurrentDeployment(c.plan));
  const { configuration: _source, providerLock, ...identity } = deployment;
  const manifestSha256 = canonicalSha256({
    ...identity,
    configurationSha256: expected.finalConfigurationSha256,
    providerLockSha256: createHash('sha256').update(providerLock).digest('hex'),
  });
  const priorHistories = new Map<string, string>();
  const native = async () => {
    seal();
    require((await c.bounded(() => readConfig.call(session))) === expected.finalConfigurationSha256 &&
      (await c.bounded(() => readSource.call(session, expected.finalConfigurationSha256))) ===
        c.material.stages.launch.configuration &&
      ['planned', 'applied'].includes(
        await c.bounded(() => readState.call(session, final)),
      ), 'owning exact current native final differs');
    // A newer plan archives the interrupted receipt. Reauthenticate every retained descriptor
    // through the native history reader; current-only receipt state cannot prove older plans.
    for (const row of rows) {
      const actual = await c.bounded(() => readHistory.call(session, structuredClone(row.receipt), c.deadline));
      seal();
      require(actual.manifestSha256 === manifestSha256 &&
        actual.matches.every((m) => m.manifestSha256 === manifestSha256), 'retained refresh native manifest differs');
      validate(
        c,
        {
          schemaVersion: 1,
          kind: 'azure-terraform-network-replacement-refresh-inventory',
          binding: expected,
          previousInventorySha256: null,
          receipts: [{ ...row, nativeHistory: actual, nativeHistorySha256: canonicalSha256(actual) }],
        },
        expected,
      );
      const digest = canonicalSha256(actual),
        prior = priorHistories.get(row.receiptSha256);
      require(prior === undefined || prior === digest, 'retained native refresh changed across callbacks');
      priorHistories.set(row.receiptSha256, digest);
    }
    const history = await c.bounded(() => readHistory.call(session, structuredClone(final), c.deadline));
    seal();
    require(history.manifestSha256 === manifestSha256 &&
      history.matches.every(
        (m) => m.manifestSha256 === manifestSha256,
      ), 'native executor/provider/manifest binding differs');
    return history;
  };
  const history = await native();
  const existing = rows.find((row) => row.receiptSha256 === finalDigest);
  require(!existing || rows.at(-1) === existing, 'old refresh receipt cannot be reordered');
  if (existing) {
    require(canonicalEqual(existing.nativeHistory, history), 'interrupted refresh native provenance changed');
    await c.finish();
    await finishPrior();
    seal();
    return priorDigest;
  } else
    rows.push({
      receiptSha256: finalDigest,
      receipt: final,
      nativeHistory: history,
      nativeHistorySha256: canonicalSha256(history),
    });
  const record = validate(
    c,
    {
      schemaVersion: 1,
      kind: 'azure-terraform-network-replacement-refresh-inventory',
      binding: expected,
      previousInventorySha256: priorDigest ?? null,
      receipts: rows,
    },
    expected,
  );
  require(canonicalEqual(await native(), history), 'native refresh history changed across callbacks');
  await c.finish();
  await finishPrior();
  seal();
  const publication = await c.bounded(() => publishImmutableCeReceipt(store, receiptNamespace, record, c.deadline));
  require(canonicalEqual(await native(), history), 'native refresh changed during immutable publication');
  await c.finish();
  await finishPrior();
  seal();
  // The previously sealed pointer is intentionally advanced only after immutable publication.
  await c.bounded(() =>
    store.write(pointerName(c.plan), { schemaVersion: 1, inventorySha256: publication.publicationSha256 }),
  );
  require(canonicalEqual(await store.read(pointerName(c.plan)), {
    schemaVersion: 1,
    inventorySha256: publication.publicationSha256,
  }), 'inventory pointer changed during publication');
  seal();
  return publication.publicationSha256;
}
