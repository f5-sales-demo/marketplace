import { createHash } from 'node:crypto';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { verifyAzureCePlan } from './artifacts';
import { canonicalEqual, canonicalSha256 } from './canonical';
import {
  type AzureNetworkUpdateInventory,
  usableAzureNetworkAddress,
  validateAzureNetworkUpdateInventory,
} from './network-update';
import type { AzureTerraformNetworkAcceptanceVerifier } from './terraform-network-checkpoint';
import { AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256 } from './terraform-network-nic-projection';
import { azureTerraformNetworkScope, verifyAzureTerraformNetworkProfile } from './terraform-network-plan';
import type { AzureTerraformNetworkReplacementCompletedVerifier } from './terraform-network-replacement-completion';
import { readAzureTerraformNetworkReplacementCompletionHistory } from './terraform-network-replacement-completion-history';
import { verifyAzureTerraformNetworkReplacementProfile } from './terraform-network-replacement-plan';
import { qualifyAzureTerraformNetworkUpdateSource } from './terraform-network-update-source';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

export type AzureTerraformNetworkGenerationLink = {
  planSha256: string;
  sourceBindingSha256: string;
  checkpointSha256: string;
  completionSha256: string;
  finalConfigurationSha256: string;
} & ({ kind: 'network-update' } | { kind: 'node-replacement'; journalSha256: string });
export type AzureTerraformNetworkGenerationQualification = Awaited<
  ReturnType<typeof qualifyAzureTerraformNetworkUpdateSource>
> & {
  networkHistory?: AzureTerraformNetworkGenerationLink[];
};
export interface AzureTerraformNetworkCompletedHistory {
  schemaVersion: 1;
  kind: 'azure-terraform-network-completion-history';
  engine: 'terraform';
  sourcePlanSha256: string;
  originalPlanSha256: string;
  sourceBindingSha256: string;
  checkpointSha256: string;
  completionSha256: string;
  finalConfigurationSha256: string;
  finalSource: string;
  before: AzureNetworkUpdateInventory;
  inventory: AzureNetworkUpdateInventory;
  outputs: Record<string, unknown>;
  siteUid: string;
  siteConfigurationSha256: string;
  sourceQualification: AzureTerraformNetworkGenerationQualification;
  currentOperationalAcceptanceQualified: false;
}
export type AzureTerraformNetworkCompletedReplacementHistory = Awaited<
  ReturnType<typeof readAzureTerraformNetworkReplacementCompletionHistory>
> & { sourceQualification: AzureTerraformNetworkGenerationQualification };
export type AzureTerraformNetworkCompletedGeneration =
  | AzureTerraformNetworkCompletedHistory
  | AzureTerraformNetworkCompletedReplacementHistory;

/** Compare physical identity without manufacturing a collection or heartbeat timestamp. */
export function azureTerraformCompletedGenerationNodes(history: AzureTerraformNetworkCompletedGeneration) {
  if (history.kind === 'azure-terraform-network-completion-history') return history.inventory.nodes;
  return Object.fromEntries(
    Object.entries(history.nodes).map(([key, vm]) => {
      require(vm.vmState === 'present' &&
        vm.vmId &&
        vm.ownerPlanSha256, 'completed replacement physical identity missing');
      const { vmState: _state, nics, ...identity } = vm;
      return [
        key,
        {
          ...identity,
          nics: Object.fromEntries(
            Object.entries(nics).map(([index, nic]) => {
              const { attachment: _attachment, ...physical } = nic;
              return [index, physical];
            }),
          ),
        },
      ];
    }),
  );
}
/** Replacement inventory is checked against its owning immutable physical vector. The
 * network-only action validator and collector keep their original operation guards. */
export function validateAzureTerraformReplacementPredecessorInventory(
  plan: AzureCePlan,
  value: AzureNetworkUpdateInventory,
  history: AzureTerraformNetworkCompletedGeneration,
): AzureNetworkUpdateInventory {
  verifyAzureCePlan(plan);
  verifyAzureTerraformNetworkReplacementProfile(plan);
  require(history.kind === 'azure-terraform-network-replacement-completion-history' &&
    history.sourcePlanSha256 === plan.planSha256 &&
    value &&
    same(Object.keys(value).sort(), ['collectedAt', 'engine', 'nodes', 'planSha256', 'schemaVersion']) &&
    value.schemaVersion === 1 &&
    value.engine === 'terraform' &&
    value.planSha256 === plan.planSha256 &&
    typeof value.collectedAt === 'string' &&
    Number.isFinite(Date.parse(value.collectedAt)) &&
    Date.parse(value.collectedAt) <=
      Date.now() + 60000, 'exact replacement inventory schema, generation and collection time required');
  const expected = azureTerraformCompletedGenerationNodes(history);
  const normalize = (nodes: AzureNetworkUpdateInventory['nodes'] | typeof expected) =>
    Object.fromEntries(
      Object.entries(nodes).map(([node, vm]) => [
        node,
        {
          ...vm,
          nics: Object.fromEntries(
            Object.entries(vm.nics).map(([index, nic]) => [
              index,
              nic.allocation === 'Dynamic' ? { ...nic, privateIp: null } : nic,
            ]),
          ),
        },
      ]),
    );
  require(same(
    normalize(value.nodes),
    normalize(expected),
  ), 'replacement predecessor full VM/NIC physical identity differs');
  const addresses = new Set<string>();
  for (const vm of Object.values(value.nodes))
    for (const nic of Object.values(vm.nics)) {
      const address = `${nic.subnetId.toLowerCase()}:${nic.privateIp}`;
      require(usableAzureNetworkAddress(nic.privateIp, nic.subnetCidr) &&
        !addresses.has(address), 'replacement predecessor address malformed or duplicate');
      addresses.add(address);
    }
  return value;
}
export function azureTerraformCompletedGenerationLink(
  history: AzureTerraformNetworkCompletedGeneration,
): AzureTerraformNetworkGenerationLink {
  const common = {
    planSha256: history.sourcePlanSha256,
    sourceBindingSha256: history.sourceBindingSha256,
    checkpointSha256: history.checkpointSha256,
    completionSha256: history.completionSha256,
    finalConfigurationSha256: history.finalConfigurationSha256,
  };
  return history.kind === 'azure-terraform-network-replacement-completion-history'
    ? { kind: 'node-replacement', journalSha256: history.journalSha256, ...common }
    : { kind: 'network-update', ...common };
}
export function azureTerraformCompletedGenerationSite(history: AzureTerraformNetworkCompletedGeneration) {
  return history.kind === 'azure-terraform-network-completion-history'
    ? { siteUid: history.siteUid, siteConfigurationSha256: history.siteConfigurationSha256 }
    : history.site;
}
export type AzureTerraformNetworkHistoryLoaders = {
  loadSource(digest: string): Promise<AzureCePlan>;
  loadOutcome(plan: AzureCePlan): Promise<Record<string, unknown>>;
};
type Site = { siteUid: string; siteConfigurationSha256: string };
export type AzureTerraformNetworkGenerationSource = {
  source: string;
  inventory: AzureNetworkUpdateInventory;
  providerLockSha256: string;
  site: Site;
};
type Reader = (
  plan: AzureCePlan,
  store: CeDeploymentStore,
  loaders: AzureTerraformNetworkHistoryLoaders,
  verifier: AzureTerraformNetworkAcceptanceVerifier,
  signal?: AbortSignal,
  previous?: AzureTerraformNetworkCompletedGeneration,
) => Promise<AzureTerraformNetworkCompletedHistory>;
const same = (a: unknown, b: unknown) => (a === undefined || b === undefined ? a === b : canonicalEqual(a, b));
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure Terraform network generations: ${message}`);
}

/** Internal adjacent-source join. Previous is produced only by the owning immutable history reader. */
export function qualifyAzureTerraformAdjacentNetworkSource(
  plan: AzureCePlan,
  input: AzureTerraformNetworkGenerationSource,
  previous: AzureTerraformNetworkCompletedGeneration,
): AzureTerraformNetworkGenerationQualification {
  verifyAzureCePlan(plan);
  validateAzureNetworkUpdateInventory(plan, input.inventory);
  const profile = verifyAzureTerraformNetworkProfile(plan);
  require(profile.retainedPlanSha256 === previous.sourcePlanSha256 &&
    profile.originalPlanSha256 === previous.originalPlanSha256 &&
    input.source === previous.finalSource &&
    hash(input.source) === previous.finalConfigurationSha256 &&
    input.providerLockSha256 === AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256 &&
    input.providerLockSha256 === previous.sourceQualification.providerLockSha256 &&
    same(
      input.site,
      azureTerraformCompletedGenerationSite(previous),
    ), 'exact predecessor configuration, provider and owned site required');
  const identities = (
    nodes: AzureNetworkUpdateInventory['nodes'] | ReturnType<typeof azureTerraformCompletedGenerationNodes>,
  ) =>
    Object.fromEntries(
      Object.entries(nodes).map(([node, vm]) => [
        node,
        {
          ...vm,
          nics: Object.fromEntries(
            Object.entries(vm.nics).map(([index, nic]) => {
              const { targetSubnetId: _target, targetSubnetCidr: _cidr, ...identity } = nic;
              return [index, nic.allocation === 'Dynamic' ? { ...identity, privateIp: null } : identity];
            }),
          ),
        },
      ]),
    );
  require(same(
    identities(input.inventory.nodes),
    identities(azureTerraformCompletedGenerationNodes(previous)),
  ), 'adjacent VM UUID/owner or NIC/MAC/subnet/IP-configuration identity differs');
  return {
    ...structuredClone(previous.sourceQualification),
    sourceConfigurationSha256: hash(input.source),
    generationPlanSha256s: [
      ...new Set([...previous.sourceQualification.generationPlanSha256s, previous.sourcePlanSha256]),
    ].sort(),
    networkHistory: [
      ...(previous.sourceQualification.networkHistory ?? []),
      azureTerraformCompletedGenerationLink(previous),
    ],
  };
}

/** Private ordered coordinator. The supplied reader is the owning production validator, never a
 * public caller-selected acknowledgment. Every packet/source/outcome is rechecked across the full
 * chain. No Terraform/cloud mutation or observation and no source reconstruction is performed.
 */
export async function runAzureTerraformNetworkGenerationHistory(
  sourcePlan: AzureCePlan,
  store: CeDeploymentStore,
  loaders: AzureTerraformNetworkHistoryLoaders,
  verifier: AzureTerraformNetworkAcceptanceVerifier | undefined,
  reader: Reader,
  input?: AzureTerraformNetworkGenerationSource,
  signal?: AbortSignal,
  replacementVerifier?: AzureTerraformNetworkReplacementCompletedVerifier,
): Promise<{
  qualification: AzureTerraformNetworkGenerationQualification;
  completion?: AzureTerraformNetworkCompletedGeneration;
}> {
  signal?.throwIfAborted();
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const plan = structuredClone(sourcePlan),
    selected = input ? structuredClone(input) : undefined;
  verifyAzureCePlan(plan);
  const owner = structuredClone(azureUpgradeBinding(plan).owner);
  const loadSource = loaders.loadSource,
    loadOutcome = loaders.loadOutcome;
  const planDigest = canonicalSha256(plan),
    selectedDigest = selected ? canonicalSha256(selected) : undefined,
    ownerDigest = canonicalSha256(owner);
  // All work in this coordinator is read-only and uses inaccessible private clones. Seal
  // live requests at the outer boundaries, rather than rehashing each entire plan/private
  // configuration for every nested packet read. Loader identities and owner stay sealed
  // around every awaited callback; all retained bytes are still rechecked across the chain.
  const unchanged = () =>
    require(canonicalSha256(store.owner) === ownerDigest &&
      loaders.loadSource === loadSource &&
      loaders.loadOutcome === loadOutcome, 'generation dependency context changed during qualification');
  const requestUnchanged = () =>
    require(canonicalSha256(plan) === planDigest &&
      canonicalSha256(sourcePlan) === planDigest &&
      (selected ? canonicalSha256(selected) : undefined) === selectedDigest &&
      (input ? canonicalSha256(input) : undefined) ===
        selectedDigest, 'generation request changed during qualification');
  requestUnchanged();
  require(plan.engine === 'terraform' &&
    (plan.intent.operation === 'update-network' || plan.terraformNetworkReplacementProfile) &&
    same(store.owner, owner), selected
    ? 'exact owning Terraform generation required'
    : 'exact owning completed Terraform generation required');
  const bounded = async <T>(task: () => Promise<T>): Promise<T> => {
    deadline.throwIfAborted();
    unchanged();
    const abort = Promise.withResolvers<never>();
    const listener = () => abort.reject(deadline.reason);
    deadline.addEventListener('abort', listener, { once: true });
    try {
      const value = await Promise.race([task(), abort.promise]);
      deadline.throwIfAborted();
      unchanged();
      return value;
    } finally {
      deadline.removeEventListener('abort', listener);
    }
  };
  await bounded(() => store.verify());
  const records = new Map<string, string>(),
    sources = new Map<string, string>(),
    outcomes = new Map<string, { plan: AzureCePlan; digest: string }>();
  const read = async (name: string) => {
    const value = await bounded(() => store.read(name)),
      digest = canonicalSha256(value);
    require(!records.has(name) || records.get(name) === digest, 'historical packet changed during qualification');
    records.set(name, digest);
    return structuredClone(value);
  };
  const readonlyStore = new Proxy(store, {
    get(target, key) {
      if (key === 'read') return read;
      if (key === 'verify') return () => bounded(() => store.verify());
      if (['write', 'remove', 'retire'].includes(String(key)))
        return () => {
          throw Error('Generation history must not mutate storage');
        };
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const tracked: AzureTerraformNetworkHistoryLoaders = {
    async loadSource(digest) {
      const value = await bounded(() => loaders.loadSource(digest));
      const actual = canonicalSha256(value);
      require(!sources.has(digest) ||
        sources.get(digest) === actual, 'predecessor source changed during qualification');
      verifyAzureCePlan(value);
      require(value.planSha256 === digest, 'loaded generation digest differs');
      sources.set(digest, actual);
      return structuredClone(value);
    },
    async loadOutcome(p) {
      const value = await bounded(() => loaders.loadOutcome(structuredClone(p))),
        digest = canonicalSha256(value);
      require(!outcomes.has(p.planSha256) ||
        outcomes.get(p.planSha256)?.digest === digest, 'original outcome changed during qualification');
      outcomes.set(p.planSha256, { plan: structuredClone(p), digest });
      return structuredClone(value);
    },
  };
  const chain: AzureCePlan[] = [plan],
    seen = new Set([plan.planSha256]);
  let current = plan;
  while (current.terraformNetworkProfile || current.terraformNetworkReplacementProfile) {
    const profile = current.terraformNetworkProfile
      ? verifyAzureTerraformNetworkProfile(current)
      : verifyAzureTerraformNetworkReplacementProfile(current);
    require(chain.length <= 32, 'network generation depth exceeds bounded contract');
    const predecessor = await tracked.loadSource(profile.retainedPlanSha256);
    require(!seen.has(predecessor.planSha256) &&
      predecessor.engine === 'terraform' &&
      !predecessor.relayProfile &&
      same(azureUpgradeBinding(predecessor), azureUpgradeBinding(plan)) &&
      same(
        azureTerraformNetworkScope(predecessor, true),
        azureTerraformNetworkScope(plan, true),
      ), 'cyclic or foreign predecessor scope');
    seen.add(predecessor.planSha256);
    if (predecessor.terraformNetworkProfile || predecessor.terraformNetworkReplacementProfile) {
      require((predecessor.terraformNetworkProfile
        ? verifyAzureTerraformNetworkProfile(predecessor)
        : verifyAzureTerraformNetworkReplacementProfile(predecessor)
      ).originalPlanSha256 === profile.originalPlanSha256, 'network original identity differs');
      chain.unshift(predecessor);
      current = predecessor;
    } else {
      const original = await tracked.loadSource(profile.originalPlanSha256);
      require(original.intent.operation === 'deploy' &&
        original.engine === 'terraform' &&
        !original.relayProfile &&
        same(azureUpgradeBinding(original), azureUpgradeBinding(plan)) &&
        same(azureTerraformNetworkScope(original, true), azureTerraformNetworkScope(plan, true)) &&
        (predecessor.intent.operation === 'deploy'
          ? same(predecessor, original)
          : predecessor.intent.operation === 'replace-node' &&
            !predecessor.terraformNetworkReplacementProfile &&
            same(
              azureTerraformNetworkScope(predecessor, false),
              azureTerraformNetworkScope(original, false),
            )), 'original or initial replacement scope differs');
      break;
    }
  }
  let previous: AzureTerraformNetworkCompletedGeneration | undefined;
  const completedPlans = selected ? chain.slice(0, -1) : chain;
  if (completedPlans.length)
    require(typeof verifier === 'function', 'trusted historical operational verifier required');
  for (const predecessor of completedPlans) {
    if (predecessor.terraformNetworkReplacementProfile) {
      require(typeof replacementVerifier === 'function' &&
        previous, 'distinct trusted replacement historical verifier and completed predecessor required');
      const outcome = await tracked.loadOutcome(predecessor);
      require(outcome.engine === 'terraform' &&
        outcome.status === 'complete' &&
        outcome.planId === predecessor.planId &&
        outcome.planSha256 === predecessor.planSha256 &&
        outcome.replacedNode === predecessor.intent.replacementNode &&
        outcome.terraformNoChanges === true &&
        typeof outcome.networkReplacementCompletionSha256 === 'string' &&
        /^[a-f0-9]{64}$/.test(
          outcome.networkReplacementCompletionSha256,
        ), 'exact owning replacement completed outcome and immutable digest required');
      const checkpoint = (await read(`${predecessor.planId}-terraform-replacement.json`)) as Record<string, unknown>;
      const inherited = structuredClone(previous.sourceQualification);
      const completed = await bounded(() =>
        readAzureTerraformNetworkReplacementCompletionHistory(
          predecessor,
          readonlyStore,
          {
            loaders: tracked,
            site: azureTerraformCompletedGenerationSite(previous as AzureTerraformNetworkCompletedGeneration),
            journalSha256: checkpoint.networkExecutionJournalSha256 as string,
            sourceBindingSha256: checkpoint.networkSourceBindingSha256 as string,
            qualifyHistorical: verifier as AzureTerraformNetworkAcceptanceVerifier,
            qualifyCompletedOperational: replacementVerifier as AzureTerraformNetworkReplacementCompletedVerifier,
            qualifiedPrevious: previous,
          },
          outcome.networkReplacementCompletionSha256 as string,
          deadline,
        ),
      );
      require(outcome.newVmId === completed.nodes[String(predecessor.intent.replacementNode)]?.vmId &&
        outcome.siteUid === completed.site.siteUid &&
        completed.originalPlanSha256 ===
          previous.originalPlanSha256, 'owning completed replacement UUID, site or original differs');
      inherited.networkHistory = [...(inherited.networkHistory ?? []), azureTerraformCompletedGenerationLink(previous)];
      inherited.generationPlanSha256s = [
        ...new Set([...inherited.generationPlanSha256s, previous.sourcePlanSha256]),
      ].sort();
      previous = { ...completed, sourceQualification: inherited };
    } else
      previous = await bounded(() =>
        reader(
          predecessor,
          readonlyStore,
          tracked,
          verifier as AzureTerraformNetworkAcceptanceVerifier,
          deadline,
          previous,
        ),
      );
  }
  const qualification = selected
    ? previous
      ? qualifyAzureTerraformAdjacentNetworkSource(plan, selected, previous)
      : await bounded(() =>
          qualifyAzureTerraformNetworkUpdateSource(
            plan,
            selected.source,
            selected.inventory,
            readonlyStore,
            tracked.loadSource,
            tracked.loadOutcome,
            selected.providerLockSha256,
            selected.site,
          ),
        )
    : previous?.sourceQualification;
  require(qualification, 'completed source qualification missing');
  for (const [digest, expected] of sources)
    require(canonicalSha256(await bounded(() => loaders.loadSource(digest))) ===
      expected, 'generation source changed across chain');
  for (const { plan: p, digest } of outcomes.values())
    require(canonicalSha256(await bounded(() => loaders.loadOutcome(structuredClone(p)))) ===
      digest, 'public outcome changed across chain');
  for (const [name, expected] of records)
    require(canonicalSha256(await bounded(() => store.read(name))) ===
      expected, 'historical packet changed across chain');
  await bounded(() => store.verify());
  require(same(store.owner, owner), 'owner changed across generation qualification');
  requestUnchanged();
  unchanged();
  deadline.throwIfAborted();
  return { qualification: structuredClone(qualification), ...(selected ? {} : { completion: previous }) };
}
