import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open as openFile, readdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { PlanReceipt } from '../../../terraform/src/runner';
import type { CeTerraformService, TerraformSession } from '../../../terraform/src/service';
import { type SessionManagerLike, verifyAzureCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import { azureTerraformCurrentDeployment } from './terraform-foundation';
import type { AzureTerraformNetworkAcceptanceVerifier } from './terraform-network-checkpoint';
import {
  type AzureTerraformNetworkEmptyMainAdmission,
  recheckAzureTerraformNetworkEmptyMainBinding,
} from './terraform-network-empty-main-binding';
import type { AzureTerraformNetworkHistoryLoaders } from './terraform-network-generation-history';
import { readAzureTerraformNetworkMainRunnerHistory } from './terraform-network-main-runner-history';
import { readAzureTerraformNetworkPowerRunnerHistory } from './terraform-network-power-runner-history';
import type { AzureTerraformNetworkReplacementCompletedVerifier } from './terraform-network-replacement-completion';
import { readAzureTerraformNetworkReplacementReceiptProvenance } from './terraform-network-replacement-receipt-provenance';
import {
  readAzureTerraformNetworkRetirementGraph,
  recheckAzureTerraformNetworkRetirementGraph,
} from './terraform-network-retirement-graph';
import { readAzureTerraformNetworkRetirementRequests } from './terraform-network-retirement-requests';
import { readAzureTerraformOriginalReceiptProvenance } from './terraform-original-receipt-provenance';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

const same = (a: unknown, b: unknown) => canonicalSha256({ value: a }) === canonicalSha256({ value: b });
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure Terraform network retirement lineage: ${message}`);
}
type Site = { siteUid: string; siteConfigurationSha256: string };
type Graph = Awaited<ReturnType<typeof readAzureTerraformNetworkRetirementGraph>>;
type Row = {
  planSha256: string;
  kind: 'network-update' | 'node-replacement';
  execution:
    | 'staged-network'
    | 'unstaged-no-outcome'
    | 'unstaged-outcome-present'
    | 'unqualified-replacement'
    | 'completed-replacement';
  graphSha256?: string;
  replacementProvenanceSha256?: string;
};
type Lineage = Awaited<ReturnType<typeof readAzureTerraformNetworkRetirementLineage>>;
const witnesses = new WeakMap<
  object,
  {
    store: CeDeploymentStore;
    loaders: AzureTerraformNetworkHistoryLoaders;
    verifier: AzureTerraformNetworkAcceptanceVerifier;
    replacementVerifier?: AzureTerraformNetworkReplacementCompletedVerifier;
    siteSha256: string;
    staged: Map<string, Graph>;
    replacements: Map<string, Awaited<ReturnType<typeof readAzureTerraformNetworkReplacementReceiptProvenance>>>;
    resultSha256: string;
    assertContext(): void;
    recheck(signal?: AbortSignal): Promise<Lineage>;
  }
>();

/** Only an in-memory witness minted from complete public inventory and authentic execution graphs
 * can qualify another generation's installed configuration. A serialized configuration list cannot.
 * The selected graph and all inventory/source/absence bindings are rechecked under the mint's deadline.
 */
export async function recheckAzureTerraformNetworkRetirementLineage(
  witness: unknown,
  request: AzureCePlan,
  store: CeDeploymentStore,
  loaders: AzureTerraformNetworkHistoryLoaders,
  site: Site,
  verifier: AzureTerraformNetworkAcceptanceVerifier,
  signal?: AbortSignal,
  replacementVerifier?: AzureTerraformNetworkReplacementCompletedVerifier,
) {
  signal?.throwIfAborted();
  const bound = witness && typeof witness === 'object' ? witnesses.get(witness) : undefined;
  require(bound, 'owning authenticated lineage witness required');
  const context = () =>
    require(bound.store === store &&
      bound.loaders === loaders &&
      bound.verifier === verifier &&
      bound.replacementVerifier === replacementVerifier &&
      bound.siteSha256 === canonicalSha256(site) &&
      bound.staged.has(request.planSha256) &&
      canonicalSha256(witness) === bound.resultSha256, 'owning authenticated lineage context required');
  context();
  const result = await bound.recheck(signal);
  const graph = await recheckAzureTerraformNetworkRetirementGraph(
    bound.staged.get(request.planSha256),
    request,
    store,
    loaders,
    site,
    verifier,
    signal,
    replacementVerifier,
  );
  context();
  require(canonicalSha256(result) === bound.resultSha256, 'authenticated lineage changed');
  // The private witnesses remain internal. Callers inspect isolated snapshots across later awaits.
  return { lineage: structuredClone(result), graph: structuredClone(graph) };
}

/** Private read-only configuration lineage. Missing source-stage packets retain an unstaged state
 * with exact public/source identity, absent request packets/child directories and absent outcome.
 * Shared-main journal absence has not been established for these requests; planning-only is unqualified.
 * Completed replacement rows add only configurations authenticated by owning completion and original receipts.
 * A replacement with explicit absent outcome and no owning packet/child namespace is unstaged.
 * The collector separately proves exhaustive shared-main absence; current operational acceptance is separate.
 * Graph authentication does not establish main journals, child retirement or current operational health.
 */
export async function readAzureTerraformNetworkRetirementLineage(
  originalRequest: AzureCePlan,
  publicSession: SessionManagerLike,
  store: CeDeploymentStore,
  loaders: AzureTerraformNetworkHistoryLoaders,
  siteRequest: Site,
  verifier: AzureTerraformNetworkAcceptanceVerifier,
  signal?: AbortSignal,
  replacementVerifier?: AzureTerraformNetworkReplacementCompletedVerifier,
) {
  const original = structuredClone(originalRequest),
    site = structuredClone(siteRequest),
    owner = structuredClone(store.owner),
    directory = store.directory;
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const bindings = [
    { target: store, key: 'read', value: store.read },
    { target: store, key: 'verify', value: store.verify },
    { target: loaders, key: 'loadSource', value: loaders.loadSource },
    { target: loaders, key: 'loadOutcome', value: loaders.loadOutcome },
    { target: publicSession, key: 'getSessionId', value: publicSession.getSessionId },
    { target: publicSession, key: 'getArtifactsDir', value: publicSession.getArtifactsDir },
    { target: publicSession, key: 'getArtifactPath', value: publicSession.getArtifactPath },
    { target: publicSession, key: 'saveArtifact', value: publicSession.saveArtifact },
  ];
  const seal = () => {
    deadline.throwIfAborted();
    require(same(originalRequest, original) &&
      same(siteRequest, site) &&
      same(store.owner, owner) &&
      store.directory === directory &&
      bindings.every(
        ({ target, key, value }) => Reflect.get(target, key) === value,
      ), 'request or owning dependencies changed');
  };
  const step = async <T>(action: () => Promise<T>, parentSignal?: AbortSignal): Promise<T> => {
    seal();
    const active = AbortSignal.any([deadline, ...(parentSignal ? [parentSignal] : [])]);
    active.throwIfAborted();
    const aborted = Promise.withResolvers<never>(),
      onAbort = () => aborted.reject(active.reason);
    active.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([action(), aborted.promise]);
      active.throwIfAborted();
      seal();
      return result;
    } finally {
      active.removeEventListener('abort', onAbort);
    }
  };
  seal();
  verifyAzureCePlan(original);
  require(original.engine === 'terraform' &&
    original.intent.operation === 'deploy' &&
    same(azureUpgradeBinding(original).owner, owner), 'original deployment ownership differs');
  await step(() => store.verify());
  const inventory = await step(() => readAzureTerraformNetworkRetirementRequests(original, publicSession, deadline));
  const sources = new Map<string, AzureCePlan>(),
    graphs = new Map<string, Graph>(),
    replacements = new Map<string, Awaited<ReturnType<typeof readAzureTerraformNetworkReplacementReceiptProvenance>>>(),
    outcomes = new Map<string, unknown>(),
    rows: Row[] = [];
  const exactSource = async (digest: string) => {
    const source = await step(() => loaders.loadSource(digest));
    verifyAzureCePlan(source);
    require(source.planSha256 === digest &&
      same(azureUpgradeBinding(source).owner, owner), 'exact source identity differs');
    sources.set(digest, structuredClone(source));
    return source;
  };
  require(same(await exactSource(original.planSha256), original), 'exact original deploy source differs');
  const directorySnapshot = async (path: string, absentAllowed = false) => {
    try {
      const stat = await step(() => lstat(path));
      require(stat.isDirectory() &&
        !stat.isSymbolicLink() &&
        stat.uid === process.getuid?.() &&
        (stat.mode & 0o077) === 0 &&
        (await step(() => realpath(path))) === path, 'private directory ownership differs');
      return {
        identity: `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`,
        names: (await step(() => readdir(path))).sort(),
      };
    } catch (error) {
      if (absentAllowed && (error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  };
  const root = await directorySnapshot(directory),
    children = await directorySnapshot(join(directory, 'terraform-stages'), true);
  const configurations = new Set<string>();
  for (const row of inventory.requests) {
    const plan = await exactSource(row.planSha256);
    require(plan.planId === row.planId &&
      (plan.terraformNetworkProfile ?? plan.terraformNetworkReplacementProfile)?.retainedPlanSha256 ===
        row.retainedPlanSha256, 'public request differs from owning source');
    if (row.kind === 'node-replacement') {
      let outcome: unknown,
        absent = false;
      try {
        outcome = await step(() => loaders.loadOutcome(plan));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        absent = true;
      }
      require(absent ||
        (outcome &&
          typeof outcome === 'object' &&
          !Array.isArray(outcome)), 'complete replacement outcome object or explicit absence required');
      outcomes.set(plan.planSha256, { absent, outcome: structuredClone(outcome) });
      if (!absent && (outcome as { status?: unknown }).status === 'complete' && replacementVerifier) {
        const provenance = await step(() =>
          readAzureTerraformNetworkReplacementReceiptProvenance(
            plan,
            store,
            loaders,
            site,
            verifier,
            replacementVerifier,
            deadline,
          ),
        );
        require(provenance.originalPlanSha256 === original.planSha256 &&
          provenance.retainedPlanSha256 ===
            row.retainedPlanSha256, 'replacement public/source/original receipt provenance differs');
        replacements.set(plan.planSha256, structuredClone(provenance));
        for (const receipt of provenance.receipts) configurations.add(receipt.configurationSha256);
        rows.push({
          planSha256: row.planSha256,
          kind: row.kind,
          execution: 'completed-replacement',
          replacementProvenanceSha256: canonicalSha256(provenance),
        });
      } else {
        const hasPackets = root?.names.some((name) => name.startsWith(`${row.planId}-`)) ?? true,
          hasChildren = children?.names.some((name) => name.includes(row.planSha256.slice(0, 24)));
        rows.push({
          planSha256: row.planSha256,
          kind: row.kind,
          execution: absent && !hasPackets && !hasChildren ? 'unstaged-no-outcome' : 'unqualified-replacement',
        });
      }
      continue;
    }
    const prefix = `${row.planId}-terraform-network`,
      names = root?.names.filter((name) => name.startsWith(prefix)) ?? [];
    if (!names.includes(`${prefix}-source.json`)) {
      require(names.length === 0 &&
        !children?.names.some((name) =>
          name.startsWith(`network-${row.planSha256.slice(0, 24)}-`),
        ), 'unstaged request has execution packets or children');
      let outcome: unknown,
        absent = false;
      try {
        outcome = await step(() => loaders.loadOutcome(plan));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        absent = true;
      }
      require(absent ||
        (outcome &&
          typeof outcome === 'object' &&
          !Array.isArray(outcome)), 'complete outcome object or explicit absence required');
      outcomes.set(plan.planSha256, { absent, outcome: structuredClone(outcome) });
      rows.push({
        planSha256: row.planSha256,
        kind: row.kind,
        execution: absent ? 'unstaged-no-outcome' : 'unstaged-outcome-present',
      });
      continue;
    }
    const graph = await step(() =>
      readAzureTerraformNetworkRetirementGraph(plan, store, loaders, site, verifier, deadline, replacementVerifier),
    );
    graphs.set(plan.planSha256, graph);
    configurations.add(graph.original.binding.sourceConfigurationSha256);
    for (const node of graph.nodes)
      for (const history of [node.nic, node.routing])
        if (history)
          for (const receipt of Object.values(history.receipts))
            if (receipt) configurations.add(receipt.configurationSha256);
    for (const [name, digest] of Object.entries(graph.checkpoint.completionSha256ByName)) {
      const packet = await step(() => store.read(name));
      require(canonicalSha256(packet) === digest, 'terminal graph publication changed');
      const receipt = (packet as { receipt: { configurationSha256: string } }).receipt;
      configurations.add(receipt.configurationSha256);
    }
    rows.push({
      planSha256: row.planSha256,
      kind: row.kind,
      execution: 'staged-network',
      graphSha256: canonicalSha256(graph),
    });
  }
  // Executed network or replacement forks cannot authorize each other's installed main configuration.
  for (const a of inventory.requests.filter((row) => graphs.has(row.planSha256) || replacements.has(row.planSha256)))
    for (const b of inventory.requests.filter((row) => graphs.has(row.planSha256) || replacements.has(row.planSha256)))
      require(a.planSha256 === b.planSha256 ||
        a.ancestry.includes(b.planSha256) ||
        b.ancestry.includes(a.planSha256), 'staged public lineage forks');
  const result = {
    schemaVersion: 1 as const,
    scope: 'authenticated-network-shared-main-configuration-lineage' as const,
    originalPlanSha256: original.planSha256,
    owner,
    site,
    rows,
    publicPlanInventorySha256: inventory.publicPlanInventorySha256,
    requestInventorySha256: inventory.requestInventorySha256,
    configurationSha256s: [...configurations].sort(),
    allPublicExecutionGraphsQualified: rows.every(
      (row) => row.execution === 'staged-network' || row.execution === 'completed-replacement',
    ),
    unstagedMainJournalAbsenceQualified: false as const,
    mainJournalsQualified: false as const,
    childRetirementQualified: false as const,
    parentRetirementQualified: false as const,
    currentOperationalAcceptanceQualified: false as const,
  };
  const digest = canonicalSha256(result);
  const recheck = async (parentSignal?: AbortSignal): Promise<Lineage> => {
    seal();
    require(canonicalSha256(result) === digest, 'authenticated lineage changed');
    await step(() => store.verify(), parentSignal);
    await step(() => inventory.recheck(), parentSignal);
    for (const [sha256, source] of sources)
      require(same(
        await step(() => loaders.loadSource(sha256), parentSignal),
        source,
      ), 'source changed across lineage');
    for (const [sha256, graph] of graphs)
      await step(
        () =>
          recheckAzureTerraformNetworkRetirementGraph(
            graph,
            sources.get(sha256) as AzureCePlan,
            store,
            loaders,
            site,
            verifier,
            deadline,
            replacementVerifier,
          ),
        parentSignal,
      );
    for (const [sha256, expected] of replacements) {
      require(replacementVerifier, 'owning replacement historical verifier unavailable');
      const actual = await step(
        () =>
          readAzureTerraformNetworkReplacementReceiptProvenance(
            sources.get(sha256) as AzureCePlan,
            store,
            loaders,
            site,
            verifier,
            replacementVerifier,
            deadline,
          ),
        parentSignal,
      );
      require(same(actual, expected), 'replacement receipt provenance changed across lineage');
    }
    for (const [sha256, expected] of outcomes) {
      let actual: unknown,
        absent = false;
      try {
        actual = await step(() => loaders.loadOutcome(sources.get(sha256) as AzureCePlan), parentSignal);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        absent = true;
      }
      require(same({ absent, outcome: actual }, expected), 'unstaged outcome changed');
    }
    require(same(await directorySnapshot(directory), root) &&
      same(
        await directorySnapshot(join(directory, 'terraform-stages'), true),
        children,
      ), 'execution directory changed across lineage');
    await step(() => inventory.recheck(), parentSignal);
    seal();
    require(canonicalSha256(result) === digest, 'authenticated lineage changed');
    return result;
  };
  await recheck();
  witnesses.set(result, {
    store,
    loaders,
    verifier,
    replacementVerifier,
    siteSha256: canonicalSha256(site),
    staged: graphs,
    replacements,
    resultSha256: digest,
    assertContext() {
      seal();
      require(canonicalSha256(result) === digest, 'authenticated lineage changed');
    },
    recheck,
  });
  return result;
}

/** The collector owns each scoped witness. Nothing outside this function receives it.
 * Every selected graph still gets native authentication in the actual main reader; the complete
 * public/source/graph/namespace contract is authenticated before and after the bounded collection.
 * No operational observation is cached and no collection result authorizes parent retirement.
 */
export async function readAzureTerraformNetworkAllOriginalCustody(
  original: AzureCePlan,
  publicSession: SessionManagerLike,
  store: CeDeploymentStore,
  terraform: CeTerraformService,
  loaders: AzureTerraformNetworkHistoryLoaders,
  site: { siteUid: string; siteConfigurationSha256: string },
  verifier: AzureTerraformNetworkAcceptanceVerifier,
  signal?: AbortSignal,
  replacementVerifier?: AzureTerraformNetworkReplacementCompletedVerifier,
  emptyMainAdmission?: AzureTerraformNetworkEmptyMainAdmission,
) {
  const active = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const recheckEmpty = async () => {
    if (!emptyMainAdmission) return;
    require(emptyMainAdmission.context.terraform === terraform &&
      same(emptyMainAdmission.context.site, site), 'terminal collection owner context differs');
    await recheckAzureTerraformNetworkEmptyMainBinding(
      emptyMainAdmission.witness,
      original.planSha256,
      store,
      emptyMainAdmission.context,
      active,
    );
  };
  await recheckEmpty();
  const open = terraform.open;
  const root = await readAzureTerraformNetworkRetirementLineage(
    original,
    publicSession,
    store,
    loaders,
    site,
    verifier,
    active,
    replacementVerifier,
  );
  const context = witnesses.get(root);
  require(context, 'owning collection context missing');
  let live = true;
  const child = structuredClone(root),
    childSha256 = canonicalSha256(child);
  const boundary = () => {
    active.throwIfAborted();
    require(live, 'collection scope expired');
    require(terraform.open === open, 'collection owning runner dependency changed');
    context.assertContext();
    require(canonicalSha256(child) === childSha256, 'collection witness changed');
  };
  const step = async <T>(action: () => Promise<T>): Promise<T> => {
    boundary();
    const aborted = Promise.withResolvers<never>(),
      onAbort = () => aborted.reject(active.reason);
    active.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([action(), aborted.promise]);
      boundary();
      return result;
    } finally {
      active.removeEventListener('abort', onAbort);
    }
  };
  witnesses.set(child, {
    ...context,
    resultSha256: childSha256,
    assertContext: boundary,
    recheck: async () => {
      boundary();
      return structuredClone(root);
    },
  });
  try {
    // Native snapshots span every actual reader. They are private hashes of journal custody,
    // not cached operational evidence or caller-supplied configuration permissions.
    const files = new Map<string, string | null>(),
      directories = new Map<string, unknown>();
    const file = async (path: string) =>
      step(async () => {
        let digest: string | null = null;
        const handle = await openFile(path, constants.O_RDONLY | constants.O_NOFOLLOW).catch((error) => {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
          throw error;
        });
        if (!handle) {
          require(!files.has(path) || files.get(path) === null, 'native journal bytes changed across collection');
          files.set(path, null);
          return;
        }
        try {
          const before = await handle.stat();
          require(before.isFile() &&
            before.uid === process.getuid?.() &&
            before.nlink === 1 &&
            (before.mode & 0o077) === 0, 'native journal file ownership differs');
          const bytes = await handle.readFile(),
            after = await handle.stat(),
            named = await lstat(path);
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
            (named.mode & 0o077) === 0, 'native journal changed during read');
          digest = createHash('sha256').update(bytes).digest('hex');
        } finally {
          await handle.close();
        }
        require(!files.has(path) || files.get(path) === digest, 'native journal bytes changed across collection');
        files.set(path, digest);
      });
    const directory = async (path: string) =>
      step(async () => {
        let snapshot: { identity: string; names: string[] } | null = null;
        const stat = await lstat(path).catch((error) => {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
          throw error;
        });
        if (!stat) {
          require(!directories.has(path) ||
            directories.get(path) === null, 'native journal namespace changed across collection');
          directories.set(path, null);
          return [];
        }
        require(stat.isDirectory() &&
          !stat.isSymbolicLink() &&
          stat.uid === process.getuid?.() &&
          (stat.mode & 0o077) === 0 &&
          (await realpath(path)) === path, 'native journal directory ownership differs');
        snapshot = { identity: `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`, names: (await readdir(path)).sort() };
        require(!directories.has(path) ||
          same(directories.get(path), snapshot), 'native journal namespace changed across collection');
        directories.set(path, snapshot);
        return snapshot?.names ?? [];
      });
    const owningNames = await directory(store.directory);
    for (const name of owningNames.filter((name) => name.endsWith('.json'))) {
      require(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*\.json$/.test(name), 'owning packet filename differs');
      await file(join(store.directory, name));
    }
    const originalReceiptDirectory = join(store.directory, 'terraform-original-deployment-receipts');
    const originalReceiptNames = await directory(originalReceiptDirectory);
    for (const name of originalReceiptNames) {
      require(/^[a-f0-9]{64}\.json$/.test(name), 'original receipt publication is incomplete or malformed');
      await file(join(originalReceiptDirectory, name));
    }
    const originalFragmentDirectory = join(store.directory, 'terraform-original-deployment-publication-fragments');
    for (const name of await directory(originalFragmentDirectory)) {
      require(/^[a-f0-9]{64}-[a-f0-9-]{36}\.pending\.[a-f0-9]{64}\.fragment$/.test(
        name,
      ), 'original publication fragment namespace differs');
      await file(join(originalFragmentDirectory, name));
    }
    const originalMain = await step(() => azureTerraformCurrentDeployment(original));
    require(!originalMain.stage &&
      originalMain.deploymentId === store.owner.deploymentId &&
      originalMain.scope.account === store.owner.account &&
      originalMain.scope.region === store.owner.region &&
      originalMain.scope.cloud === store.owner.provider, 'shared main deployment ownership differs');
    const mainDirectory = join(store.directory, originalMain.deploymentId);
    const runnerDirectories = new Set<string>([mainDirectory]);
    for (const row of root.rows.filter((row) => row.execution === 'staged-network')) {
      const plan = structuredClone(await step(() => loaders.loadSource(row.planSha256)));
      verifyAzureCePlan(plan);
      require(plan.planSha256 === row.planSha256 &&
        same(azureUpgradeBinding(plan).owner, store.owner), 'native snapshot source identity differs');
      const main = await step(() => azureTerraformCurrentDeployment(plan));
      runnerDirectories.add(join(store.directory, main.deploymentId));
      const graph = context.staged.get(row.planSha256);
      require(graph, 'owning staged graph missing');
      for (const power of graph.powerDeployments) {
        require(power.stage, 'owning power stage missing');
        runnerDirectories.add(join(store.directory, 'terraform-stages', power.stage, power.deploymentId));
      }
    }
    for (const path of runnerDirectories) {
      const names = await directory(path);
      for (const name of [
        'deployment.json',
        'main.tf.json',
        '.terraform.lock.hcl',
        'deployment.tfrc',
        'saved.tfplan',
        'plan-receipt.json',
        'artifact-retirement.json',
        'configuration-transition.json',
      ])
        await file(join(path, name));
      for (const archive of ['revisions', 'plan-history']) {
        const root = join(path, archive);
        const entries = await directory(root);
        for (const name of entries) {
          require((archive === 'revisions' ? /^[a-f0-9-]{36}$/ : /^[a-f0-9]{64}$/).test(
            name,
          ), 'native journal archive identity differs');
          const child = join(root, name);
          for (const entry of await directory(child)) {
            require([
              'main.tf.json',
              'deployment.json',
              'saved.tfplan',
              'plan-receipt.json',
              '.terraform.lock.hcl',
              'deployment.tfrc',
              'inventory.json',
            ].includes(entry), 'native journal archive file differs');
            await file(join(child, entry));
          }
        }
      }
      require(same(names, await directory(path)), 'native journal namespace changed during snapshot');
    }
    if (emptyMainAdmission) {
      const cancellationName = `configuration-cancellation-${canonicalSha256({
        receipt: (emptyMainAdmission.context.terminalCleanup as { destroy: PlanReceipt }).destroy,
        expectedSha256: emptyMainAdmission.witness.retainedDestroyConfigurationSha256,
        nextSha256: emptyMainAdmission.witness.configurationSha256,
      })}.json`;
      require(createHash('sha256').update(cancellationName).digest('hex') ===
        emptyMainAdmission.witness.cancellationRecordNameSha256, 'native cancellation record name differs');
      await file(join(mainDirectory, cancellationName));
    }
    // The owner opens one exhaustive inventory. Requested-receipt history alone cannot
    // establish custody of every actual native receipt. No external allowlist is accepted.
    type NativeInventory = Awaited<ReturnType<NonNullable<TerraformSession['readPlanJournalInventory']>>>;
    let native: NativeInventory | undefined;
    let recheckNative: (() => Promise<void>) | undefined;
    const mainNames = await directory(mainDirectory);
    if (directories.get(mainDirectory) !== null && !mainNames.includes('artifact-retirement.json')) {
      require(!mainNames.includes(
        'configuration-transition.json',
      ), 'pending shared main revision requires owner recovery');
      const session = await step(() => open.call(terraform, store.owner, originalMain, 'current'));
      const read = session.readPlanJournalInventory,
        readConfiguration = session.readConfigurationSha256;
      require(read && readConfiguration, 'exhaustive authenticated shared main readers unavailable');
      const methods = () =>
        require(session.readPlanJournalInventory === read &&
          session.readConfigurationSha256 === readConfiguration, 'shared main inventory dependency changed');
      const configurationSha256 = await step(() => readConfiguration.call(session));
      const { configuration: _source, providerLock, ...identity } = originalMain;
      const manifestOf = (configurationSha256: string) =>
        canonicalSha256({
          ...identity,
          configurationSha256,
          providerLockSha256: createHash('sha256').update(providerLock).digest('hex'),
        });
      const validSha = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
      const exact = (value: unknown, fields: string[]) => {
        require(value &&
          typeof value === 'object' &&
          !Array.isArray(value) &&
          same(Object.keys(value).sort(), fields.toSorted()), 'shared main inventory schema differs');
      };
      const inspect = async () => {
        methods();
        const value = structuredClone(await step(() => read.call(session, active)));
        methods();
        exact(value, [
          'schemaVersion',
          'scope',
          'status',
          'manifestSha256',
          'entries',
          'entriesSha256',
          'namespaceSha256',
          'unrecognizedRootEntrySha256s',
          'incompleteArchives',
          'applicationOutcomeQualified',
          'retirementQualified',
        ]);
        require(validSha(configurationSha256) &&
          value.schemaVersion === 1 &&
          value.scope === 'all-native-saved-plan-journal-inventory' &&
          ['complete', 'partial'].includes(value.status) &&
          value.manifestSha256 === manifestOf(configurationSha256) &&
          Array.isArray(value.entries) &&
          value.entries.length > 0 &&
          value.entriesSha256 === canonicalSha256(value.entries) &&
          validSha(value.namespaceSha256) &&
          Array.isArray(value.unrecognizedRootEntrySha256s) &&
          value.unrecognizedRootEntrySha256s.every(validSha) &&
          new Set(value.unrecognizedRootEntrySha256s).size === value.unrecognizedRootEntrySha256s.length &&
          Number.isSafeInteger(value.incompleteArchives) &&
          value.incompleteArchives >= 0 &&
          value.applicationOutcomeQualified === false &&
          value.retirementQualified === false, 'shared main inventory identity differs');
        const seen = new Set<string>();
        let partial = 0,
          current = 0;
        for (const entry of value.entries) {
          exact(entry, [
            'location',
            'archiveRef',
            'archiveSha256',
            'state',
            'receiptSha256',
            'journalSha256',
            'savedPlanSha256',
            'configurationSha256',
            'manifestSha256',
            ...(entry.executionSha256 !== undefined ? ['executionSha256', 'ordinaryRefreshEnabled'] : []),
          ]);
          const key = `${entry.location}:${entry.archiveRef}`;
          require(['current', 'revision', 'plan-history'].includes(entry.location) &&
            !seen.has(key) &&
            validSha(entry.archiveSha256) &&
            validSha(entry.configurationSha256) &&
            entry.manifestSha256 === manifestOf(entry.configurationSha256) &&
            (entry.location === 'current'
              ? entry.archiveRef === null && entry.configurationSha256 === configurationSha256
              : typeof entry.archiveRef === 'string' &&
                (entry.location === 'revision' ? /^[a-f0-9-]{36}$/ : /^[a-f0-9]{64}$/).test(entry.archiveRef)) &&
            ['absent', 'unknown', 'planned', 'applying', 'applied'].includes(
              entry.state,
            ), 'shared main inventory occurrence differs or duplicates');
          seen.add(key);
          if (entry.location === 'current') current++;
          if (entry.state === 'absent' || entry.state === 'unknown') {
            require(entry.receiptSha256 === null &&
              entry.executionSha256 === undefined &&
              (entry.state === 'absent'
                ? entry.journalSha256 === null && entry.savedPlanSha256 === null
                : (entry.journalSha256 === null) !== (entry.savedPlanSha256 === null) &&
                  (entry.journalSha256 === null || validSha(entry.journalSha256)) &&
                  (entry.savedPlanSha256 === null ||
                    validSha(entry.savedPlanSha256))), 'shared main partial journal state differs');
            if (entry.state === 'unknown') partial++;
          } else
            require(validSha(entry.receiptSha256) &&
              validSha(entry.journalSha256) &&
              validSha(entry.savedPlanSha256) &&
              (entry.executionSha256 === undefined ||
                (validSha(entry.executionSha256) &&
                  typeof entry.ordinaryRefreshEnabled === 'boolean')), 'shared main saved receipt identity differs');
        }
        require(current === 1 &&
          value.incompleteArchives === partial &&
          value.status ===
            (partial || value.unrecognizedRootEntrySha256s.length
              ? 'partial'
              : 'complete'), 'shared main inventory completeness differs');
        methods();
        return value;
      };
      native = await inspect();
      const frozen = structuredClone(native);
      recheckNative = async () => {
        methods();
        require((await step(() => readConfiguration.call(session))) === configurationSha256 &&
          same(await inspect(), frozen), 'shared main inventory changed at final boundary');
        methods();
      };
    }
    const rows = [];
    for (const row of root.rows.filter((row) => row.execution === 'staged-network')) {
      const plan = structuredClone(await step(() => loaders.loadSource(row.planSha256)));
      verifyAzureCePlan(plan);
      require(plan.planSha256 === row.planSha256 &&
        same(azureUpgradeBinding(plan).owner, store.owner), 'collection source identity differs');
      const main = await step(() =>
        readAzureTerraformNetworkMainRunnerHistory(
          plan,
          store,
          terraform,
          loaders,
          site,
          verifier,
          active,
          replacementVerifier,
          child,
          emptyMainAdmission,
        ),
      );
      const power = await step(() =>
        readAzureTerraformNetworkPowerRunnerHistory(
          plan,
          store,
          terraform,
          loaders,
          site,
          verifier,
          active,
          replacementVerifier,
          context.staged.get(row.planSha256),
        ),
      );
      require(main.lineageSha256 === canonicalSha256(root) &&
        main.graphSha256 === power.graphSha256, 'collection journal/graph join differs');
      rows.push({ planSha256: row.planSha256, main: structuredClone(main), power: structuredClone(power) });
    }
    // Only authenticated graph/history occurrences mint provenance. Identical configuration
    // bytes or a public request cannot account for an unrelated saved receipt.
    const accepted = new Map<
      string,
      { configurationSha256: string; savedPlanSha256: string; manifestSha256: string; planSha256s: Set<string> }
    >();
    const configurations = new Set<string>();
    for (const graph of context.staged.values()) configurations.add(graph.original.binding.sourceConfigurationSha256);
    for (const row of rows)
      for (const receipt of [...row.main.rows, ...row.main.terminalRows]) {
        configurations.add(receipt.configurationSha256);
        for (const match of receipt.history?.matches ?? []) {
          const existing = accepted.get(receipt.receiptSha256);
          require(!existing ||
            (existing.configurationSha256 === match.configurationSha256 &&
              existing.savedPlanSha256 === match.savedPlanSha256 &&
              existing.manifestSha256 === match.manifestSha256), 'shared main receipt provenance conflicts');
          const binding = existing ?? {
            configurationSha256: match.configurationSha256,
            savedPlanSha256: match.savedPlanSha256,
            manifestSha256: match.manifestSha256,
            planSha256s: new Set<string>(),
          };
          binding.planSha256s.add(row.planSha256);
          accepted.set(receipt.receiptSha256, binding);
        }
      }
    // Preserve the exhaustive inventory's partial status. Only a native-authenticated token
    // can account for its one exact cancellation record when classifying retained receipts.
    const nativeReceiptInventoryComplete =
      native?.status === 'complete' ||
      (!!emptyMainAdmission &&
        native?.status === 'partial' &&
        native.incompleteArchives === 0 &&
        same(native.unrecognizedRootEntrySha256s, [emptyMainAdmission.witness.cancellationRecordNameSha256]));
    const { configuration: _originalSource, providerLock: originalLock, ...mainIdentity } = originalMain;
    const originalRows = [];
    const originalProof =
      directories.get(originalReceiptDirectory) !== null
        ? await step(() => readAzureTerraformOriginalReceiptProvenance(original, store, loaders, active))
        : undefined;
    if (originalProof) {
      require(originalProof.originalPlanSha256 === original.planSha256 &&
        originalProof.ownerSha256 ===
          canonicalSha256(store.owner), 'original receipt public/source/owner binding differs');
      for (const record of originalProof.receipts) {
        const receipt = record.record.receipt,
          receiptSha256 = canonicalSha256(receipt),
          manifestSha256 = canonicalSha256({
            ...mainIdentity,
            configurationSha256: receipt.configurationSha256,
            providerLockSha256: createHash('sha256').update(originalLock).digest('hex'),
          });
        const existing = accepted.get(receiptSha256);
        require(!existing ||
          (existing.configurationSha256 === receipt.configurationSha256 &&
            existing.savedPlanSha256 === receipt.planSha256 &&
            existing.manifestSha256 === manifestSha256), 'shared main original receipt provenance conflicts');
        const binding = existing ?? {
          configurationSha256: receipt.configurationSha256,
          savedPlanSha256: receipt.planSha256,
          manifestSha256,
          planSha256s: new Set<string>(),
        };
        binding.planSha256s.add(original.planSha256);
        accepted.set(receiptSha256, binding);
        configurations.add(receipt.configurationSha256);
        const matches = native?.entries.filter((entry) => entry.receiptSha256 === receiptSha256) ?? [],
          states = new Set(matches.map((entry) => entry.state));
        const submission = !nativeReceiptInventoryComplete
          ? ('partial' as const)
          : states.has('applying') && states.has('applied')
            ? ('ambiguous' as const)
            : states.has('applying')
              ? ('unresolved' as const)
              : states.has('applied')
                ? ('applied' as const)
                : states.has('planned')
                  ? receipt.noChanges
                    ? ('no-change' as const)
                    : ('unsubmitted' as const)
                  : ('missing' as const);
        originalRows.push({
          stage: record.record.stage,
          publicationName: record.name,
          publicationSha256: record.publicationSha256,
          receiptSha256,
          configurationSha256: receipt.configurationSha256,
          submission,
        });
      }
    }
    const replacementRows = [];
    for (const [planSha256, proof] of context.replacements) {
      const records = proof.receipts.map((record) => {
        const receipt = record.receipt,
          receiptSha256 = canonicalSha256(receipt);
        const manifestSha256 = canonicalSha256({
          ...mainIdentity,
          configurationSha256: receipt.configurationSha256,
          providerLockSha256: createHash('sha256').update(originalLock).digest('hex'),
        });
        const existing = accepted.get(receiptSha256);
        require(!existing ||
          (existing.configurationSha256 === receipt.configurationSha256 &&
            existing.savedPlanSha256 === receipt.planSha256 &&
            existing.manifestSha256 === manifestSha256), 'shared main replacement receipt provenance conflicts');
        const binding = existing ?? {
          configurationSha256: receipt.configurationSha256,
          savedPlanSha256: receipt.planSha256,
          manifestSha256,
          planSha256s: new Set<string>(),
        };
        binding.planSha256s.add(planSha256);
        accepted.set(receiptSha256, binding);
        configurations.add(receipt.configurationSha256);
        const matches = native?.entries.filter((entry) => entry.receiptSha256 === receiptSha256) ?? [];
        const states = new Set(matches.map((entry) => entry.state));
        const submission = !nativeReceiptInventoryComplete
          ? ('partial' as const)
          : states.has('applying') && states.has('applied')
            ? ('ambiguous' as const)
            : states.has('applying')
              ? ('unresolved' as const)
              : states.has('applied')
                ? ('applied' as const)
                : states.has('planned')
                  ? receipt.noChanges
                    ? ('no-change' as const)
                    : ('unsubmitted' as const)
                  : ('missing' as const);
        return {
          stage: record.stage,
          publicationName: record.publicationName,
          publicationSha256: record.publicationSha256,
          receiptSha256,
          configurationSha256: receipt.configurationSha256,
          submission,
        };
      });
      replacementRows.push({
        planSha256,
        provenanceSha256: canonicalSha256(proof),
        records,
        originalPublishedJournalsQualified: records.every(
          (row) => row.submission === 'applied' || row.submission === 'no-change',
        ),
      });
    }
    const nativeRows =
      native?.entries.map((entry) => {
        const binding = entry.receiptSha256 ? accepted.get(entry.receiptSha256) : undefined;
        if (binding)
          require(binding.configurationSha256 === entry.configurationSha256 &&
            binding.savedPlanSha256 === entry.savedPlanSha256 &&
            binding.manifestSha256 === entry.manifestSha256, 'shared main native receipt/provenance join differs');
        return {
          ...entry,
          provenance:
            entry.state === 'unknown'
              ? ('partial' as const)
              : entry.state === 'absent'
                ? configurations.has(entry.configurationSha256)
                  ? ('known-empty-configuration' as const)
                  : ('unaccounted-configuration' as const)
                : binding
                  ? ('authenticated-execution-receipt' as const)
                  : ('unaccounted-receipt' as const),
          planSha256s: binding ? [...binding.planSha256s].sort() : [],
        };
      }) ?? [];
    const allNativeReceiptsAccounted =
      native?.status === 'complete' &&
      nativeRows.every(
        (row) => row.provenance === 'authenticated-execution-receipt' || row.provenance === 'known-empty-configuration',
      );
    const originalDeploymentJournalsQualified =
      !!originalProof &&
      originalRows.length > 0 &&
      originalRows.every((row) => row.submission === 'applied' || row.submission === 'no-change');
    // Absence is backed by complete public namespace/outcome rechecks and exhaustive native
    // receipt custody. A residual shared-main receipt or unqualified outcome prevents success.
    const unstagedRequestAbsenceQualified =
      allNativeReceiptsAccounted &&
      originalDeploymentJournalsQualified &&
      native?.unrecognizedRootEntrySha256s.length === 0 &&
      rows.length === 0 &&
      root.rows.every((row) => row.execution === 'unstaged-no-outcome');
    // This proves public journal custody only. It grants neither current operations nor
    // parent retirement. Active/unresolved power runners retain their independent gates.
    const completedNetworkRows = [...rows],
      completedReplacementRows = [...replacementRows];
    const completedPublicRequestCustodyQualified =
      allNativeReceiptsAccounted &&
      originalDeploymentJournalsQualified &&
      native?.status === 'complete' &&
      native.unrecognizedRootEntrySha256s.length === 0 &&
      root.rows.some((row) => row.execution === 'staged-network' || row.execution === 'completed-replacement') &&
      completedNetworkRows.length === root.rows.filter((row) => row.execution === 'staged-network').length &&
      completedReplacementRows.length === root.rows.filter((row) => row.execution === 'completed-replacement').length &&
      root.rows.every((request) => {
        if (request.execution === 'unstaged-no-outcome') return true;
        if (request.execution === 'completed-replacement') {
          const matches = completedReplacementRows.filter((row) => row.planSha256 === request.planSha256);
          return matches.length === 1 && matches[0].records.length > 0 && matches[0].originalPublishedJournalsQualified;
        }
        if (request.execution !== 'staged-network') return false;
        const matches = completedNetworkRows.filter((row) => row.planSha256 === request.planSha256);
        return (
          matches.length === 1 &&
          matches[0].main.originalPublishedJournalsQualified &&
          matches[0].main.terminalPublishedJournalsQualified &&
          matches[0].power.rows.every(
            (power) => power.status === 'retired' && power.retirement?.runnerRetirementQualified === true,
          )
        );
      });
    const sharedMain = {
      schemaVersion: 1 as const,
      scope: 'exhaustive-shared-main-network-and-replacement-receipt-accounting' as const,
      status: native
        ? native.status
        : mainNames.includes('artifact-retirement.json')
          ? ('retired-unqualified' as const)
          : ('missing' as const),
      ...(native
        ? {
            inventorySha256: canonicalSha256(native),
            incompleteArchives: native.incompleteArchives,
            namespaceSha256: native.namespaceSha256,
            manifestSha256: native.manifestSha256,
            unrecognizedRootEntrySha256s: native.unrecognizedRootEntrySha256s,
          }
        : {}),
      rows: nativeRows,
      originalRows,
      ...(originalProof ? { originalReceiptProvenanceSha256: canonicalSha256(originalProof) } : {}),
      replacementRows,
      allNativeReceiptsAccounted,
      originalDeploymentJournalsQualified,
      replacementJournalsQualified:
        // A verified unstaged request has no execution journal to qualify.
        // Completed replacement journals still require exact native provenance below.
        root.rows.every(
          (row) =>
            row.kind !== 'node-replacement' ||
            row.execution === 'completed-replacement' ||
            row.execution === 'unstaged-no-outcome',
        ) &&
        replacementRows.length > 0 &&
        replacementRows.every((row) => row.originalPublishedJournalsQualified),
      unstagedRequestAbsenceQualified,
      parentRetirementQualified: false as const,
      currentOperationalAcceptanceQualified: false as const,
    };
    if (originalProof)
      require(same(
        await step(() => readAzureTerraformOriginalReceiptProvenance(original, store, loaders, active)),
        originalProof,
      ), 'original receipt provenance changed at final native boundary');
    if (recheckNative) await recheckNative();
    require(same(
      await step(() => context.recheck(active)),
      root,
    ), 'collection lineage changed at final native boundary');
    await recheckEmpty();
    for (const path of directories.keys()) await directory(path);
    for (const path of files.keys()) await file(path);
    boundary();
    return {
      schemaVersion: 1 as const,
      scope: 'all-staged-network-original-journal-custody' as const,
      lineage: structuredClone(root),
      lineageSha256: canonicalSha256(root),
      rows,
      sharedMain,
      allPublicRequestCustodyQualified: unstagedRequestAbsenceQualified || completedPublicRequestCustodyQualified,
      parentRetirementQualified: false as const,
      currentOperationalAcceptanceQualified: false as const,
    };
  } finally {
    live = false;
    witnesses.delete(child);
  }
}
