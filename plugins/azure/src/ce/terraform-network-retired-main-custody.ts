import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, readdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { PlanReceipt } from '../../../terraform/src/runner';
import { canonicalSha256 } from './canonical';
import { azureTerraformCurrentDeployment } from './terraform-foundation';
import type { AzureTerraformNetworkEmptyMainBindingContext } from './terraform-network-empty-main-binding';
import { readAzureTerraformNetworkPowerRunnerHistory } from './terraform-network-power-runner-history';
import { readAzureTerraformNetworkRetirementLineage } from './terraform-network-retirement-lineage';
import { prepareAzureTerraformNetworkTerminalStagingProjection } from './terraform-network-terminal-staging-projection';
import { readAzureTerraformParentPrivateFile } from './terraform-parent-file-custody';
import { compileAzureTerraformTeardown } from './terraform-teardown';
import { matchesAzureTerraformTerminalSnapshot } from './terraform-terminal-snapshot';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

const same = (a: unknown, b: unknown) => canonicalSha256({ value: a }) === canonicalSha256({ value: b });
const hash = (v: string | Uint8Array) => createHash('sha256').update(v).digest('hex');
const sha = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
function require(v: unknown, message: string): asserts v {
  if (!v) throw Error(`Azure network retired-main custody: ${message}`);
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
    nativeRecheck(projected: boolean, signal?: AbortSignal): Promise<void>;
  }
>();

/** Read the owning permanent main barrier and the retained public/child custody it binds.
 * Original main journals are retired; their separately qualified terminal snapshot must be
 * frozen into the exact evidence authenticated by the native marker. Children remain subject
 * to their own current native marker readers. This grants no outer-root, parent, cloud,
 * installed, operational or live acceptance and performs no command or storage mutation.
 */
export async function qualifyAzureTerraformNetworkRetiredMainCustody(
  request: AzureCePlan,
  store: CeDeploymentStore,
  context: AzureTerraformNetworkEmptyMainBindingContext,
  signal?: AbortSignal,
) {
  return qualifyRetiredMainCustody(request, store, context, signal, false);
}

/** Fresh read-only native custody after the exact terminal plaintext projection.
 * The same owning main barrier, complete public lineage and current child markers
 * are required. This supplies no outer-parent inventory, deletion or live authority.
 */
export async function qualifyAzureTerraformNetworkPostPlaintextMainCustody(
  request: AzureCePlan,
  store: CeDeploymentStore,
  context: AzureTerraformNetworkEmptyMainBindingContext,
  signal?: AbortSignal,
) {
  return qualifyRetiredMainCustody(request, store, context, signal, true);
}

async function qualifyRetiredMainCustody<Projected extends boolean>(
  request: AzureCePlan,
  store: CeDeploymentStore,
  context: AzureTerraformNetworkEmptyMainBindingContext,
  signal: AbortSignal | undefined,
  projectedCheckpoint: Projected,
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
  const originalSha256 = canonicalSha256({ value: original }),
    ownerSha256 = canonicalSha256({ value: owner }),
    teardownSha256 = canonicalSha256({ value: teardown }),
    checkpointSha256 = canonicalSha256({ value: checkpoint }),
    siteSha256 = canonicalSha256({ value: site });
  const seal = () => {
    deadline.throwIfAborted();
    require(canonicalSha256({ value: request }) === originalSha256 &&
      canonicalSha256({ value: store.owner }) === ownerSha256 &&
      store.directory === directory &&
      canonicalSha256({ value: context.destroyTeardown }) === teardownSha256 &&
      matchesAzureTerraformTerminalSnapshot(context.terminalCleanup, checkpointSha256) &&
      canonicalSha256({ value: context.site }) === siteSha256 &&
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
          throw Error('Azure network retired-main custody: malformed private record');
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
    final = object(terminal.final) as unknown as PlanReceipt,
    destroy = object(terminal.destroy) as unknown as PlanReceipt,
    retained = object(terminal.retainedTerminalNetworkCustody),
    evidence = object(terminal.retirementEvidence);
  const deployment = await step(() => azureTerraformCurrentDeployment(original));
  const { configuration, providerLock, ...identity } = deployment;
  const configurationSha256 = hash(configuration),
    manifestSha256 = canonicalSha256({ ...identity, configurationSha256, providerLockSha256: hash(providerLock) });
  require(terminal.schemaVersion === 1 &&
    terminal.phase === 'retired' &&
    terminal.sourcePlanSha256 === original.planSha256 &&
    terminal.teardownPlanSha256 === teardown.planSha256 &&
    terminal.emptyConfiguration === configuration &&
    terminal.emptyConfigurationSha256 === configurationSha256 &&
    sha(terminal.evidenceSha256) &&
    terminal.evidenceSha256 === canonicalSha256(terminal.evidence) &&
    sha(terminal.retirementEvidenceSha256) &&
    terminal.retirementEvidenceSha256 === canonicalSha256(evidence) &&
    same(evidence.terminalNetwork, retained) &&
    terminal.checkpointSha256 ===
      canonicalSha256({
        configurationSha256: terminal.configurationSha256,
        emptyConfiguration: configuration,
        destroy,
        evidence: terminal.evidence,
      }), 'retired checkpoint binding differs');
  require(final.schemaVersion === 1 &&
    final.engine === 'terraform' &&
    final.deploymentId === deployment.deploymentId &&
    final.backendIdentity === deployment.backendIdentity &&
    final.configurationSha256 === configurationSha256 &&
    final.providerLockSha256 === hash(providerLock) &&
    sha(final.planSha256) &&
    final.noChanges === true &&
    Array.isArray(final.changes) &&
    final.changes.length === 0 &&
    !final.operation &&
    !final.actionInvocations &&
    !final.imports &&
    !final.relinquishments, 'exact ordinary final receipt required');
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
    (projectedCheckpoint
      ? !Object.hasOwn(terminal, 'retainedDestroyConfiguration') &&
        terminal.retainedDestroyConfigurationSha256 === destroy.configurationSha256
      : typeof terminal.retainedDestroyConfiguration === 'string' &&
        hash(terminal.retainedDestroyConfiguration) ===
          destroy.configurationSha256), 'retained destroy source differs');
  require(retained.scope === 'post-destroy-authenticated-network-stage-journal-custody' &&
    same(retained.owner, owner) &&
    same(retained.site, site) &&
    retained.originalPlanSha256 === original.planSha256 &&
    retained.teardownPlanSha256 === teardown.planSha256 &&
    retained.publicJournalCustodyQualified === true &&
    retained.destroyJournalCustodyQualified === true &&
    retained.currentEmptyMainJournalCustodyQualified === true &&
    retained.powerRunnerRetirementQualified === true &&
    retained.mainRunnerRetirementQualified === false &&
    retained.parentRetirementQualified === false &&
    Array.isArray(retained.retainedPowerChildren) &&
    Array.isArray(retained.stages), 'qualified retained terminal custody required');
  const emptyBinding = object(retained.emptyMainBinding);
  require(emptyBinding.scope === 'authenticated-terminal-empty-main-configuration-binding' &&
    same(emptyBinding.owner, owner) &&
    same(emptyBinding.site, site) &&
    emptyBinding.originalPlanSha256 === original.planSha256 &&
    emptyBinding.teardownPlanSha256 === teardown.planSha256 &&
    emptyBinding.configurationSha256 === configurationSha256 &&
    emptyBinding.retainedDestroyConfigurationSha256 === destroy.configurationSha256 &&
    emptyBinding.finalReceiptSha256 === canonicalSha256(final), 'retained empty-main binding differs');
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
  const session = await step(() => terraform.open(owner, deployment, 'current')),
    readRetirement = session.readArtifactRetirement;
  require(typeof readRetirement === 'function', 'owning native permanent barrier reader required');
  dependencies.push({ target: session, key: 'readArtifactRetirement', value: readRetirement });
  const authenticatedPower = new Map<string, Awaited<ReturnType<typeof readAzureTerraformNetworkPowerRunnerHistory>>>();
  const inspect = async (parent?: AbortSignal) => {
    const active = AbortSignal.any([deadline, ...(parent ? [parent] : [])]);
    await nativeBoundary(parent);
    // Retain the complete private JSON publication namespace as well as native markers.
    // It includes each completed child retirement packet and authentic absence of new
    // cancellation records. Cached semantic proofs can only outlive unchanged custody.
    for (const name of await nativeDirectory(directory, parent))
      if (name.endsWith('.json')) await readRecord(name, parent);
    for (const name of records.keys()) await readRecord(name, parent);
    const mainDirectory = join(directory, deployment.deploymentId);
    require(same(await nativeDirectory(mainDirectory, parent), [
      'artifact-retirement.json',
      'deployment.json',
    ]), 'native main inventory differs');
    const observed = await step(
      () => readRetirement.call(session, final, terminal.retirementEvidenceSha256 as string, active),
      parent,
    );
    require(observed.status === 'runner-artifacts-retired', 'native main barrier is absent or incomplete');
    require(sha(observed.markerSha256) &&
      same(observed.receipt, terminal.artifacts) &&
      observed.receipt.manifestSha256 === manifestSha256 &&
      observed.receipt.evidenceSha256 === terminal.retirementEvidenceSha256 &&
      observed.receipt.finalPlanSha256 === final.planSha256 &&
      sha(observed.receipt.independentCleanupSha256), 'native main barrier binding differs');
    if (projectedCheckpoint) {
      const projection = prepareAzureTerraformNetworkTerminalStagingProjection(checkpoint, observed);
      require(!projection.transformationRequired &&
        same(projection.checkpoint, checkpoint), 'exact post-plaintext checkpoint and frozen parent barrier required');
    }
    await nativeFile(join(mainDirectory, 'artifact-retirement.json'), observed.markerSha256, parent);
    require(same(JSON.parse((await nativeFile(join(mainDirectory, 'deployment.json'), undefined, parent)).toString()), {
      ...identity,
      configurationSha256,
      providerLockSha256: hash(providerLock),
    }), 'native main manifest differs');
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
        const runnerName = runnerNames[0];
        require(runnerNames.length === 1 &&
          typeof runnerName === 'string' &&
          /^[a-zA-Z0-9_-]+$/.test(runnerName), 'native child runner identity differs');
        const runnerDirectory = join(stageDirectory, runnerName);
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
        () => readRetirement.call(session, final, terminal.retirementEvidenceSha256 as string, active),
        parent,
      ),
      observed,
    ), 'native main barrier changed');
    await nativeBoundary(parent);
    for (const name of records.keys()) await readRecord(name, parent);
    const now = await step(() => lstat(directory), parent);
    require(now.dev === root.dev &&
      now.ino === root.ino &&
      now.birthtimeMs === root.birthtimeMs &&
      now.isDirectory() &&
      !now.isSymbolicLink() &&
      now.uid === root.uid &&
      (now.mode & 0o077) === 0, 'private root changed');
    await finalNativeBoundary(parent);
    seal();
    return {
      children,
      lineageSha256: canonicalSha256(lineage),
      markerSha256: observed.markerSha256,
      receiptSha256: canonicalSha256(observed.receipt),
    };
  };
  // No storage/session/loader callbacks occur in this final native snapshot.
  // Semantic qualification remains owning and separate from retained file custody.
  let projectedIdentity: string | undefined;
  const nativeRecordBoundary = async (parent?: AbortSignal, projected = false) => {
    for (const name of records.keys()) {
      const file = await step(() => readAzureTerraformParentPrivateFile(join(directory, name), parent), parent);
      if (projected && name === 'azure-terraform-terminal-cleanup.json') {
        const expected = prepareAzureTerraformNetworkTerminalStagingProjection(checkpoint, {
          status: 'runner-artifacts-retired',
          markerSha256: first.markerSha256,
          receipt: terminal.artifacts,
        });
        require(expected.transformationRequired &&
          hash(file.bytes) === hash(JSON.stringify(expected.checkpoint)) &&
          same(JSON.parse(file.bytes.toString()), expected.checkpoint) &&
          (projectedIdentity === undefined ||
            projectedIdentity === file.identity), 'exact projected terminal custody differs');
        projectedIdentity = file.identity;
      } else
        require(records.get(name) ===
          canonicalSha256({
            identity: file.identity,
            bytes: hash(file.bytes),
          }), 'private record bytes or identity changed');
    }
  };
  const finalNativeBoundary = async (parent?: AbortSignal, projected = false) => {
    seal();
    await nativeRecordBoundary(parent, projected);
    await nativeBoundary(parent);
    const now = await step(() => lstat(directory), parent);
    require(now.dev === root.dev &&
      now.ino === root.ino &&
      now.birthtimeMs === root.birthtimeMs &&
      now.isDirectory() &&
      !now.isSymbolicLink() &&
      now.uid === root.uid &&
      (now.mode & 0o077) === 0 &&
      (await step(() => realpath(directory), parent)) === directory, 'private root changed');
    seal();
  };
  const first = await inspect();
  const result = {
    schemaVersion: 1 as const,
    scope: (projectedCheckpoint
      ? 'post-plaintext-retired-main-authenticated-network-stage-custody'
      : 'retired-main-authenticated-network-stage-custody') as Projected extends true
      ? 'post-plaintext-retired-main-authenticated-network-stage-custody'
      : 'retired-main-authenticated-network-stage-custody',
    owner,
    site,
    originalPlanSha256: original.planSha256,
    teardownPlanSha256: teardown.planSha256,
    stages: first.children.map((child) => child.stage).sort(),
    retainedPowerChildren: first.children,
    retainedLineageSha256: first.lineageSha256,
    mainMarkerSha256: first.markerSha256,
    mainRetirementReceiptSha256: first.receiptSha256,
    retainedTerminalCustodySha256: canonicalSha256(retained),
    publicJournalCustodyQualified: true as const,
    powerRunnerRetirementQualified: true as const,
    mainRunnerRetirementQualified: true as const,
    parentRetirementQualified: false as const,
    independentCloudCleanupQualified: false as const,
    emptyStateQualified: false as const,
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
        same(await inspect(parent), first), 'retained main custody changed');
    },
    async nativeRecheck(projected, parent) {
      require(canonicalSha256(result) === digest, 'retained main custody changed');
      await finalNativeBoundary(parent, projected);
    },
  });
  return result;
}

export async function recheckAzureTerraformNetworkRetiredMainCustody(
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
    canonicalSha256(witness) === bound.digest, 'owning retired-main witness required');
  await bound.recheck(signal);
}

/** Recheck the already owning-authenticated native snapshots without external callbacks.
 * Projected mode derives the sole allowed terminal transformation from the original
 * authenticated checkpoint/barrier. It supplies no parent deletion or live authority.
 */
export async function recheckAzureTerraformNetworkRetiredMainNativeCustody(
  witness: unknown,
  request: AzureCePlan,
  store: CeDeploymentStore,
  context: AzureTerraformNetworkEmptyMainBindingContext,
  projected: boolean,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const bound = witness && typeof witness === 'object' ? witnesses.get(witness) : undefined;
  require(bound &&
    bound.request === request &&
    bound.store === store &&
    bound.context === context &&
    canonicalSha256(witness) === bound.digest, 'owning retired-main witness required');
  await bound.nativeRecheck(projected, signal);
}
