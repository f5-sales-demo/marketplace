import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { acquireProcessLock } from '../../../platform/src/ce/process-lock';
import { verifyAzureCePlan } from './artifacts';
import { canonicalEqual, canonicalSha256 } from './canonical';
import type { AzureTerraformNetworkAcceptanceVerifier } from './terraform-network-checkpoint';
import type {
  AzureTerraformNetworkCompletedGeneration,
  AzureTerraformNetworkHistoryLoaders,
} from './terraform-network-generation-history';
import { readAzureTerraformNetworkReplacementSourceBinding } from './terraform-network-replacement-binding-reader';
import type { AzureTerraformNetworkReplacementCompletedVerifier } from './terraform-network-replacement-completion';
import { verifyAzureTerraformNetworkReplacementProfile } from './terraform-network-replacement-plan';
import type { AzureTerraformNetworkReplacementSourceBinding } from './terraform-network-replacement-source-binding';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

type Site = AzureTerraformNetworkReplacementSourceBinding['site'];
export interface AzureTerraformNetworkReplacementExecutionJournal {
  schemaVersion: 1;
  kind: 'azure-terraform-network-replacement-execution-binding';
  engine: 'terraform';
  owner: CeDeploymentStore['owner'];
  planSha256: string;
  originalPlanSha256: string;
  retainedPlanSha256: string;
  node: number;
  sourceBindingSha256: string;
  sourceConfigurationSha256: string;
  providerLockSha256: string;
  site: Site;
}
const same = canonicalEqual;
const sha = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure Terraform network replacement execution journal: ${message}`);
}
const journalName = (plan: AzureCePlan) => `${plan.planId}-terraform-network-replacement-execution.json`;
function fromBinding(
  plan: AzureCePlan,
  binding: AzureTerraformNetworkReplacementSourceBinding,
): AzureTerraformNetworkReplacementExecutionJournal {
  const node = plan.intent.replacementNode;
  require(typeof node === 'number' &&
    Number.isSafeInteger(node) &&
    node >= 1 &&
    node <= plan.topology.nodeCount, 'exact selected node required');
  return {
    schemaVersion: 1,
    kind: 'azure-terraform-network-replacement-execution-binding',
    engine: 'terraform',
    owner: structuredClone(binding.owner),
    planSha256: plan.planSha256,
    originalPlanSha256: binding.originalPlanSha256,
    retainedPlanSha256: binding.retainedPlanSha256,
    node,
    sourceBindingSha256: canonicalSha256(binding),
    sourceConfigurationSha256: binding.sourceConfigurationSha256,
    providerLockSha256: binding.providerLockSha256,
    site: structuredClone(binding.site),
  };
}
function context(request: AzureCePlan, store: CeDeploymentStore, siteRequest: Site, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const plan = structuredClone(request),
    owner = structuredClone(store.owner),
    site = structuredClone(siteRequest);
  verifyAzureCePlan(plan);
  verifyAzureTerraformNetworkReplacementProfile(plan);
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const bounded = async <T>(task: () => Promise<T>): Promise<T> => {
    deadline.throwIfAborted();
    const abort = Promise.withResolvers<never>(),
      onAbort = () => abort.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const value = await Promise.race([task(), abort.promise]);
      deadline.throwIfAborted();
      return value;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  const verify = async () => {
    const identity = () =>
      require(same(plan, request) &&
        same(owner, store.owner) &&
        same(site, siteRequest) &&
        same(owner, azureUpgradeBinding(plan).owner), 'requested owning identity changed');
    identity();
    await bounded(() => store.verify());
    identity();
  };
  const optional = async (name: string) => {
    try {
      return await bounded(() => store.read(name));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  };
  return { plan, owner, site, deadline, bounded, verify, optional };
}
function validate(
  plan: AzureCePlan,
  owner: CeDeploymentStore['owner'],
  site: Site,
  input: unknown,
): AzureTerraformNetworkReplacementExecutionJournal {
  require(input && typeof input === 'object' && !Array.isArray(input), 'complete owning journal required');
  const row = input as AzureTerraformNetworkReplacementExecutionJournal,
    profile = verifyAzureTerraformNetworkReplacementProfile(plan);
  require(Object.keys(row).sort().join(',') ===
    'engine,kind,node,originalPlanSha256,owner,planSha256,providerLockSha256,retainedPlanSha256,schemaVersion,site,sourceBindingSha256,sourceConfigurationSha256' &&
    row.schemaVersion === 1 &&
    row.kind === 'azure-terraform-network-replacement-execution-binding' &&
    row.engine === 'terraform' &&
    same(row.owner, owner) &&
    same(row.site, site) &&
    row.planSha256 === plan.planSha256 &&
    row.originalPlanSha256 === profile.originalPlanSha256 &&
    row.retainedPlanSha256 === profile.retainedPlanSha256 &&
    row.node === plan.intent.replacementNode &&
    sha(row.sourceBindingSha256) &&
    sha(row.sourceConfigurationSha256) &&
    sha(row.providerLockSha256), 'journal schema or immutable identity differs');
  return row;
}
const result = (journal: AzureTerraformNetworkReplacementExecutionJournal) => ({
  schemaVersion: 1 as const,
  kind: 'azure-terraform-network-replacement-execution-journal-read' as const,
  journalSha256: canonicalSha256(journal),
  journal: structuredClone(journal),
  currentOperationalAcceptanceQualified: false as const,
});

/** Private historical read usable under the executor lock. The expected journal digest must be
 * bound by owning execution, never supplied by public acknowledgment. No cloud or mutation occurs.
 */
export async function readAzureTerraformNetworkReplacementExecutionBinding(
  request: AzureCePlan,
  store: CeDeploymentStore,
  loaders: AzureTerraformNetworkHistoryLoaders,
  siteRequest: Site,
  expectedJournalSha256: string,
  verifier: AzureTerraformNetworkAcceptanceVerifier,
  signal?: AbortSignal,
  qualifiedPrevious?: AzureTerraformNetworkCompletedGeneration,
  replacementVerifier?: AzureTerraformNetworkReplacementCompletedVerifier,
): Promise<{
  execution: ReturnType<typeof result>;
  source: Awaited<ReturnType<typeof readAzureTerraformNetworkReplacementSourceBinding>>;
}> {
  require(sha(expectedJournalSha256), 'resolved owning journal digest required');
  const c = context(request, store, siteRequest, signal);
  await c.verify();
  const raw = await c.bounded(() => store.read(journalName(c.plan)));
  require(canonicalSha256(raw) === expectedJournalSha256, 'journal differs from owning expected digest');
  const row = validate(c.plan, c.owner, c.site, raw);
  const source = await readAzureTerraformNetworkReplacementSourceBinding(
    c.plan,
    store,
    loaders,
    c.site,
    row.sourceBindingSha256,
    verifier,
    c.deadline,
    qualifiedPrevious,
    replacementVerifier,
    async (binding, readonlyStore) => {
      require(same(row, fromBinding(c.plan, binding)), 'journal differs from authenticated source binding');
      await c.verify();
      require(canonicalSha256(await c.bounded(() => readonlyStore.read(journalName(c.plan)))) ===
        expectedJournalSha256, 'journal changed at final historical read boundary');
    },
  );
  // No external callback follows the binding reader's full final seals. Returning
  // both results avoids a second complete ancestry walk solely to seal journal reads.
  return { execution: result(row), source };
}

/** Existing journal-only consumers retain their exact result schema. */
export async function readAzureTerraformNetworkReplacementExecutionJournal(
  request: AzureCePlan,
  store: CeDeploymentStore,
  loaders: AzureTerraformNetworkHistoryLoaders,
  siteRequest: Site,
  expectedJournalSha256: string,
  verifier: AzureTerraformNetworkAcceptanceVerifier,
  signal?: AbortSignal,
  qualifiedPrevious?: AzureTerraformNetworkCompletedGeneration,
  replacementVerifier?: AzureTerraformNetworkReplacementCompletedVerifier,
): Promise<ReturnType<typeof result>> {
  return (
    await readAzureTerraformNetworkReplacementExecutionBinding(
      request,
      store,
      loaders,
      siteRequest,
      expectedJournalSha256,
      verifier,
      signal,
      qualifiedPrevious,
      replacementVerifier,
    )
  ).execution;
}

/** Freeze a distinct source-binding digest journal under owning exclusion before enrollment.
 * This historical record does not authorize bootstrap, selected-VM mutation or operational
 * completion. Actual execution must enforce its digest and full current phase evidence.
 */
export async function bindAzureTerraformNetworkReplacementExecutionJournal(
  request: AzureCePlan,
  store: CeDeploymentStore,
  loaders: AzureTerraformNetworkHistoryLoaders,
  siteRequest: Site,
  expectedSourceBindingSha256: string,
  verifier: AzureTerraformNetworkAcceptanceVerifier,
  signal?: AbortSignal,
  replacementVerifier?: AzureTerraformNetworkReplacementCompletedVerifier,
) {
  require(sha(expectedSourceBindingSha256), 'resolved owning source-binding digest required');
  const c = context(request, store, siteRequest, signal);
  await c.verify();
  const release = await acquireProcessLock(`${store.directory}/.terraform-replacement-lock`);
  try {
    c.deadline.throwIfAborted();
    await c.verify();
    const name = journalName(c.plan),
      saved = await c.optional(name);
    if (saved !== undefined) {
      const row = validate(c.plan, c.owner, c.site, saved);
      require(row.sourceBindingSha256 === expectedSourceBindingSha256, 'saved journal source-binding digest differs');
      const read = await readAzureTerraformNetworkReplacementExecutionJournal(
        c.plan,
        store,
        loaders,
        c.site,
        canonicalSha256(saved),
        verifier,
        c.deadline,
        undefined,
        replacementVerifier,
      );
      await c.verify();
      require(canonicalSha256(await c.bounded(() => store.read(name))) ===
        read.journalSha256, 'saved journal changed at final replay boundary');
      return read;
    }
    const p = c.plan,
      token = `${p.deploymentName.slice(0, 40)}-${p.intent.replacementNode}-${p.planSha256.slice(0, 12)}`;
    const later = [
      'replacement',
      'replacement-source',
      'quiesce-plan',
      'launch-plan',
      'quiesce-recovery',
      'launch-recovery',
      'replacement-registration',
      'replacement-final-plan',
      'network-replacement-complete',
    ].map((s) => `${p.planId}-terraform-${s}.json`);
    later.push(`${token}.json`);
    const noLater = async () => {
      for (const name of later)
        require((await c.optional(name)) ===
          undefined, 'original journal missing after enrollment or stage publication');
    };
    await noLater();
    const source = await readAzureTerraformNetworkReplacementSourceBinding(
      c.plan,
      store,
      loaders,
      c.site,
      expectedSourceBindingSha256,
      verifier,
      c.deadline,
      undefined,
      replacementVerifier,
    );
    const journal = fromBinding(c.plan, source.binding);
    validate(c.plan, c.owner, c.site, journal);
    await c.verify();
    await noLater();
    require((await c.optional(name)) === undefined, 'original journal appeared during preparation');
    await c.bounded(() => store.write(name, journal));
    const read = await readAzureTerraformNetworkReplacementExecutionJournal(
      c.plan,
      store,
      loaders,
      c.site,
      canonicalSha256(journal),
      verifier,
      c.deadline,
      undefined,
      replacementVerifier,
    );
    await c.verify();
    require(canonicalSha256(await c.bounded(() => store.read(name))) ===
      read.journalSha256, 'journal changed at final preparation boundary');
    return read;
  } finally {
    await release();
  }
}
