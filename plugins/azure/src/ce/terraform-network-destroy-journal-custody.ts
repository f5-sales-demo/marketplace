import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open as openFile, readdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { PlanReceipt } from '../../../terraform/src/runner';
import { canonicalEqual, canonicalSha256 } from './canonical';
import { azureTerraformCurrentDeployment } from './terraform-foundation';
import {
  type AzureTerraformNetworkEmptyMainAdmission,
  type AzureTerraformNetworkEmptyMainBindingContext,
  qualifyAzureTerraformNetworkEmptyMainBinding,
  recheckAzureTerraformNetworkEmptyMainBinding,
} from './terraform-network-empty-main-binding';
import { qualifyAzureTerraformNetworkRetiredMainCustody } from './terraform-network-retired-main-custody';
import { readAzureTerraformNetworkAllOriginalCustody } from './terraform-network-retirement-lineage';
import type { AzureTerraformNetworkTeardownAdmissionContext } from './terraform-network-teardown-admission';
import { readAzureTerraformPendingImportProvenance } from './terraform-pending-import-provenance';
import { type AzureTerraformTeardownPlan, compileAzureTerraformTeardown } from './terraform-teardown';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

export type AzureTerraformNetworkDestroyJournalContext = AzureTerraformNetworkTeardownAdmissionContext & {
  destroyTeardown: AzureTerraformTeardownPlan;
};
const same = (a: unknown, b: unknown) => canonicalEqual({ value: a }, { value: b });
const hash = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const sha = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure Terraform network destroy journal custody: ${message}`);
}
function object(value: unknown): Record<string, unknown> {
  require(value && typeof value === 'object' && !Array.isArray(value), 'record object required');
  return value as Record<string, unknown>;
}
function keys(value: unknown, fields: string[]) {
  require(same(Object.keys(object(value)).sort(), fields.toSorted()), 'native journal schema differs');
}
const witnesses = new WeakMap<
  object,
  {
    request: AzureCePlan;
    store: CeDeploymentStore;
    context: AzureTerraformNetworkDestroyJournalContext;
    digest: string;
    authenticate(): void;
    recheck(signal?: AbortSignal): Promise<void>;
  }
>();

/** Under the owning lifecycle lock, independently authenticate post-destroy native journal
 * accounting. The ordinary pre-destroy collector retains unknown for these extra receipts.
 * Only exact saved authorization/source and consumed destroy receipts can account for them.
 * No cloud call, Terraform command, publication, destruction or artifact retirement is made.
 * This proves neither independent cloud ownership/absence nor empty state or main/parent cleanup.
 */
async function qualifyAzureTerraformNetworkJournalCustody(
  request: AzureCePlan,
  store: CeDeploymentStore,
  context: AzureTerraformNetworkDestroyJournalContext,
  signal?: AbortSignal,
  emptyMainAdmission?: AzureTerraformNetworkEmptyMainAdmission,
) {
  const original = structuredClone(request),
    teardown = structuredClone(context.destroyTeardown),
    owner = structuredClone(store.owner),
    directory = store.directory,
    site = structuredClone(context.site),
    { publicSession, terraform, loaders, verifier, replacementVerifier } = context;
  const dependencies: Array<{ target: object; key: string; value: unknown }> = [
    { target: store, key: 'read', value: store.read },
    { target: store, key: 'verify', value: store.verify },
    { target: terraform, key: 'open', value: terraform.open },
    { target: loaders, key: 'loadSource', value: loaders.loadSource },
    { target: loaders, key: 'loadOutcome', value: loaders.loadOutcome },
    ...['getSessionId', 'getArtifactsDir', 'getArtifactPath', 'saveArtifact'].map((key) => ({
      target: publicSession,
      key,
      value: Reflect.get(publicSession, key),
    })),
  ];
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const seal = () => {
    deadline.throwIfAborted();
    require(same(request, original) &&
      same(store.owner, owner) &&
      store.directory === directory &&
      context.publicSession === publicSession &&
      context.terraform === terraform &&
      context.loaders === loaders &&
      context.verifier === verifier &&
      context.replacementVerifier === replacementVerifier &&
      same(context.site, site) &&
      same(context.destroyTeardown, teardown) &&
      dependencies.every(
        ({ target, key, value }) => Reflect.get(target, key) === value,
      ), 'owning request or dependency changed');
  };
  const step = async <T>(action: () => Promise<T>, parentSignal?: AbortSignal) => {
    seal();
    const active = AbortSignal.any([deadline, ...(parentSignal ? [parentSignal] : [])]);
    active.throwIfAborted();
    const canceled = Promise.withResolvers<never>(),
      onAbort = () => canceled.reject(active.reason);
    active.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([action(), canceled.promise]);
      active.throwIfAborted();
      seal();
      return result;
    } finally {
      active.removeEventListener('abort', onAbort);
    }
  };
  const namespace = () =>
    step(async () => {
      const stat = await lstat(directory);
      require(stat.isDirectory() &&
        !stat.isSymbolicLink() &&
        stat.uid === process.getuid?.() &&
        (stat.mode & 0o077) === 0 &&
        (await realpath(directory)) === directory, 'private directory differs');
      return { identity: `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`, names: (await readdir(directory)).sort() };
    });
  const recordDigests = new Map<string, string>();
  const readRecord = async (name: string) => {
    const value = structuredClone(await step(() => store.read(name)));
    const native = await step(async () => {
      const file = await openFile(join(directory, name), constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const before = await file.stat();
        require(before.isFile() &&
          before.uid === process.getuid?.() &&
          before.nlink === 1 &&
          (before.mode & 0o077) === 0, 'record file ownership differs');
        const bytes = await file.readFile(),
          after = await file.stat(),
          named = await lstat(join(directory, name));
        require(after.dev === before.dev &&
          after.ino === before.ino &&
          after.size === before.size &&
          after.mtimeMs === before.mtimeMs &&
          after.ctimeMs === before.ctimeMs &&
          named.isFile() &&
          !named.isSymbolicLink() &&
          named.dev === before.dev &&
          named.ino === before.ino &&
          named.uid === before.uid &&
          named.nlink === 1 &&
          (named.mode & 0o077) === 0, 'record changed during native read');
        require(same(JSON.parse(bytes.toString()), value), 'record reader differs from native bytes');
        return canonicalSha256({ identity: `${before.dev}:${before.ino}:${before.birthtimeMs}`, bytes: hash(bytes) });
      } finally {
        await file.close();
      }
    });
    require(!recordDigests.has(name) || recordDigests.get(name) === native, 'record bytes or identity changed');
    recordDigests.set(name, native);
    return value;
  };
  seal();
  require(original.engine === 'terraform' &&
    original.intent.operation === 'deploy' &&
    same(azureUpgradeBinding(original).owner, owner) &&
    same(
      compileAzureTerraformTeardown(
        original,
        teardown.drain,
        teardown.retirement,
        teardown.pendingAdmissionJournalSha256,
      ),
      teardown,
    ) &&
    teardown.retirement[0]?.siteUid === site.siteUid, 'compiled teardown source, owner or site differs');
  await step(() => store.verify());
  const root = await namespace();
  require(same(await readRecord(`${teardown.planId}.json`), teardown), 'saved teardown source differs');
  const authorization = object(await readRecord(`${teardown.planId}-authorization.json`)),
    lifecycle = object(await readRecord('azure-terraform-lifecycle-retirement.json'));
  require(same(authorization, {
    schemaVersion: 1,
    engine: 'terraform',
    sourcePlanSha256: original.planSha256,
    teardownPlanSha256: teardown.planSha256,
    mutations: true,
  }) &&
    lifecycle.schemaVersion === 1 &&
    lifecycle.kind === teardown.kind &&
    same(lifecycle.owner, owner) &&
    lifecycle.sourcePlanSha256 === original.planSha256 &&
    lifecycle.teardownPlanSha256 === teardown.planSha256, 'saved lifecycle or destruction authorization differs');
  const plan = (await readRecord('azure-terraform-cloud-destroy-plan.json')) as PlanReceipt,
    final = (await readRecord('azure-terraform-cloud-destroy-final.json')) as PlanReceipt;
  const deployment = await step(() => azureTerraformCurrentDeployment(original)),
    { configuration: _configuration, providerLock, ...identity } = deployment;
  const manifestOf = (configurationSha256: string) =>
    canonicalSha256({
      ...identity,
      configurationSha256,
      providerLockSha256: hash(providerLock),
    });
  for (const receipt of [plan, final]) {
    require(receipt &&
      receipt.schemaVersion === 1 &&
      receipt.engine === 'terraform' &&
      receipt.operation === 'destroy' &&
      receipt.deploymentId === deployment.deploymentId &&
      receipt.backendIdentity === deployment.backendIdentity &&
      sha(receipt.planSha256) &&
      sha(receipt.configurationSha256) &&
      receipt.providerLockSha256 === hash(providerLock) &&
      !receipt.actionInvocations &&
      !receipt.imports &&
      !receipt.relinquishments &&
      Array.isArray(receipt.changes) &&
      typeof receipt.noChanges === 'boolean' &&
      receipt.noChanges === (receipt.changes.length === 0) &&
      receipt.changes.every((change) => change.actions.join(',') === 'delete') &&
      new Set(receipt.changes.map((change) => change.address)).size ===
        receipt.changes.length, 'exact owning delete-only destroy receipt required');
  }
  require(final.noChanges &&
    final.changes.length === 0 &&
    plan.configurationSha256 === final.configurationSha256, 'final destroy receipt or configuration differs');
  const session = await step(() => terraform.open(owner, deployment, 'current'));
  const readConfiguration = session.readConfiguration,
    readConfigurationSha256 = session.readConfigurationSha256,
    readHistory = session.readPlanApplicationHistory,
    readCurrent = session.readCurrentPlanJournal;
  require(typeof readConfiguration === 'function' &&
    typeof readConfigurationSha256 === 'function' &&
    typeof readHistory === 'function' &&
    typeof readCurrent === 'function', 'owning current and historical native journal readers required');
  for (const key of [
    'readConfiguration',
    'readConfigurationSha256',
    'readPlanApplicationHistory',
    'readPlanJournalInventory',
    'readCurrentPlanJournal',
  ])
    dependencies.push({ target: session, key, value: Reflect.get(session, key) });
  const recheckEmpty = async (parent?: AbortSignal) => {
    if (emptyMainAdmission)
      await step(
        () =>
          recheckAzureTerraformNetworkEmptyMainBinding(
            emptyMainAdmission.witness,
            original.planSha256,
            store,
            emptyMainAdmission.context,
            AbortSignal.any([deadline, ...(parent ? [parent] : [])]),
          ),
        parent,
      );
  };
  await recheckEmpty();
  const currentConfigurationSha256 = emptyMainAdmission?.witness.configurationSha256 ?? final.configurationSha256;
  const source = emptyMainAdmission
    ? String((emptyMainAdmission.context.terminalCleanup as Record<string, unknown>).retainedDestroyConfiguration)
    : await step(() => readConfiguration.call(session, final.configurationSha256));
  require(hash(source) === final.configurationSha256 &&
    (await step(() => readConfigurationSha256.call(session))) ===
      currentConfigurationSha256, 'owning current configuration bytes differ');
  const resources = object(object(JSON.parse(source)).resource),
    addresses = new Set<string>();
  for (const [type, rows] of Object.entries(resources))
    for (const name of Object.keys(object(rows))) addresses.add(`${type}.${name}`);
  require(plan.changes.every(
    (change) => addresses.has(change.address) && change.address.startsWith(`${change.type}.`),
  ), 'destroy receipt includes resource outside authenticated current configuration');
  const inspect = async (parentSignal?: AbortSignal) => {
    const active = AbortSignal.any([deadline, ...(parentSignal ? [parentSignal] : [])]);
    active.throwIfAborted();
    await recheckEmpty(parentSignal);
    const history = await step(
      () =>
        readAzureTerraformNetworkAllOriginalCustody(
          original,
          publicSession,
          store,
          terraform,
          loaders,
          site,
          verifier,
          active,
          replacementVerifier,
          emptyMainAdmission,
        ),
      parentSignal,
    );
    const nativeRootAccounted = emptyMainAdmission
      ? history.sharedMain.status === 'partial' &&
        history.sharedMain.incompleteArchives === 0 &&
        same(history.sharedMain.unrecognizedRootEntrySha256s, [emptyMainAdmission.witness.cancellationRecordNameSha256])
      : history.sharedMain.status === 'complete' && history.sharedMain.unrecognizedRootEntrySha256s?.length === 0;
    require(nativeRootAccounted &&
      history.sharedMain.originalDeploymentJournalsQualified &&
      history.lineage.configurationSha256s.includes(
        final.configurationSha256,
      ), `complete retained original native custody and known configuration required: ${JSON.stringify({ status: history.sharedMain.status, incompleteArchives: history.sharedMain.incompleteArchives, unrecognizedRoots: history.sharedMain.unrecognizedRootEntrySha256s?.length, exactCancellation: emptyMainAdmission ? same(history.sharedMain.unrecognizedRootEntrySha256s, [emptyMainAdmission.witness.cancellationRecordNameSha256]) : undefined, originalQualified: history.sharedMain.originalDeploymentJournalsQualified, knownConfiguration: history.lineage.configurationSha256s.includes(final.configurationSha256) })}`);
    const currentReceipt = emptyMainAdmission
      ? (emptyMainAdmission.context.terminalCleanup as { final: PlanReceipt }).final
      : final;
    const current = await step(() => readCurrent.call(session, currentConfigurationSha256, active), parentSignal);
    keys(current, [
      'schemaVersion',
      'scope',
      'state',
      'receipt',
      'manifestSha256',
      'journalSha256',
      'savedPlanSha256',
      'planSemanticsQualified',
      'executionSha256',
      'ordinaryRefreshEnabled',
    ]);
    require(current.state === 'planned' || current.state === 'applied', 'current destroy receipt is unresolved');
    require(current.schemaVersion === 1 &&
      current.scope === 'current-saved-plan-byte-and-journal-binding' &&
      current.planSemanticsQualified === false &&
      same(current.receipt, currentReceipt) &&
      current.savedPlanSha256 === currentReceipt.planSha256 &&
      current.manifestSha256 === manifestOf(currentConfigurationSha256) &&
      sha(current.journalSha256) &&
      sha(current.executionSha256) &&
      current.ordinaryRefreshEnabled ===
        !!emptyMainAdmission, 'exact current destroy saved-plan and execution binding required');
    const consumed = [];
    for (const [phase, receipt] of [
      ['destroy', plan],
      ['final', final],
      ...(emptyMainAdmission ? [['ordinary-empty-final', currentReceipt] as const] : []),
    ] as const) {
      const native = await step(() => readHistory.call(session, receipt, active), parentSignal);
      keys(native, [
        'schemaVersion',
        'scope',
        'receiptSha256',
        'manifestSha256',
        'incompleteArchives',
        'matches',
        'applicationOutcomeQualified',
        'retirementQualified',
      ]);
      require(native.schemaVersion === 1 &&
        native.scope === 'exact-saved-plan-journal-history' &&
        native.receiptSha256 === canonicalSha256(receipt) &&
        native.manifestSha256 === manifestOf(currentConfigurationSha256) &&
        native.incompleteArchives === 0 &&
        native.applicationOutcomeQualified === false &&
        native.retirementQualified === false &&
        Array.isArray(native.matches) &&
        native.matches.length > 0, 'complete exact destroy application history required');
      const seen = new Set<string>();
      for (const match of native.matches) {
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
        require(['current', 'revision', 'plan-history'].includes(match.location) &&
          !seen.has(occurrence) &&
          sha(match.archiveSha256) &&
          sha(match.journalSha256) &&
          match.savedPlanSha256 === receipt.planSha256 &&
          match.configurationSha256 === receipt.configurationSha256 &&
          match.manifestSha256 === manifestOf(receipt.configurationSha256) &&
          ['planned', 'applied'].includes(match.state), 'foreign, duplicate or unresolved destroy history');
        seen.add(occurrence);
      }
      require(receipt.noChanges ||
        native.matches.some(
          (match) => match.state === 'applied',
        ), 'destroy mutation lacks exact consumed native application');
      consumed.push({ phase, receiptSha256: canonicalSha256(receipt), historySha256: canonicalSha256(native) });
    }
    // An import is an additional receipt only after the owning schema2 reader has
    // joined the exact private journal to native applied history and provider lock.
    // Filename/status and an arbitrary extra receipt cannot supply this authority.
    const pendingName = 'azure-terraform-pending-vm-import.json';
    const pendingProof = root.names.includes(pendingName)
      ? await step(
          () => readAzureTerraformPendingImportProvenance(original, store, session, active, emptyMainAdmission),
          parentSignal,
        )
      : undefined;
    const pendingReceipt = pendingProof ? (object(await readRecord(pendingName)).receipt as PlanReceipt) : undefined;
    if (pendingProof) {
      require(pendingReceipt &&
        canonicalSha256(pendingReceipt) ===
          pendingProof.receiptSha256, 'pending import receipt differs from owning native provenance');
      consumed.push({
        phase: 'pending-import',
        receiptSha256: pendingProof.receiptSha256,
        historySha256: pendingProof.historySha256,
      });
    }
    const expected = [
      plan,
      final,
      ...(emptyMainAdmission ? [currentReceipt] : []),
      ...(pendingReceipt ? [pendingReceipt] : []),
    ];
    const accounted = history.sharedMain.rows.every((row) => {
      if (row.provenance === 'authenticated-execution-receipt' || row.provenance === 'known-empty-configuration')
        return true;
      return (
        row.provenance === 'unaccounted-receipt' &&
        expected.some(
          (receipt) =>
            row.receiptSha256 === canonicalSha256(receipt) &&
            row.savedPlanSha256 === receipt.planSha256 &&
            row.configurationSha256 === receipt.configurationSha256 &&
            row.manifestSha256 === manifestOf(receipt.configurationSha256) &&
            ['planned', 'applied'].includes(row.state) &&
            sha(row.executionSha256) &&
            row.ordinaryRefreshEnabled === (receipt === currentReceipt && !!emptyMainAdmission),
        )
      );
    });
    require(accounted &&
      expected.every((receipt) =>
        history.sharedMain.rows.some((row) => row.receiptSha256 === canonicalSha256(receipt)),
      ), 'unaccounted or missing additional native receipt');
    require(history.lineage.rows.every(
      (row) =>
        row.execution === 'staged-network' ||
        row.execution === 'completed-replacement' ||
        row.execution === 'unstaged-no-outcome',
    ) &&
      history.rows.length === history.lineage.rows.filter((row) => row.execution === 'staged-network').length &&
      history.sharedMain.replacementRows.length ===
        history.lineage.rows.filter((row) => row.execution === 'completed-replacement').length &&
      history.sharedMain.replacementRows.every(
        (row) => row.records.length > 0 && row.originalPublishedJournalsQualified,
      ), 'complete retained public execution or genuine absence custody required');
    const stages = history.rows
      .flatMap((row) => {
        require(row.main.originalPublishedJournalsQualified &&
          row.main.terminalPublishedJournalsQualified &&
          row.power.rows.length > 0 &&
          row.power.rows.every(
            (power) => power.status === 'retired' && power.retirement?.runnerRetirementQualified,
          ), 'retained network or power custody incomplete');
        return row.power.rows.map((power) => power.stage);
      })
      .sort();
    require(new Set(stages).size === stages.length, 'duplicate retained power stage');
    // Preserve each authenticated child identity and exact native marker proof before any
    // separate shared-main retirement. These bindings grant no main or parent cleanup.
    const retainedPowerChildren = history.rows
      .flatMap((row) =>
        row.power.rows.map((power) => {
          const retirement = power.retirement;
          require(retirement &&
            retirement.sourcePlanSha256 === row.planSha256 &&
            retirement.stage === power.stage &&
            retirement.status === 'retired' &&
            retirement.runnerRetirementQualified &&
            Number.isInteger(retirement.node) &&
            retirement.node >= 1 &&
            (retirement.operation === 'start' ||
              retirement.operation === 'deallocate'), 'retained child source, identity or retirement differs');
          const proof = object(retirement.proof),
            observed = object(proof.observed),
            receipt = object(observed.receipt);
          keys(proof, ['preparingSha256', 'finalReceiptSha256', 'observed']);
          keys(observed, ['status', 'markerSha256', 'receipt']);
          require(sha(proof.preparingSha256) &&
            sha(proof.finalReceiptSha256) &&
            observed.status === 'runner-artifacts-retired' &&
            sha(observed.markerSha256) &&
            receipt.status === 'runner-artifacts-retired' &&
            receipt.evidenceSha256 === proof.preparingSha256 &&
            sha(receipt.manifestSha256) &&
            sha(receipt.finalPlanSha256) &&
            sha(receipt.inventorySha256) &&
            sha(receipt.independentCleanupSha256) &&
            Number.isSafeInteger(receipt.retiredArtifacts) &&
            Number(receipt.retiredArtifacts) >= 0, 'exact retained child native marker proof required');
          return {
            networkPlanSha256: row.planSha256,
            node: retirement.node,
            operation: retirement.operation,
            stage: power.stage,
            retirementSha256: canonicalSha256(retirement),
            proof: structuredClone(retirement.proof),
          };
        }),
      )
      .sort((a, b) => a.stage.localeCompare(b.stage));
    require(same(
      retainedPowerChildren.map((child) => child.stage),
      stages,
    ) &&
      new Set(retainedPowerChildren.map((child) => `${child.networkPlanSha256}:${child.node}:${child.operation}`))
        .size === retainedPowerChildren.length, 'duplicate or partial retained child identity');

    for (const name of recordDigests.keys()) await step(() => readRecord(name), parentSignal);
    require(same(await namespace(), root) &&
      (await step(() => readConfigurationSha256.call(session), parentSignal)) === currentConfigurationSha256 &&
      (emptyMainAdmission ||
        (await step(() => readConfiguration.call(session, final.configurationSha256), parentSignal)) === source) &&
      same(
        await step(() => readCurrent.call(session, currentConfigurationSha256, active), parentSignal),
        current,
      ), 'owning source or native current boundary changed');
    if (pendingProof)
      require(same(
        await step(
          () => readAzureTerraformPendingImportProvenance(original, store, session, active, emptyMainAdmission),
          parentSignal,
        ),
        pendingProof,
      ), 'pending import provenance changed across terminal accounting');
    await recheckEmpty(parentSignal);
    if (emptyMainAdmission)
      require(same(
        retainedPowerChildren,
        (
          (emptyMainAdmission.context.terminalCleanup as Record<string, unknown>).retainedNetworkCustody as Record<
            string,
            unknown
          >
        ).retainedPowerChildren,
      ), 'terminal retained child identity differs');
    active.throwIfAborted();
    seal();
    return {
      stages,
      retainedPowerChildren,
      retainedLineage: structuredClone(history.lineage),
      historySha256: canonicalSha256(history),
      currentSha256: canonicalSha256(current),
      consumed,
    };
  };
  const first = await inspect();
  const result = {
    schemaVersion: 1 as const,
    scope: 'post-destroy-authenticated-network-stage-journal-custody' as const,
    owner,
    site,
    originalPlanSha256: original.planSha256,
    teardownPlanSha256: teardown.planSha256,
    ...first,
    recordSha256: canonicalSha256([...recordDigests].sort(([a], [b]) => a.localeCompare(b))),
    ...(emptyMainAdmission
      ? {
          currentEmptyMainJournalCustodyQualified: true as const,
          emptyMainBinding: structuredClone(emptyMainAdmission.witness),
        }
      : {}),
    publicJournalCustodyQualified: true as const,
    destroyJournalCustodyQualified: true as const,
    powerRunnerRetirementQualified: true as const,
    mainRunnerRetirementQualified: false as const,
    independentCloudCleanupQualified: false as const,
    emptyStateQualified: false as const,
    parentRetirementQualified: false as const,
    currentOperationalAcceptanceQualified: false as const,
  };
  const digest = canonicalSha256(result);
  witnesses.set(result, {
    request,
    store,
    context,
    digest,
    authenticate: seal,
    async recheck(parentSignal) {
      seal();
      require(canonicalSha256(result) === digest &&
        same(await step(() => inspect(parentSignal), parentSignal), first), 'authenticated destroy custody changed');
      seal();
    },
  });
  return result;
}

/** Authenticate only the exact genuine mint and its original context, dependency seal
 * and expiration. This synchronous guard grants no external freshness or mutation authority;
 * enrollment must still perform the complete owning recheck before returning its witness.
 */
export function authenticateAzureTerraformNetworkDestroyJournalCustody(
  witness: unknown,
  request: AzureCePlan,
  store: CeDeploymentStore,
  context: AzureTerraformNetworkDestroyJournalContext,
  signal?: AbortSignal,
): void {
  signal?.throwIfAborted();
  const bound = witness && typeof witness === 'object' ? witnesses.get(witness) : undefined;
  require(bound &&
    bound.request === request &&
    bound.store === store &&
    bound.context === context &&
    canonicalSha256(witness) === bound.digest, 'owning authenticated destroy custody witness required');
  bound.authenticate();
  signal?.throwIfAborted();
}

export async function recheckAzureTerraformNetworkDestroyJournalCustody(
  witness: unknown,
  request: AzureCePlan,
  store: CeDeploymentStore,
  context: AzureTerraformNetworkDestroyJournalContext,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const bound = witness && typeof witness === 'object' ? witnesses.get(witness) : undefined;
  require(bound &&
    bound.request === request &&
    bound.store === store &&
    bound.context === context &&
    canonicalSha256(witness) === bound.digest, 'owning authenticated destroy custody witness required');
  await bound.recheck(signal);
  require(canonicalSha256(witness) === bound.digest, 'authenticated destroy custody changed');
}

export async function qualifyAzureTerraformNetworkDestroyJournalCustody(
  request: AzureCePlan,
  store: CeDeploymentStore,
  context: AzureTerraformNetworkDestroyJournalContext,
  signal?: AbortSignal,
) {
  return qualifyAzureTerraformNetworkJournalCustody(request, store, context, signal);
}
/** Separate explicit terminal phase. The original post-destroy path stays current-only. */
export async function qualifyAzureTerraformNetworkTerminalJournalCustody(
  request: AzureCePlan,
  store: CeDeploymentStore,
  context: AzureTerraformNetworkEmptyMainBindingContext,
  signal?: AbortSignal,
) {
  if (
    context.terminalCleanup &&
    typeof context.terminalCleanup === 'object' &&
    Reflect.get(context.terminalCleanup, 'phase') === 'retired'
  )
    return qualifyAzureTerraformNetworkRetiredMainCustody(request, store, context, signal);
  const witness = await qualifyAzureTerraformNetworkEmptyMainBinding(request, store, context, signal);
  return qualifyAzureTerraformNetworkJournalCustody(request, store, context, signal, { witness, context });
}
