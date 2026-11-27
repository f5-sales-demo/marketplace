import { createHash } from 'node:crypto';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { verifyAzureCePlan } from './artifacts';
import { canonicalEqual, canonicalSha256 } from './canonical';
import { validateAzureNetworkUpdateInventory, verifyAzureNetworkUpdateProgress } from './network-update';
import { validateAzureNetworkUpdateTerraformReceipt } from './network-update-terraform';
import {
  type AzureTerraformNetworkAcceptanceIdentity,
  type AzureTerraformNetworkAcceptanceVerifier,
  AzureTerraformNetworkCheckpoint,
} from './terraform-network-checkpoint';
import {
  type AzureTerraformNetworkCompletedGeneration,
  type AzureTerraformNetworkCompletedHistory,
  type AzureTerraformNetworkHistoryLoaders,
  qualifyAzureTerraformAdjacentNetworkSource,
  runAzureTerraformNetworkGenerationHistory,
} from './terraform-network-generation-history';
import { AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256 } from './terraform-network-nic-projection';
import {
  buildAzureTerraformNetworkPinnedNicStage,
  buildAzureTerraformNetworkRoutingStage,
} from './terraform-network-routing';
import type { AzureTerraformNetworkSourceBinding } from './terraform-network-source-binding';
import {
  qualifyAzureTerraformNetworkUpdateSource,
  verifyAzureTerraformNetworkUpdateState,
} from './terraform-network-update-source';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

type Json = Record<string, unknown>;
type Loaders = { loadSource(digest: string): Promise<AzureCePlan>; loadOutcome(source: AzureCePlan): Promise<Json> };
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const same = (a: unknown, b: unknown) => canonicalEqual(a, b);
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure Terraform network completion history: ${message}`);
}
function object(value: unknown): Json {
  require(value && typeof value === 'object' && !Array.isArray(value), 'malformed historical record');
  return value as Json;
}
function keys(value: unknown, fields: string[]): void {
  require(same(Object.keys(object(value)).sort(), fields.toSorted()), 'historical schema differs');
}
function verification(value: unknown) {
  keys(value, ['status', 'scope', 'evidenceSha256']);
  const row = value as { status: string; scope: string; evidenceSha256: string };
  require(row.status === 'verified' &&
    row.scope === 'node-interfaces-routing-traffic' &&
    typeof row.evidenceSha256 === 'string' &&
    /^[a-f0-9]{64}$/.test(row.evidenceSha256), 'historical operational provenance required');
  return row;
}

/** Internal private history reader. The returned finalSource contains enrollment material and must
 * never be exposed through a public tool or sanitized receipt. Authenticates original completion,
 * not refreshed current-final evidence; it never opens Terraform, observes cloud, or replays stages.
 * Historical acceptance provenance is required and never represents current operational freshness.
 */
export async function readAzureTerraformNetworkCompletionOne(
  source: AzureCePlan,
  store: CeDeploymentStore,
  loaders: Loaders,
  qualifyAcceptance: AzureTerraformNetworkAcceptanceVerifier,
  signal?: AbortSignal,
  previous?: AzureTerraformNetworkCompletedGeneration,
): Promise<AzureTerraformNetworkCompletedHistory> {
  signal?.throwIfAborted();
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const plan = structuredClone(source);
  verifyAzureCePlan(plan);
  require(plan.engine === 'terraform' &&
    plan.intent.operation === 'update-network' &&
    same(store.owner, azureUpgradeBinding(plan).owner) &&
    typeof qualifyAcceptance === 'function', 'owning completed network scope required');
  await store.verify();
  const observed = new Map<string, string>();
  const read = async (name: string) => {
    deadline.throwIfAborted();
    const value = await bounded(() => store.read(name)),
      digest = canonicalSha256(value);
    require(!observed.has(name) || observed.get(name) === digest, 'historical record changed between reads');
    observed.set(name, digest);
    return structuredClone(value);
  };
  const readonlyStore = new Proxy(store, {
    get(target, key) {
      if (key === 'read') return read;
      if (['write', 'remove', 'retire'].includes(String(key)))
        return () => {
          throw Error('Historical inspection must not mutate storage');
        };
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const bounded = async <T>(task: () => Promise<T>): Promise<T> => {
    deadline.throwIfAborted();
    const abort = Promise.withResolvers<never>();
    const onAbort = () => abort.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const value = await Promise.race([task(), abort.promise]);
      deadline.throwIfAborted();
      return value;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  const qualify: AzureTerraformNetworkAcceptanceVerifier = (receipt, identity, mode) => {
    require(mode === 'historical', 'read-only history cannot request current acceptance');
    return bounded(() =>
      qualifyAcceptance(structuredClone(receipt), structuredClone(identity), 'historical', deadline),
    );
  };
  const sourceDigests = new Map<string, string>();
  const outcomes = new Map<string, { source: AzureCePlan; digest: string }>();
  const loadSource = async (digest: string) => {
    const value = await bounded(() => loaders.loadSource(digest)),
      actual = canonicalSha256(value);
    require(!sourceDigests.has(digest) || sourceDigests.get(digest) === actual, 'loaded predecessor source changed');
    sourceDigests.set(digest, actual);
    return structuredClone(value);
  };
  const loadOutcome = async (owner: AzureCePlan) => {
    const value = await bounded(() => loaders.loadOutcome(structuredClone(owner))),
      actual = canonicalSha256(value);
    require(!outcomes.has(owner.planSha256) ||
      outcomes.get(owner.planSha256)?.digest === actual, 'loaded public outcome changed');
    outcomes.set(owner.planSha256, { source: structuredClone(owner), digest: actual });
    return structuredClone(value);
  };
  const prefix = `${plan.planId}-terraform-network`;
  const binding = (await read(`${prefix}-source.json`)) as AzureTerraformNetworkSourceBinding;
  keys(binding, [
    'schemaVersion',
    'kind',
    'engine',
    'owner',
    'planSha256',
    'source',
    'sourceConfigurationSha256',
    'providerLockSha256',
    'before',
    'outputs',
    'qualification',
  ]);
  require(binding.schemaVersion === 1 &&
    binding.kind === 'azure-terraform-network-original-source' &&
    binding.engine === 'terraform' &&
    same(binding.owner, store.owner) &&
    binding.planSha256 === plan.planSha256 &&
    typeof binding.source === 'string' &&
    hash(binding.source) === binding.sourceConfigurationSha256 &&
    binding.providerLockSha256 === AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256, 'original source identity differs');
  validateAzureNetworkUpdateInventory(plan, binding.before);
  verifyAzureTerraformNetworkUpdateState(plan, binding.before, binding.outputs);
  require(binding.qualification &&
    typeof binding.qualification.siteUid === 'string' &&
    typeof binding.qualification.siteConfigurationSha256 === 'string', 'original site qualification missing');
  const original = previous
    ? qualifyAzureTerraformAdjacentNetworkSource(
        plan,
        {
          source: binding.source,
          inventory: binding.before,
          providerLockSha256: binding.providerLockSha256,
          site: {
            siteUid: binding.qualification.siteUid,
            siteConfigurationSha256: binding.qualification.siteConfigurationSha256,
          },
        },
        previous,
      )
    : await bounded(() =>
        qualifyAzureTerraformNetworkUpdateSource(
          plan,
          binding.source,
          binding.before,
          readonlyStore,
          loadSource,
          loadOutcome,
          binding.providerLockSha256,
          {
            siteUid: binding.qualification.siteUid,
            siteConfigurationSha256: binding.qualification.siteConfigurationSha256,
          },
        ),
      );
  require(same(binding.qualification, original), 'original source qualification changed');
  const snapshot = await AzureTerraformNetworkCheckpoint.inspect(plan, binding, readonlyStore, qualify, deadline);
  require(snapshot.allNodesAccepted &&
    snapshot.checkpoint.nodes.length === plan.topology.nodeCount, 'complete accepted serial node history required');
  let nodeSource = binding.source;
  for (const row of snapshot.checkpoint.nodes) {
    deadline.throwIfAborted();
    const stage = buildAzureTerraformNetworkPinnedNicStage(plan, nodeSource, row.before, row.node);
    const preflight = object(await read(`${prefix}-node-${row.node}-preflight.json`));
    keys(preflight, ['schemaVersion', 'sourceBindingSha256', 'identity', 'receipt', 'verification']);
    require(preflight.schemaVersion === 1 &&
      preflight.sourceBindingSha256 === canonicalSha256(binding), 'original preflight source differs');
    const expected = preflight.identity as AzureTerraformNetworkAcceptanceIdentity;
    keys(expected, [
      'owner',
      'planSha256',
      'node',
      'siteName',
      'siteUid',
      'siteConfigurationSha256',
      'configurationSha256',
      'inventory',
    ]);
    require(same(expected.owner, store.owner) &&
      expected.planSha256 === plan.planSha256 &&
      expected.node === row.node &&
      expected.siteName === plan.siteName &&
      expected.siteUid === original.siteUid &&
      expected.siteConfigurationSha256 === original.siteConfigurationSha256 &&
      expected.configurationSha256 ===
        stage.previousConfigurationSha256, 'original preflight node/site/configuration differs');
    const applied = Array.from({ length: row.node - 1 }, (_, i) =>
      plan.nics.map((nic) => `${i + 1}:${nic.index}`),
    ).flat();
    verifyAzureNetworkUpdateProgress(plan, binding.before, expected.inventory, applied);
    for (const [node, vm] of Object.entries(binding.before.nodes))
      for (const [index, nic] of Object.entries(vm.nics))
        if (!applied.includes(`${node}:${index}`))
          require(expected.inventory.nodes[node].nics[index].privateIp ===
            nic.privateIp, 'unsubmitted preflight private address differs');
    require(same(
      verification(await qualify(preflight.receipt, expected, 'historical', deadline)),
      verification(preflight.verification),
    ), 'preflight acceptance provenance changed');
    require(row.history?.phase === 'routing-complete', 'accepted routing-complete history required');
    nodeSource = buildAzureTerraformNetworkRoutingStage(
      plan,
      nodeSource,
      row.before,
      row.history.inventory,
      row.node,
    ).releasedConfiguration;
  }
  const packet = object(await read(`${prefix}-driver-complete.json`));
  keys(packet, [
    'schemaVersion',
    'engine',
    'planSha256',
    'sourceBindingSha256',
    'checkpointSha256',
    'receipt',
    'inventory',
    'outputs',
    'evidenceByNode',
  ]);
  require(packet.schemaVersion === 1 &&
    packet.engine === 'terraform' &&
    packet.planSha256 === plan.planSha256 &&
    packet.sourceBindingSha256 === canonicalSha256(binding) &&
    packet.checkpointSha256 === snapshot.checkpointSha256 &&
    hash(nodeSource) === snapshot.configurationSha256, 'immutable completion identity differs');
  const row = snapshot.checkpoint.nodes.at(-1);
  require(row, 'final selected node history missing');
  const finalStage = {
    ...buildAzureTerraformNetworkPinnedNicStage(plan, snapshot.nodeSource, row.before, row.node),
    configuration: nodeSource,
    configurationSha256: hash(nodeSource),
  };
  type Packet = {
    receipt: Parameters<typeof validateAzureNetworkUpdateTerraformReceipt>[2];
    inventory: AzureTerraformNetworkAcceptanceIdentity['inventory'];
    outputs: Record<string, unknown>;
    evidenceByNode: Record<string, { receipt: unknown; verification: unknown }>;
  };
  const completed = packet as unknown as Packet;
  validateAzureNetworkUpdateTerraformReceipt(plan, finalStage, completed.receipt, binding.providerLockSha256);
  require(completed.receipt.noChanges &&
    completed.receipt.configurationSha256 === hash(nodeSource), 'original final refresh changes or differs');
  const all = Object.keys(binding.before.nodes).flatMap((node) => plan.nics.map((nic) => `${node}:${nic.index}`));
  verifyAzureNetworkUpdateProgress(plan, binding.before, completed.inventory, all);
  verifyAzureTerraformNetworkUpdateState(plan, completed.inventory, completed.outputs);
  keys(completed.evidenceByNode, Object.keys(binding.before.nodes));
  for (let node = 1; node <= plan.topology.nodeCount; node++) {
    const evidence = completed.evidenceByNode[String(node)];
    keys(evidence, ['receipt', 'verification']);
    const expected: AzureTerraformNetworkAcceptanceIdentity = {
      owner: structuredClone(store.owner),
      planSha256: plan.planSha256,
      node,
      siteName: plan.siteName,
      siteUid: original.siteUid,
      siteConfigurationSha256: original.siteConfigurationSha256,
      configurationSha256: snapshot.configurationSha256,
      inventory: structuredClone(completed.inventory),
    };
    require(same(
      verification(await qualify(evidence.receipt, expected, 'historical', deadline)),
      verification(evidence.verification),
    ), 'final node acceptance provenance changed');
  }
  for (const [digest, expected] of sourceDigests)
    require(canonicalSha256(await bounded(() => loaders.loadSource(digest))) ===
      expected, 'predecessor source changed during qualification');
  for (const { source: owner, digest } of outcomes.values())
    require(canonicalSha256(await bounded(() => loaders.loadOutcome(structuredClone(owner)))) ===
      digest, 'public outcome changed during qualification');
  await store.verify();
  require(same(store.owner, binding.owner), 'owner changed during historical qualification');
  for (const [name, digest] of observed) {
    deadline.throwIfAborted();
    require(canonicalSha256(await bounded(() => store.read(name))) ===
      digest, 'historical evidence changed during qualification');
  }
  deadline.throwIfAborted();
  return {
    schemaVersion: 1 as const,
    kind: 'azure-terraform-network-completion-history' as const,
    engine: 'terraform' as const,
    sourcePlanSha256: plan.planSha256,
    originalPlanSha256: original.originalPlanSha256,
    sourceBindingSha256: canonicalSha256(binding),
    checkpointSha256: snapshot.checkpointSha256,
    completionSha256: canonicalSha256(packet),
    finalConfigurationSha256: hash(nodeSource),
    finalSource: nodeSource,
    before: structuredClone(binding.before),
    inventory: structuredClone(completed.inventory),
    outputs: structuredClone(completed.outputs),
    siteUid: original.siteUid,
    siteConfigurationSha256: original.siteConfigurationSha256,
    sourceQualification: structuredClone(original),
    currentOperationalAcceptanceQualified: false as const,
  };
}

/** Internal private completed-generation reader. Always authenticate full ordered predecessor history. */
export async function readAzureTerraformNetworkCompletionHistory(
  plan: AzureCePlan,
  store: CeDeploymentStore,
  loaders: AzureTerraformNetworkHistoryLoaders,
  verifier: AzureTerraformNetworkAcceptanceVerifier,
  signal?: AbortSignal,
  replacementVerifier?: import('./terraform-network-replacement-completion').AzureTerraformNetworkReplacementCompletedVerifier,
): Promise<AzureTerraformNetworkCompletedHistory> {
  const result = await runAzureTerraformNetworkGenerationHistory(
    plan,
    store,
    loaders,
    verifier,
    readAzureTerraformNetworkCompletionOne,
    undefined,
    signal,
    replacementVerifier,
  );
  require(result.completion?.kind ===
    'azure-terraform-network-completion-history', 'immutable completed network history required');
  return result.completion;
}
/** Internal private source qualifier; never return enrollment material or infer current freshness. */
export async function qualifyAzureTerraformNetworkGenerationSource(
  plan: AzureCePlan,
  source: string,
  inventory: AzureTerraformNetworkCompletedHistory['inventory'],
  store: CeDeploymentStore,
  loaders: AzureTerraformNetworkHistoryLoaders,
  providerLockSha256: string,
  site: { siteUid: string; siteConfigurationSha256: string },
  verifier?: AzureTerraformNetworkAcceptanceVerifier,
  signal?: AbortSignal,
  replacementVerifier?: import('./terraform-network-replacement-completion').AzureTerraformNetworkReplacementCompletedVerifier,
) {
  return (
    await runAzureTerraformNetworkGenerationHistory(
      plan,
      store,
      loaders,
      verifier,
      readAzureTerraformNetworkCompletionOne,
      { source, inventory, providerLockSha256, site },
      signal,
      replacementVerifier,
    )
  ).qualification;
}
