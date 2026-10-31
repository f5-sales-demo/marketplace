import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { VerifiedIngressContract } from '../../../platform/src/ce/ingress-contract';
import type { VerifiedUpgradeContract } from '../../../platform/src/ce/upgrade-contract';
import type { PlanReceipt } from '../../../terraform/src/runner';
import { canonicalSha256 } from './canonical';
import type { AzureOperationalRetirementSession } from './network-operational-retirement-session';
import { azureTerraformCurrentDeployment } from './terraform-foundation';
import type { AzureTerraformNetworkDestroyJournalContext } from './terraform-network-destroy-journal-custody';
import { compileAzureTerraformTeardown } from './terraform-teardown';
import { matchesAzureTerraformTerminalSnapshot } from './terraform-terminal-snapshot';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

export type AzureTerraformNetworkEmptyMainBindingContext = AzureTerraformNetworkDestroyJournalContext & {
  terminalCleanup: unknown;
  /** Internal instances from verified producer loading, never serialized caller contracts. */
  parentContracts?: {
    ingress?: VerifiedIngressContract;
    upgrade?: VerifiedUpgradeContract;
    observer?: AzureOperationalRetirementSession;
  };
};
const same = (a: unknown, b: unknown) => canonicalSha256({ value: a }) === canonicalSha256({ value: b });
const hash = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const sha = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
function require(v: unknown, message: string): asserts v {
  if (!v) throw Error(`Azure network empty-main binding: ${message}`);
}
function object(v: unknown): Record<string, unknown> {
  require(v && typeof v === 'object' && !Array.isArray(v), 'record object required');
  return v as Record<string, unknown>;
}
function parsePrivate(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    throw Error('Azure network empty-main binding: malformed private configuration');
  }
}
const witnesses = new WeakMap<
  object,
  {
    originalPlanSha256: string;
    store: CeDeploymentStore;
    context: AzureTerraformNetworkEmptyMainBindingContext;
    digest: string;
    recheck(signal?: AbortSignal): Promise<void>;
  }
>();

/** Internal read-only configuration admission prerequisite. Authenticate the owning native
 * cancellation and its exact current ordinary empty plan. Retained destroy configuration is
 * sensitive private staging; only its digest is returned. This does not prove empty applied
 * state, external absence, child/main/parent retirement or installed/live acceptance.
 */
export async function qualifyAzureTerraformNetworkEmptyMainBinding(
  request: AzureCePlan,
  store: CeDeploymentStore,
  context: AzureTerraformNetworkEmptyMainBindingContext,
  signal?: AbortSignal,
) {
  const original = structuredClone(request),
    owner = structuredClone(store.owner),
    directory = store.directory,
    teardown = structuredClone(context.destroyTeardown),
    terminal = structuredClone(context.terminalCleanup),
    site = structuredClone(context.site),
    terraform = context.terraform;
  const dependencies: Array<{ target: object; key: string; value: unknown }> = [
    { target: store, key: 'read', value: store.read },
    { target: store, key: 'verify', value: store.verify },
    { target: terraform, key: 'open', value: terraform.open },
  ];
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const terminalSha256 = canonicalSha256({ value: terminal });
  const seal = () => {
    deadline.throwIfAborted();
    require(same(request, original) &&
      same(store.owner, owner) &&
      store.directory === directory &&
      context.terraform === terraform &&
      same(context.destroyTeardown, teardown) &&
      matchesAzureTerraformTerminalSnapshot(context.terminalCleanup, terminalSha256) &&
      same(context.site, site) &&
      dependencies.every(
        ({ target, key, value }) => Reflect.get(target, key) === value,
      ), 'owning request or context changed');
  };
  const step = async <T>(action: () => Promise<T>, parent?: AbortSignal) => {
    seal();
    const active = AbortSignal.any([deadline, ...(parent ? [parent] : [])]);
    active.throwIfAborted();
    const aborted = Promise.withResolvers<never>(),
      onAbort = () => aborted.reject(active.reason);
    active.addEventListener('abort', onAbort, { once: true });
    try {
      const value = await Promise.race([action(), aborted.promise]);
      active.throwIfAborted();
      seal();
      return value;
    } finally {
      active.removeEventListener('abort', onAbort);
    }
  };
  const records = new Map<string, string>();
  const readRecord = async (name: string, parent?: AbortSignal) =>
    step(async () => {
      const logical = await store.read(name),
        file = await open(join(directory, name), constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const first = await file.stat(),
          bytes = await file.readFile(),
          last = await file.stat(),
          named = await lstat(join(directory, name));
        require(first.isFile() &&
          first.uid === process.getuid?.() &&
          first.nlink === 1 &&
          (first.mode & 0o077) === 0 &&
          last.dev === first.dev &&
          last.ino === first.ino &&
          last.size === first.size &&
          last.mtimeMs === first.mtimeMs &&
          last.ctimeMs === first.ctimeMs &&
          named.isFile() &&
          !named.isSymbolicLink() &&
          named.dev === first.dev &&
          named.ino === first.ino &&
          named.uid === first.uid &&
          named.nlink === 1 &&
          (named.mode & 0o077) === 0 &&
          same(JSON.parse(bytes.toString()), logical), 'private record custody differs');
        const digest = canonicalSha256({
          identity: `${first.dev}:${first.ino}:${first.birthtimeMs}`,
          bytes: hash(bytes),
        });
        require(!records.has(name) || records.get(name) === digest, 'private record bytes or identity changed');
        records.set(name, digest);
        return structuredClone(logical);
      } finally {
        await file.close();
      }
    }, parent);
  const root = await step(() => lstat(directory));
  require(root.isDirectory() &&
    !root.isSymbolicLink() &&
    root.uid === process.getuid?.() &&
    (root.mode & 0o077) === 0 &&
    (await step(() => realpath(directory))) === directory, 'private directory differs');
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
    teardown.retirement[0]?.siteUid === site.siteUid, 'compiled source owner or site differs');
  await step(() => store.verify());
  require(same(await readRecord(`${teardown.planId}.json`), teardown), 'saved teardown differs');
  require(same(await readRecord(`${teardown.planId}-authorization.json`), {
    schemaVersion: 1,
    engine: 'terraform',
    sourcePlanSha256: original.planSha256,
    teardownPlanSha256: teardown.planSha256,
    mutations: true,
  }), 'saved authorization differs');
  require(same(
    await readRecord('azure-terraform-terminal-cleanup.json'),
    terminal,
  ), 'saved terminal checkpoint differs');
  const checkpoint = object(terminal),
    destroy = object(checkpoint.destroy) as unknown as PlanReceipt,
    final = object(checkpoint.final) as unknown as PlanReceipt;
  const deployment = await step(() => azureTerraformCurrentDeployment(original));
  const { configuration: emptyConfiguration, providerLock, ...identity } = deployment;
  const emptySha256 = hash(emptyConfiguration),
    manifestSha256 = canonicalSha256({
      ...identity,
      configurationSha256: emptySha256,
      providerLockSha256: hash(providerLock),
    });
  require(checkpoint.schemaVersion === 1 &&
    checkpoint.phase === 'retiring' &&
    checkpoint.sourcePlanSha256 === original.planSha256 &&
    checkpoint.teardownPlanSha256 === teardown.planSha256 &&
    checkpoint.emptyConfiguration === emptyConfiguration &&
    checkpoint.emptyConfigurationSha256 === emptySha256 &&
    sha(checkpoint.evidenceSha256) &&
    checkpoint.evidenceSha256 === canonicalSha256(checkpoint.evidence) &&
    sha(checkpoint.retirementEvidenceSha256) &&
    checkpoint.retirementEvidenceSha256 === canonicalSha256(checkpoint.retirementEvidence) &&
    checkpoint.checkpointSha256 ===
      canonicalSha256({
        configurationSha256: checkpoint.configurationSha256,
        emptyConfiguration,
        destroy,
        evidence: checkpoint.evidence,
      }), 'terminal checkpoint binding differs');
  require(same(await readRecord('azure-terraform-cloud-destroy-final.json'), destroy) &&
    destroy.operation === 'destroy' &&
    destroy.configurationSha256 === checkpoint.configurationSha256 &&
    destroy.noChanges &&
    destroy.changes.length === 0 &&
    typeof checkpoint.retainedDestroyConfiguration === 'string' &&
    hash(checkpoint.retainedDestroyConfiguration) ===
      destroy.configurationSha256, 'retained destroy configuration or receipt differs');
  const retained = object(parsePrivate(checkpoint.retainedDestroyConfiguration)),
    retainedNetwork = object(checkpoint.retainedNetworkCustody);
  require(same({ terraform: retained.terraform, provider: retained.provider }, JSON.parse(emptyConfiguration)) &&
    retainedNetwork.scope === 'post-destroy-authenticated-network-stage-journal-custody' &&
    same(retainedNetwork.owner, owner) &&
    retainedNetwork.originalPlanSha256 === original.planSha256 &&
    retainedNetwork.teardownPlanSha256 === teardown.planSha256 &&
    same(retainedNetwork.site, site), 'retained provider identity or network source differs');
  for (const receipt of [destroy, final])
    require(receipt.schemaVersion === 1 &&
      receipt.engine === 'terraform' &&
      receipt.deploymentId === deployment.deploymentId &&
      receipt.backendIdentity === deployment.backendIdentity &&
      receipt.providerLockSha256 === hash(providerLock) &&
      sha(receipt.planSha256) &&
      receipt.noChanges &&
      Array.isArray(receipt.changes) &&
      receipt.changes.length === 0 &&
      !receipt.actionInvocations &&
      !receipt.imports &&
      !receipt.relinquishments, 'exact owning no-change receipt required');
  require(!final.operation && final.configurationSha256 === emptySha256, 'ordinary empty final required');
  const session = await step(() => terraform.open(owner, deployment, 'current'));
  const readContinuation = session.readCancelledPlanContinuation,
    readConfiguration = session.readConfiguration,
    readCurrent = session.readCurrentPlanJournal;
  require(typeof readContinuation === 'function' &&
    typeof readConfiguration === 'function' &&
    typeof readCurrent === 'function', 'native continuation readers required');
  for (const key of ['readCancelledPlanContinuation', 'readConfiguration', 'readCurrentPlanJournal'])
    dependencies.push({ target: session, key, value: Reflect.get(session, key) });
  const inspect = async (parent?: AbortSignal) => {
    const active = AbortSignal.any([deadline, ...(parent ? [parent] : [])]);
    const provenance = await step(
      () =>
        readContinuation.call(
          session,
          destroy,
          destroy.configurationSha256,
          emptySha256,
          checkpoint.evidenceSha256 as string,
          final,
          active,
        ),
      parent,
    );
    require(provenance.schemaVersion === 1 &&
      provenance.scope === 'exact-cancelled-plan-current-continuation-provenance' &&
      provenance.cancellationQualified &&
      provenance.manifestSha256 === manifestSha256 &&
      provenance.currentConfigurationSha256 === emptySha256 &&
      provenance.originalReceiptSha256 === canonicalSha256(destroy) &&
      sha(provenance.cancellationRecordSha256) &&
      provenance.originalArchiveSha256s.length > 0 &&
      provenance.originalArchiveSha256s.every(sha) &&
      provenance.continuation.state === 'planned' &&
      provenance.continuation.receiptSha256 === canonicalSha256(final) &&
      provenance.continuation.savedPlanSha256 === final.planSha256 &&
      provenance.continuation.ordinaryRefreshEnabled &&
      sha(provenance.continuation.executionSha256) &&
      provenance.planSemanticsQualified === false &&
      provenance.applicationOutcomeQualified === false &&
      provenance.runnerRetirementQualified === false &&
      provenance.retirementQualified === false, 'native cancellation continuation differs');
    require((await step(() => readConfiguration.call(session, emptySha256), parent)) ===
      emptyConfiguration, 'current empty configuration bytes differ');
    const current = await step(() => readCurrent.call(session, emptySha256, active), parent);
    require(current.state === 'planned' &&
      same(current.receipt, final) &&
      current.manifestSha256 === manifestSha256 &&
      current.ordinaryRefreshEnabled === true &&
      current.savedPlanSha256 === final.planSha256 &&
      current.executionSha256 === provenance.continuation.executionSha256 &&
      current.journalSha256 === provenance.continuation.journalSha256, 'current ordinary native journal differs');
    for (const name of records.keys()) await readRecord(name, parent);
    const now = await step(() => lstat(directory), parent);
    require(now.dev === root.dev &&
      now.ino === root.ino &&
      now.birthtimeMs === root.birthtimeMs &&
      now.isDirectory() &&
      !now.isSymbolicLink() &&
      now.uid === root.uid &&
      (now.mode & 0o077) === 0, 'private directory identity changed');
    seal();
    return { provenance, current };
  };
  const first = await inspect();
  const result = {
    schemaVersion: 1 as const,
    scope: 'authenticated-terminal-empty-main-configuration-binding' as const,
    owner,
    site,
    originalPlanSha256: original.planSha256,
    teardownPlanSha256: teardown.planSha256,
    configurationSha256: emptySha256,
    retainedDestroyConfigurationSha256: destroy.configurationSha256,
    cancellationRecordNameSha256: hash(
      `configuration-cancellation-${canonicalSha256({
        receipt: destroy,
        expectedSha256: destroy.configurationSha256,
        nextSha256: emptySha256,
      })}.json`,
    ),
    cancellationRecordSha256: first.provenance.cancellationRecordSha256,
    finalReceiptSha256: canonicalSha256(final),
    nativeJournalSha256: first.current.journalSha256,
    nativeExecutionSha256: first.current.executionSha256,
    cancellationQualified: true as const,
    ordinaryCurrentJournalQualified: true as const,
    emptyStateQualified: false as const,
    independentCloudCleanupQualified: false as const,
    mainRunnerRetirementQualified: false as const,
    parentRetirementQualified: false as const,
  };
  const digest = canonicalSha256(result);
  witnesses.set(result, {
    originalPlanSha256: original.planSha256,
    store,
    context,
    digest,
    async recheck(parent) {
      require(canonicalSha256(result) === digest && same(await inspect(parent), first), 'native binding changed');
    },
  });
  return result;
}
export async function recheckAzureTerraformNetworkEmptyMainBinding(
  witness: unknown,
  originalPlanSha256: string,
  store: CeDeploymentStore,
  context: AzureTerraformNetworkEmptyMainBindingContext,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const bound = witness && typeof witness === 'object' ? witnesses.get(witness) : undefined;
  require(bound &&
    bound.store === store &&
    bound.context === context &&
    bound.originalPlanSha256 === originalPlanSha256 &&
    canonicalSha256(witness) === bound.digest, 'owning native empty-main witness required');
  await bound.recheck(signal);
}

export type AzureTerraformNetworkEmptyMainAdmission = {
  witness: Awaited<ReturnType<typeof qualifyAzureTerraformNetworkEmptyMainBinding>>;
  context: AzureTerraformNetworkEmptyMainBindingContext;
};
