import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, readdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { PlanReceipt } from '../../../terraform/src/runner';
import { canonicalSha256 } from './canonical';
import { azureTerraformCurrentDeployment } from './terraform-foundation';
import { qualifyAzureTerraformNetworkDestroyJournalCustody } from './terraform-network-destroy-journal-custody';
import type { AzureTerraformNetworkEmptyMainBindingContext } from './terraform-network-empty-main-binding';
import { readAzureTerraformNetworkPowerRunnerHistory } from './terraform-network-power-runner-history';
import { readAzureTerraformNetworkRetirementLineage } from './terraform-network-retirement-lineage';
import { compileAzureTerraformTeardown } from './terraform-teardown';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

const same = (a: unknown, b: unknown) => canonicalSha256({ value: a }) === canonicalSha256({ value: b });
const hash = (v: string | Uint8Array) => createHash('sha256').update(v).digest('hex');
const sha = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
function require(v: unknown, message: string): asserts v {
  if (!v) throw Error(`Azure network cancellation/planning binding: ${message}`);
}
function object(v: unknown): Record<string, unknown> {
  require(v && typeof v === 'object' && !Array.isArray(v), 'complete record required');
  return v as Record<string, unknown>;
}
const witnesses = new WeakMap<
  object,
  {
    request: AzureCePlan;
    store: CeDeploymentStore;
    context: AzureTerraformNetworkEmptyMainBindingContext;
    digest: string;
    recheck(signal?: AbortSignal): Promise<void>;
    refresh(signal?: AbortSignal): Promise<unknown>;
  }
>();

/** Separate read-only cancellation/planning admission. Completed native cancellation with
 * an absent slot permits ordinary planning; an authenticated ordinary slot returns its exact
 * receipt for recovery. Pending cancellation permits only the native owner's cancellation
 * recovery. Retained custody is frozen into native cancellation evidence, then independently
 * reauthenticated against public lineage and child markers. No CLI, repair, empty state,
 * main/parent retirement, cloud, installed or live acceptance is supplied here.
 */
export async function qualifyAzureTerraformNetworkCancelledMainBinding(
  request: AzureCePlan,
  store: CeDeploymentStore,
  context: AzureTerraformNetworkEmptyMainBindingContext,
  signal?: AbortSignal,
) {
  const original = structuredClone(request),
    owner = structuredClone(store.owner),
    directory = store.directory,
    teardown = structuredClone(context.destroyTeardown),
    checkpoint = structuredClone(context.terminalCleanup),
    site = structuredClone(context.site),
    { terraform, publicSession, loaders, verifier, replacementVerifier } = context;
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
      same(context.destroyTeardown, teardown) &&
      same(context.terminalCleanup, checkpoint) &&
      same(context.site, site) &&
      context.terraform === terraform &&
      context.publicSession === publicSession &&
      context.loaders === loaders &&
      context.verifier === verifier &&
      context.replacementVerifier === replacementVerifier &&
      dependencies.every(({ target, key, value }) => Reflect.get(target, key) === value), 'owning context changed');
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
        let parsed: unknown;
        try {
          parsed = JSON.parse(bytes.toString());
        } catch {
          throw Error('Azure network cancellation/planning binding: malformed private record');
        }
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
          same(parsed, logical), 'private record custody differs');
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
    (await step(() => realpath(directory))) === directory, 'private root differs');
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
    teardown.retirement[0]?.siteUid === site.siteUid, 'compiled owner or teardown differs');
  await step(() => store.verify());
  require(same(await readRecord(`${teardown.planId}.json`), teardown), 'saved teardown differs');
  require(same(await readRecord(`${teardown.planId}-authorization.json`), {
    schemaVersion: 1,
    engine: 'terraform',
    sourcePlanSha256: original.planSha256,
    teardownPlanSha256: teardown.planSha256,
    mutations: true,
  }), 'saved authorization differs');
  const lifecycle = object(await readRecord('azure-terraform-lifecycle-retirement.json'));
  require(lifecycle.schemaVersion === 1 &&
    lifecycle.kind === teardown.kind &&
    same(lifecycle.owner, owner) &&
    lifecycle.sourcePlanSha256 === original.planSha256 &&
    lifecycle.teardownPlanSha256 === teardown.planSha256, 'saved lifecycle differs');
  require(same(
    await readRecord('azure-terraform-terminal-cleanup.json'),
    checkpoint,
  ), 'saved terminal checkpoint differs');
  const terminal = object(checkpoint),
    destroy = object(terminal.destroy) as unknown as PlanReceipt,
    retained = object(terminal.retainedNetworkCustody),
    evidence = object(terminal.evidence);
  const deployment = await step(() => azureTerraformCurrentDeployment(original));
  const { configuration, providerLock, ...identity } = deployment;
  const configurationSha256 = hash(configuration),
    manifestOf = (digest: string) =>
      canonicalSha256({ ...identity, configurationSha256: digest, providerLockSha256: hash(providerLock) });
  require(terminal.schemaVersion === 1 &&
    ['cancelling', 'planning'].includes(String(terminal.phase)) &&
    terminal.final === undefined &&
    terminal.retirementEvidence === undefined &&
    terminal.artifacts === undefined &&
    terminal.sourcePlanSha256 === original.planSha256 &&
    terminal.teardownPlanSha256 === teardown.planSha256 &&
    terminal.emptyConfiguration === configuration &&
    terminal.emptyConfigurationSha256 === configurationSha256 &&
    sha(terminal.evidenceSha256) &&
    terminal.evidenceSha256 === canonicalSha256(evidence) &&
    same(evidence.network, retained) &&
    terminal.checkpointSha256 ===
      canonicalSha256({
        configurationSha256: terminal.configurationSha256,
        emptyConfiguration: configuration,
        destroy,
        evidence,
      }), 'cancellation checkpoint binding differs');
  require(same(await readRecord('azure-terraform-cloud-destroy-final.json'), destroy) &&
    destroy.operation === 'destroy' &&
    destroy.schemaVersion === 1 &&
    destroy.engine === 'terraform' &&
    destroy.deploymentId === deployment.deploymentId &&
    destroy.backendIdentity === deployment.backendIdentity &&
    destroy.providerLockSha256 === hash(providerLock) &&
    sha(destroy.planSha256) &&
    destroy.noChanges === true &&
    Array.isArray(destroy.changes) &&
    destroy.changes.length === 0 &&
    !destroy.actionInvocations &&
    !destroy.imports &&
    !destroy.relinquishments &&
    destroy.configurationSha256 === terminal.configurationSha256 &&
    typeof terminal.retainedDestroyConfiguration === 'string' &&
    hash(terminal.retainedDestroyConfiguration) === destroy.configurationSha256, 'retained destroy source differs');
  const retainedConfiguration = object(JSON.parse(terminal.retainedDestroyConfiguration));
  require(same(
    { terraform: retainedConfiguration.terraform, provider: retainedConfiguration.provider },
    JSON.parse(configuration),
  ), 'retained provider and execution identity differ');
  require(retained.scope === 'post-destroy-authenticated-network-stage-journal-custody' &&
    same(retained.owner, owner) &&
    same(retained.site, site) &&
    retained.originalPlanSha256 === original.planSha256 &&
    retained.teardownPlanSha256 === teardown.planSha256 &&
    retained.publicJournalCustodyQualified === true &&
    retained.destroyJournalCustodyQualified === true &&
    retained.powerRunnerRetirementQualified === true &&
    retained.mainRunnerRetirementQualified === false &&
    retained.parentRetirementQualified === false &&
    retained.currentEmptyMainJournalCustodyQualified === undefined &&
    Array.isArray(retained.retainedPowerChildren) &&
    Array.isArray(retained.stages), 'qualified retained destroy custody required');
  // A native semantic reader authenticates content. Retain its filesystem custody
  // separately across subsequent witness uses, including identical-byte replacement.
  const nativeFiles = new Map<string, { identity: string; bytes: string }>();
  const nativeDirectories = new Map<string, { identity: string; names: string[] }>();
  const nativeDirectory = async (path: string, parent?: AbortSignal) =>
    step(async () => {
      const before = await lstat(path),
        names = (await readdir(path)).sort(),
        after = await lstat(path);
      require(before.isDirectory() &&
        !before.isSymbolicLink() &&
        before.uid === process.getuid?.() &&
        (before.mode & 0o077) === 0 &&
        (await realpath(path)) === path &&
        after.isDirectory() &&
        !after.isSymbolicLink() &&
        before.dev === after.dev &&
        before.ino === after.ino &&
        before.birthtimeMs === after.birthtimeMs &&
        after.uid === before.uid &&
        (after.mode & 0o077) === 0, 'native directory custody differs');
      const snapshot = { identity: `${before.dev}:${before.ino}:${before.birthtimeMs}`, names };
      require(!nativeDirectories.has(path) ||
        same(nativeDirectories.get(path), snapshot), 'native directory identity or inventory changed');
      nativeDirectories.set(path, snapshot);
      return names;
    }, parent);
  const nativeFile = async (path: string, expectedSha256?: string, parent?: AbortSignal) =>
    step(async () => {
      const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const first = await file.stat(),
          bytes = await file.readFile(),
          last = await file.stat(),
          named = await lstat(path);
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
          named.birthtimeMs === first.birthtimeMs &&
          named.uid === first.uid &&
          named.nlink === 1 &&
          (named.mode & 0o077) === 0, 'native file changed during read');
        const snapshot = { identity: `${first.dev}:${first.ino}:${first.birthtimeMs}`, bytes: hash(bytes) };
        require((expectedSha256 === undefined || snapshot.bytes === expectedSha256) &&
          (!nativeFiles.has(path) || same(nativeFiles.get(path), snapshot)), 'native file bytes or identity changed');
        nativeFiles.set(path, snapshot);
        return bytes;
      } finally {
        await file.close();
      }
    }, parent);
  const nativeBoundary = async (parent?: AbortSignal) => {
    for (const path of nativeDirectories.keys()) await nativeDirectory(path, parent);
    for (const path of nativeFiles.keys()) await nativeFile(path, undefined, parent);
  };
  const session = await step(() => terraform.open(owner, deployment, 'current'));
  const readCancellation = session.readUnsubmittedPlanCancellation,
    readCurrent = session.readCurrentPlanJournal,
    readContinuation = session.readCancelledPlanContinuation,
    readConfiguration = session.readConfiguration;
  require(readCancellation &&
    readCurrent &&
    readContinuation &&
    readConfiguration, 'native cancellation and current readers required');
  for (const key of [
    'readUnsubmittedPlanCancellation',
    'readCurrentPlanJournal',
    'readCancelledPlanContinuation',
    'readConfiguration',
  ])
    dependencies.push({ target: session, key, value: Reflect.get(session, key) });
  const authenticatedPower = new Map<string, Awaited<ReturnType<typeof readAzureTerraformNetworkPowerRunnerHistory>>>();
  const inspect = async (parent?: AbortSignal) => {
    const active = AbortSignal.any([deadline, ...(parent ? [parent] : [])]);
    await nativeBoundary(parent);
    for (const name of await nativeDirectory(directory, parent))
      if (name.endsWith('.json')) await readRecord(name, parent);
    for (const name of records.keys()) await readRecord(name, parent);
    const mainDirectory = join(directory, deployment.deploymentId);
    const mainNames = await nativeDirectory(mainDirectory, parent);
    require(!mainNames.includes('artifact-retirement.json'), 'main retirement is outside cancellation/planning');
    for (const name of mainNames)
      if (name.endsWith('.json') || name === 'saved.tfplan')
        await nativeFile(join(mainDirectory, name), undefined, parent);
    for (const rootName of ['revisions', 'plan-history'])
      if (mainNames.includes(rootName)) {
        const archiveRoot = join(mainDirectory, rootName);
        for (const archive of await nativeDirectory(archiveRoot, parent)) {
          require((rootName === 'revisions' ? /^[a-f0-9-]{36}$/ : /^[a-f0-9]{64}$/).test(
            archive,
          ), 'archive identity differs');
          const path = join(archiveRoot, archive);
          for (const name of await nativeDirectory(path, parent)) await nativeFile(join(path, name), undefined, parent);
        }
      }
    const cancellation = await step(
      () =>
        readCancellation.call(
          session,
          destroy,
          destroy.configurationSha256,
          configurationSha256,
          terminal.evidenceSha256 as string,
          active,
        ),
      parent,
    );
    require(cancellation.schemaVersion === 1 &&
      cancellation.scope === 'exact-unsubmitted-plan-cancellation-provenance' &&
      ['absent', 'pending', 'cancelled'].includes(cancellation.status) &&
      [destroy.configurationSha256, configurationSha256].includes(cancellation.currentConfigurationSha256) &&
      cancellation.manifestSha256 === manifestOf(cancellation.currentConfigurationSha256) &&
      cancellation.originalReceiptSha256 === canonicalSha256(destroy) &&
      cancellation.cancellationQualified === (cancellation.status === 'cancelled') &&
      cancellation.applicationOutcomeQualified === false &&
      cancellation.runnerRetirementQualified === false &&
      cancellation.retirementQualified === false, 'native cancellation identity differs');
    let currentPlanReceipt: PlanReceipt | null = null;
    let ordinaryCurrentJournalQualified = false;
    let ordinaryPlanReady = false;
    let currentJournalSha256: string | null = null;
    let initialDestroyCustody:
      | Awaited<ReturnType<typeof qualifyAzureTerraformNetworkDestroyJournalCustody>>
      | undefined;
    if (cancellation.status === 'absent') {
      require(cancellation.cancellationRecordSha256 === null &&
        cancellation.currentConfigurationSha256 === destroy.configurationSha256 &&
        terminal.phase === 'cancelling', 'first cancellation requires original current configuration');
      const custody = await step(
        () => qualifyAzureTerraformNetworkDestroyJournalCustody(request, store, context, active),
        parent,
      );
      require(same(custody, retained), 'retained custody differs before first cancellation');
      initialDestroyCustody = custody;
      require((await step(() => readConfiguration.call(session, destroy.configurationSha256), parent)) ===
        terminal.retainedDestroyConfiguration, 'retained current destroy bytes differ');
    } else {
      require(sha(cancellation.cancellationRecordSha256) &&
        cancellation.originalArchiveSha256s.every(sha), 'native cancellation record differs');
      if (cancellation.status === 'cancelled') {
        require(cancellation.currentConfigurationSha256 === configurationSha256 &&
          cancellation.originalArchiveSha256s.length > 0 &&
          (await step(() => readConfiguration.call(session, configurationSha256), parent)) ===
            configuration, 'completed cancellation lacks exact archived original and current empty configuration');
        const current = await step(() => readCurrent.call(session, configurationSha256, active), parent);
        require(current.manifestSha256 === manifestOf(configurationSha256), 'current native manifest differs');
        if (current.state === 'absent') {
          require(current.receipt === undefined &&
            current.savedPlanSha256 === null &&
            current.journalSha256 === null, 'ordinary current slot is partial');
          ordinaryPlanReady = true;
        } else {
          const final = current.receipt;
          require(current.state === 'planned' &&
            final &&
            !final.operation &&
            final.noChanges === true &&
            Array.isArray(final.changes) &&
            final.changes.length === 0 &&
            !final.actionInvocations &&
            !final.imports &&
            !final.relinquishments &&
            final.configurationSha256 === configurationSha256 &&
            final.deploymentId === deployment.deploymentId &&
            final.backendIdentity === deployment.backendIdentity &&
            final.providerLockSha256 === hash(providerLock) &&
            sha(final.planSha256) &&
            current.savedPlanSha256 === final.planSha256 &&
            current.ordinaryRefreshEnabled === true &&
            sha(current.executionSha256) &&
            sha(current.journalSha256), 'exact ordinary planned continuation required');
          const continuation = await step(
            () =>
              readContinuation.call(
                session,
                destroy,
                destroy.configurationSha256,
                configurationSha256,
                terminal.evidenceSha256 as string,
                final,
                active,
              ),
            parent,
          );
          require(continuation.cancellationQualified &&
            continuation.manifestSha256 === current.manifestSha256 &&
            continuation.currentConfigurationSha256 === configurationSha256 &&
            continuation.originalReceiptSha256 === canonicalSha256(destroy) &&
            continuation.cancellationRecordSha256 === cancellation.cancellationRecordSha256 &&
            continuation.continuation.state === 'planned' &&
            continuation.continuation.receiptSha256 === canonicalSha256(final) &&
            continuation.continuation.savedPlanSha256 === final.planSha256 &&
            continuation.continuation.journalSha256 === current.journalSha256 &&
            continuation.continuation.executionSha256 === current.executionSha256 &&
            continuation.continuation.ordinaryRefreshEnabled, 'native ordinary continuation differs');
          currentPlanReceipt = structuredClone(final);
          ordinaryCurrentJournalQualified = true;
          currentJournalSha256 = current.journalSha256;
        }
      }
    }
    if (initialDestroyCustody) {
      // The complete current-only collector already authenticated public lineage and each
      // native child retirement. Preserve its exact witness result and independently retain
      // marker/manifest bytes and inodes; do not replay those same historical inspectors a
      // second time. Every absent-phase recheck invokes the full collector again.
      const children = structuredClone(initialDestroyCustody.retainedPowerChildren);
      for (const child of children) {
        const stageDirectory = join(directory, 'terraform-stages', child.stage);
        const names = await nativeDirectory(stageDirectory, parent);
        require(names.length === 1 &&
          /^[a-zA-Z0-9_-]+$/.test(requirePresent(names[0])), 'native child runner identity differs');
        const path = join(stageDirectory, requirePresent(names[0]));
        require(same(await nativeDirectory(path, parent), [
          'artifact-retirement.json',
          'deployment.json',
        ]), 'native child inventory differs');
        const proof = object(child.proof),
          observed = object(proof.observed),
          receipt = object(observed.receipt);
        require(observed.status === 'runner-artifacts-retired' &&
          sha(observed.markerSha256) &&
          sha(receipt.manifestSha256), 'native child proof incomplete');
        await nativeFile(join(path, 'artifact-retirement.json'), observed.markerSha256, parent);
        require(canonicalSha256(
          JSON.parse((await nativeFile(join(path, 'deployment.json'), undefined, parent)).toString()),
        ) === receipt.manifestSha256, 'native child manifest differs');
      }
      require(same(
        await step(
          () =>
            readCancellation.call(
              session,
              destroy,
              destroy.configurationSha256,
              configurationSha256,
              terminal.evidenceSha256 as string,
              active,
            ),
          parent,
        ),
        cancellation,
      ), 'native cancellation changed');
      await nativeBoundary(parent);
      for (const name of records.keys()) await readRecord(name, parent);
      seal();
      return {
        cancellationStatus: cancellation.status,
        cancellationRecordSha256: cancellation.cancellationRecordSha256,
        cancellationQualified: cancellation.cancellationQualified,
        currentPlanReceipt,
        ordinaryCurrentJournalQualified,
        ordinaryPlanReady,
        currentJournalSha256,
        children,
        lineageSha256: canonicalSha256(initialDestroyCustody.retainedLineage),
      };
    }
    const lineage = await step(
      () =>
        readAzureTerraformNetworkRetirementLineage(
          original,
          publicSession,
          store,
          loaders,
          site,
          verifier,
          active,
          replacementVerifier,
        ),
      parent,
    );
    require(same(lineage, retained.retainedLineage) &&
      lineage.rows.every((row) =>
        ['staged-network', 'completed-replacement', 'unstaged-no-outcome'].includes(row.execution),
      ), 'retained public lineage differs');
    const children = [];
    for (const row of lineage.rows.filter((row) => row.execution === 'staged-network')) {
      const source = await step(() => loaders.loadSource(row.planSha256), parent);
      require(source.planSha256 === row.planSha256 &&
        same(azureUpgradeBinding(source).owner, owner), 'retained child source differs');
      let power = authenticatedPower.get(row.planSha256);
      if (!power) {
        power = await step(
          () =>
            readAzureTerraformNetworkPowerRunnerHistory(
              source,
              store,
              terraform,
              loaders,
              site,
              verifier,
              active,
              replacementVerifier,
            ),
          parent,
        );
        authenticatedPower.set(row.planSha256, structuredClone(power));
      }
      // Initial native owner inspection authenticates the completed proof. Later reads
      // retain its exact marker, manifest and publication bytes/inodes, and independently
      // reauthenticate public lineage; they do not replay all historical child inspectors.

      require(power.graphSha256 === row.graphSha256 && power.rows.length > 0, 'retained child graph differs');
      for (const child of power.rows) {
        const retirement = child.retirement;
        require(child.status === 'retired' &&
          retirement?.runnerRetirementQualified &&
          retirement.sourcePlanSha256 === row.planSha256 &&
          retirement.stage === child.stage, 'retained child native marker incomplete');
        const stageDirectory = join(directory, 'terraform-stages', child.stage);
        const runnerNames = await nativeDirectory(stageDirectory, parent);
        require(runnerNames.length === 1 &&
          /^[a-zA-Z0-9_-]+$/.test(requirePresent(runnerNames[0])), 'native child runner identity differs');
        const runnerDirectory = join(stageDirectory, requirePresent(runnerNames[0]));
        require(same(await nativeDirectory(runnerDirectory, parent), [
          'artifact-retirement.json',
          'deployment.json',
        ]), 'native child inventory differs');
        const proof = object(retirement.proof),
          observedChild = object(proof.observed),
          childReceipt = object(observedChild.receipt);
        require(observedChild.status === 'runner-artifacts-retired' &&
          sha(observedChild.markerSha256) &&
          sha(childReceipt.manifestSha256), 'native child proof incomplete');
        await nativeFile(join(runnerDirectory, 'artifact-retirement.json'), observedChild.markerSha256, parent);
        require(canonicalSha256(
          JSON.parse((await nativeFile(join(runnerDirectory, 'deployment.json'), undefined, parent)).toString()),
        ) === childReceipt.manifestSha256, 'native child manifest differs');
        children.push({
          networkPlanSha256: row.planSha256,
          node: retirement.node,
          operation: retirement.operation,
          stage: child.stage,
          retirementSha256: canonicalSha256(retirement),
          proof: structuredClone(retirement.proof),
        });
      }
    }
    children.sort((a, b) => a.stage.localeCompare(b.stage));
    require(same(children, retained.retainedPowerChildren) &&
      same(children.map((child) => child.stage).sort(), retained.stages) &&
      new Set(children.map((child) => `${child.networkPlanSha256}:${child.node}:${child.operation}`)).size ===
        children.length, 'retained child identities differ, duplicate or are partial');
    require(same(
      await step(
        () =>
          readAzureTerraformNetworkRetirementLineage(
            original,
            publicSession,
            store,
            loaders,
            site,
            verifier,
            active,
            replacementVerifier,
          ),
        parent,
      ),
      lineage,
    ), 'public lineage changed');
    require(same(
      await step(
        () =>
          readCancellation.call(
            session,
            destroy,
            destroy.configurationSha256,
            configurationSha256,
            terminal.evidenceSha256 as string,
            active,
          ),
        parent,
      ),
      cancellation,
    ), 'native cancellation changed');
    await nativeBoundary(parent);
    for (const name of records.keys()) await readRecord(name, parent);
    seal();
    return {
      cancellationStatus: cancellation.status,
      cancellationRecordSha256: cancellation.cancellationRecordSha256,
      cancellationQualified: cancellation.cancellationQualified,
      currentPlanReceipt,
      ordinaryCurrentJournalQualified,
      ordinaryPlanReady,
      currentJournalSha256,
      children,
      lineageSha256: canonicalSha256(lineage),
    };
  };
  const mint = (first: Awaited<ReturnType<typeof inspect>>) => {
    const result = {
      schemaVersion: 1 as const,
      scope: 'authenticated-terminal-cancellation-planning-binding' as const,
      owner,
      site,
      originalPlanSha256: original.planSha256,
      teardownPlanSha256: teardown.planSha256,
      retainedDestroyConfigurationSha256: destroy.configurationSha256,
      configurationSha256,
      ...first,
      stages: first.children.map((child) => child.stage).sort(),
      publicJournalCustodyQualified: true as const,
      powerRunnerRetirementQualified: true as const,
      emptyStateQualified: false as const,
      independentCloudCleanupQualified: false as const,
      mainRunnerRetirementQualified: false as const,
      parentRetirementQualified: false as const,
      currentOperationalAcceptanceQualified: false as const,
    };
    const digest = canonicalSha256(result);
    witnesses.set(result, {
      request,
      store,
      context,
      digest,
      async recheck(parent) {
        require(canonicalSha256(result) === digest &&
          same(await inspect(parent), first), 'cancellation/planning custody changed');
      },
      async refresh(parent) {
        seal();
        require(canonicalSha256(result) === digest &&
          first.cancellationStatus === 'cancelled' &&
          first.ordinaryPlanReady &&
          first.currentPlanReceipt === null &&
          !first.ordinaryCurrentJournalQualified, 'owning previously absent ordinary slot required');
        const mainDirectory = join(directory, deployment.deploymentId),
          prior = nativeDirectories.get(mainDirectory);
        require(prior &&
          !prior.names.includes('plan-receipt.json') &&
          !prior.names.includes('saved.tfplan'), 'original absent current namespace required');
        // Exactly the two ordinary plan files may appear. Preserve directory identity, every
        // preexisting native file/archive and all public/child snapshots. inspect reauthenticates
        // the completed native cancellation, exact ordinary continuation and public lineage.
        const before = await step(() => lstat(mainDirectory), parent),
          names = (await step(() => readdir(mainDirectory), parent)).sort();
        require(`${before.dev}:${before.ino}:${before.birthtimeMs}` === prior.identity &&
          same(
            names,
            [...prior.names, 'plan-receipt.json', 'saved.tfplan'].sort(),
          ), 'ordinary continuation namespace differs');
        nativeDirectories.set(mainDirectory, { ...prior, names });
        const current = await inspect(parent);
        require(current.cancellationStatus === 'cancelled' &&
          current.ordinaryCurrentJournalQualified &&
          !current.ordinaryPlanReady &&
          current.currentPlanReceipt !== null &&
          same(current.children, first.children) &&
          current.lineageSha256 === first.lineageSha256, 'ordinary continuation or retained custody differs');
        return mint(current);
      },
    });
    return result;
  };
  return mint(await inspect());
}
export async function recheckAzureTerraformNetworkCancelledMainBinding(
  witness: unknown,
  request: AzureCePlan,
  store: CeDeploymentStore,
  context: AzureTerraformNetworkEmptyMainBindingContext,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const bound = witness && typeof witness === 'object' ? witnesses.get(witness) : undefined;
  require(bound &&
    bound.request === request &&
    bound.store === store &&
    bound.context === context &&
    canonicalSha256(witness) === bound.digest, 'owning cancellation/planning witness required');
  await bound.recheck(signal);
}

/** Under the owning lifecycle lock, refresh only an authenticated absent ordinary slot after
 * native planning. This retains all existing native/public/child custody and accepts exactly
 * the verified ordinary plan/journal addition, avoiding duplicate child owner inspection.
 */
export async function refreshAzureTerraformNetworkCancelledMainBinding(
  witness: unknown,
  request: AzureCePlan,
  store: CeDeploymentStore,
  context: AzureTerraformNetworkEmptyMainBindingContext,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const bound = witness && typeof witness === 'object' ? witnesses.get(witness) : undefined;
  require(bound &&
    bound.request === request &&
    bound.store === store &&
    bound.context === context &&
    canonicalSha256(witness) === bound.digest, 'owning cancellation/planning witness required');
  return (await bound.refresh(signal)) as Awaited<ReturnType<typeof qualifyAzureTerraformNetworkCancelledMainBinding>>;
}

function requirePresent<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw Error('Required qualified evidence is missing');
  return value;
}
