import { lstat, readdir, realpath } from 'node:fs/promises';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { CeTerraformService } from '../../../terraform/src/service';
import { type SessionManagerLike, verifyAzureCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import type { AzureTerraformNetworkAcceptanceVerifier } from './terraform-network-checkpoint';
import type { AzureTerraformNetworkHistoryLoaders } from './terraform-network-generation-history';
import { readAzureTerraformNetworkMainRunnerHistory } from './terraform-network-main-runner-history';
import { verifyAzureTerraformNetworkProfile } from './terraform-network-plan';
import type { AzureTerraformNetworkReplacementCompletedVerifier } from './terraform-network-replacement-completion';
import {
  readAzureTerraformNetworkRetirementLineage,
  recheckAzureTerraformNetworkRetirementLineage,
} from './terraform-network-retirement-lineage';
import { readAzureTerraformNetworkRetirementRequests } from './terraform-network-retirement-requests';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

const same = (a: unknown, b: unknown) => canonicalSha256({ value: a }) === canonicalSha256({ value: b });
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure Terraform network main retirement preparation: ${message}`);
}

/** Caller holds the owning lifecycle lock. Persist only authenticated, sanitized completed main
 * journal custody before destructive cleanup. This record neither authorizes parent destruction
 * nor establishes empty state, independent cleanup, child retirement or operational health.
 * The authoritative public inventory retains every request with execution unclassified; this
 * selected completed-main proof cannot admit other interrupted or unsubmitted histories.
 */
export async function prepareAzureTerraformNetworkMainRetirementHistory(
  originalRequest: AzureCePlan,
  request: AzureCePlan,
  publicSession: SessionManagerLike,
  store: CeDeploymentStore,
  terraform: CeTerraformService,
  loaders: AzureTerraformNetworkHistoryLoaders,
  siteRequest: { siteUid: string; siteConfigurationSha256: string },
  verifier: AzureTerraformNetworkAcceptanceVerifier,
  signal?: AbortSignal,
  replacementVerifier?: AzureTerraformNetworkReplacementCompletedVerifier,
  lineageWitness?: unknown,
) {
  const original = structuredClone(originalRequest),
    plan = structuredClone(request),
    site = structuredClone(siteRequest),
    owner = structuredClone(store.owner),
    directory = store.directory;
  const lineageSha256 = lineageWitness === undefined ? undefined : canonicalSha256(lineageWitness);
  let activeLineageWitness = lineageWitness;
  const bindings = [
    { target: publicSession, key: 'getSessionId', value: publicSession.getSessionId },
    { target: publicSession, key: 'getArtifactsDir', value: publicSession.getArtifactsDir },
    { target: publicSession, key: 'getArtifactPath', value: publicSession.getArtifactPath },
    { target: publicSession, key: 'saveArtifact', value: publicSession.saveArtifact },
    { target: store, key: 'read', value: store.read },
    { target: store, key: 'write', value: store.write },
    { target: store, key: 'verify', value: store.verify },
    { target: terraform, key: 'open', value: terraform.open },
    { target: loaders, key: 'loadSource', value: loaders.loadSource },
    { target: loaders, key: 'loadOutcome', value: loaders.loadOutcome },
  ];
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const seal = () => {
    deadline.throwIfAborted();
    require(same(originalRequest, original) &&
      same(request, plan) &&
      same(siteRequest, site) &&
      (lineageWitness === undefined || canonicalSha256(lineageWitness) === lineageSha256) &&
      same(store.owner, owner) &&
      store.directory === directory &&
      bindings.every(
        ({ target, key, value }) => Reflect.get(target, key) === value,
      ), 'request or owning dependency changed');
  };
  const step = async <T>(action: () => Promise<T>) => {
    seal();
    const aborted = Promise.withResolvers<never>(),
      onAbort = () => aborted.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const value = await Promise.race([action(), aborted.promise]);
      seal();
      return value;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  seal();
  verifyAzureCePlan(original);
  verifyAzureCePlan(plan);
  const profile = verifyAzureTerraformNetworkProfile(plan);
  require(original.engine === 'terraform' &&
    original.intent.operation === 'deploy' &&
    profile.originalPlanSha256 === original.planSha256 &&
    same(azureUpgradeBinding(original).owner, owner) &&
    same(azureUpgradeBinding(plan).owner, owner), 'original deploy owner or network lineage differs');
  const publicRequests = await step(() =>
    readAzureTerraformNetworkRetirementRequests(original, publicSession, deadline),
  );
  require(publicRequests.requests.some(
    (row) => row.planSha256 === plan.planSha256,
  ), 'selected network request missing from authoritative public inventory');
  const publicRequestInventory = {
    schemaVersion: publicRequests.schemaVersion,
    originalPlanSha256: publicRequests.originalPlanSha256,
    owner: publicRequests.owner,
    requests: publicRequests.requests,
    publicPlanInventorySha256: publicRequests.publicPlanInventorySha256,
    requestInventorySha256: publicRequests.requestInventorySha256,
    executionHistoryQualified: false as const,
    parentRetirementQualified: false as const,
  };
  const info = await step(() => lstat(directory));
  require(info.isDirectory() &&
    !info.isSymbolicLink() &&
    info.uid === process.getuid?.() &&
    (info.mode & 0o077) === 0 &&
    (await step(() => realpath(directory))) === directory, 'private deployment directory ownership differs');
  const directoryIdentity = `${info.dev}:${info.ino}:${info.birthtimeMs}`;
  const parent = await step(() => loaders.loadSource(original.planSha256));
  require(same(parent, original), 'exact original deploy source differs');
  const name = `azure-network-main-retirement-${plan.planSha256.slice(0, 24)}.json`;
  const optional = async () => {
    try {
      return await step(() => store.read(name));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  };
  await step(() => store.verify());
  const previous = await optional();
  if (activeLineageWitness !== undefined)
    await step(() =>
      recheckAzureTerraformNetworkRetirementLineage(
        activeLineageWitness,
        plan,
        store,
        loaders,
        site,
        verifier,
        deadline,
        replacementVerifier,
      ),
    );
  const publicationNames =
    activeLineageWitness === undefined ? undefined : (await step(() => readdir(directory))).sort();
  if (publicationNames)
    require(publicationNames.includes(name) ===
      (previous !== undefined), 'custody presence differs from native namespace');
  const inspect = () =>
    step(() =>
      readAzureTerraformNetworkMainRunnerHistory(
        plan,
        store,
        terraform,
        loaders,
        site,
        verifier,
        deadline,
        replacementVerifier,
        activeLineageWitness,
      ),
    );
  await step(() => publicRequests.recheck());
  const history = await inspect();
  await step(() => publicRequests.recheck());
  require(history.status === 'inspected' &&
    history.originalPublishedJournalsQualified === true &&
    history.terminalPublishedJournalsQualified === true &&
    history.current?.ordinaryRefreshEnabled === true, 'complete original and terminal main journal custody required');
  const preparation = {
    schemaVersion: 1 as const,
    scope: 'completed-network-main-original-journal-preparation' as const,
    owner,
    originalPlanSha256: original.planSha256,
    networkPlanSha256: plan.planSha256,
    site,
    graphSha256: history.graphSha256,
    publicRequestInventory,
    history,
    historySha256: canonicalSha256(history),
  };
  if (lineageSha256 !== undefined)
    require(history.lineageSha256 === lineageSha256, 'selected journal did not authenticate exact lineage');
  require(previous === undefined || same(previous, preparation), 'immutable preparation differs');
  require(same(await inspect(), history) &&
    same(
      await step(() => loaders.loadSource(original.planSha256)),
      original,
    ), 'original source or journal custody changed before publication');
  const finalDirectory = await step(() => lstat(directory));
  require(finalDirectory.isDirectory() &&
    !finalDirectory.isSymbolicLink() &&
    finalDirectory.uid === process.getuid?.() &&
    (finalDirectory.mode & 0o077) === 0 &&
    `${finalDirectory.dev}:${finalDirectory.ino}:${finalDirectory.birthtimeMs}` === directoryIdentity &&
    (await step(() => realpath(directory))) === directory, 'private deployment directory changed');
  require(same(await optional(), previous), 'preparation appeared or changed before publication');
  await step(() => publicRequests.recheck());
  if (publicationNames)
    require(same(
      (await step(() => readdir(directory))).sort(),
      publicationNames,
    ), 'execution namespace changed before owning custody publication');
  if (previous === undefined) await step(() => store.write(name, preparation));
  require(same(await optional(), preparation), 'preparation acknowledgement lacks exact persisted bytes');
  if (publicationNames) {
    // The only admitted namespace transition is this writer's exact immutable custody record.
    const expectedNames = [...new Set([...publicationNames, name])].sort();
    require(same(
      (await step(() => readdir(directory))).sort(),
      expectedNames,
    ), 'foreign publication changed execution namespace');
    const refreshed = await step(() =>
      readAzureTerraformNetworkRetirementLineage(
        original,
        publicSession,
        store,
        loaders,
        site,
        verifier,
        deadline,
        replacementVerifier,
      ),
    );
    require(canonicalSha256(refreshed) === lineageSha256, 'execution lineage changed across custody publication');
    activeLineageWitness = refreshed;
    require(same(await inspect(), history), 'original journal custody changed across publication');
    require(same((await step(() => readdir(directory))).sort(), expectedNames) &&
      same(await optional(), preparation), 'owning custody publication changed at final boundary');
    const publishedDirectory = await step(() => lstat(directory));
    require(publishedDirectory.isDirectory() &&
      !publishedDirectory.isSymbolicLink() &&
      publishedDirectory.uid === process.getuid?.() &&
      (publishedDirectory.mode & 0o077) === 0 &&
      `${publishedDirectory.dev}:${publishedDirectory.ino}:${publishedDirectory.birthtimeMs}` === directoryIdentity &&
      (await step(() => realpath(directory))) === directory, 'private directory changed across custody publication');
    await step(() => store.verify());
  }

  await step(() => publicRequests.recheck());
  seal();
  return {
    schemaVersion: 1 as const,
    scope: 'completed-network-main-original-journal-preparation' as const,
    status: 'prepared' as const,
    name,
    originalPlanSha256: original.planSha256,
    networkPlanSha256: plan.planSha256,
    graphSha256: history.graphSha256,
    preparationSha256: canonicalSha256(preparation),
    publicPlanInventorySha256: publicRequests.publicPlanInventorySha256,
    requestInventorySha256: publicRequests.requestInventorySha256,
    otherRequestExecutionHistoriesQualified: false as const,
    originalJournalCustodyQualified: true as const,
    childRetirementQualified: false as const,
    runnerRetirementQualified: false as const,
    parentRetirementQualified: false as const,
    currentOperationalAcceptanceQualified: false as const,
  };
}
