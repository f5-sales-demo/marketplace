import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { verifyAzureCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import { verifyAzureNativeNetworkReplacementOriginalSource } from './native-network-replacement';
import { verifyAzureNativeNetworkReplacementRetirementNicBridge } from './native-network-replacement-retirement';
import { verifyAzureNativeReplacementOriginalSource } from './native-replacement-source';
import {
  type NativeWorkflowCheckpoint,
  validateAzureNativeAdmissionCheckpoint,
  validateAzureNativeReplacementState,
} from './native-workflow';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

type Json = Record<string, unknown>;
const require = (condition: unknown, message: string): void => {
  if (!condition) throw Error(`Azure native replacement history: ${message}`);
};
const same = (a: unknown, b: unknown) => canonicalSha256(a) === canonicalSha256(b);
const object = (value: unknown): Json => {
  require(value && typeof value === 'object' && !Array.isArray(value), 'malformed record');
  return value as Json;
};
export const azureNativeReplacementHistoryName = (plan: AzureCePlan) =>
  `native-replacement-history-${plan.planSha256}.json`;
export const isAzureNativeReplacementHistory = (name: string) =>
  /^native-replacement-history-[a-f0-9]{64}\.json$/.test(name);

function validate(plan: AzureCePlan, value: unknown) {
  const record = object(value);
  require(Object.keys(record).sort().join(',') ===
    'bootstrappedNodes,engine,kind,launchedAtByNode,owner,replacement,schemaVersion,sourcePlanSha256' &&
    record.schemaVersion === 1 &&
    record.kind === 'azure-native-replacement-history' &&
    record.engine === 'native' &&
    record.sourcePlanSha256 === plan.planSha256 &&
    same(record.owner, azureUpgradeBinding(plan).owner), 'source or record fields differ');
  const replacement = object(record.replacement) as unknown as NonNullable<NativeWorkflowCheckpoint['replacement']>;
  validateAzureNativeReplacementState(plan, replacement);
  require(!plan.relayProfile && replacement.originalSourcePlan, 'standard original creation missing');
  const bootstrapped = record.bootstrappedNodes;
  const launched = object(record.launchedAtByNode);
  require(Array.isArray(bootstrapped) &&
    new Set(bootstrapped).size === bootstrapped.length &&
    bootstrapped.every((node) => node === String(replacement.node)) &&
    Object.entries(launched).every(
      ([node, at]) =>
        bootstrapped.includes(node) &&
        typeof at === 'string' &&
        Number.isFinite(Date.parse(at)) &&
        Date.parse(at) <= Date.now(),
    ) &&
    (replacement.status !== 'registered' ||
      (bootstrapped.includes(String(replacement.node)) &&
        Object.hasOwn(launched, String(replacement.node)))), 'generation launch boundary differs');
  return replacement;
}

/** Preserve non-secret identity/launch provenance before deleting the enrollment checkpoint. */
export async function persistAzureNativeReplacementHistory(
  plan: AzureCePlan,
  checkpoint: NativeWorkflowCheckpoint,
  store: Pick<CeDeploymentStore, 'read' | 'write'>,
) {
  validateAzureNativeAdmissionCheckpoint(plan, checkpoint);
  const value = {
    schemaVersion: 1,
    kind: 'azure-native-replacement-history',
    engine: 'native',
    owner: azureUpgradeBinding(plan).owner,
    sourcePlanSha256: plan.planSha256,
    replacement: structuredClone(checkpoint.replacement),
    bootstrappedNodes: Object.keys(checkpoint.bootstrapByNode).sort(),
    launchedAtByNode: structuredClone(checkpoint.launchedAtByNode),
  };
  validate(plan, value);
  let saved: unknown;
  try {
    saved = await store.read(azureNativeReplacementHistoryName(plan));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  require(saved === undefined || same(saved, value), 'saved immutable generation history changed');
  if (saved === undefined) await store.write(azureNativeReplacementHistoryName(plan), value);
}

/** Offline retirement provenance. Registered and interrupted generations remain distinct. */
export async function verifyAzureNativeReplacementHistories(
  base: AzureCePlan,
  siteUid: string,
  records: Map<string, unknown>,
) {
  const sources = new Map<string, AzureCePlan>([[base.planSha256, base]]);
  const histories = new Map<string, NonNullable<NativeWorkflowCheckpoint['replacement']>>();
  for (const [name, value] of records)
    if (name.startsWith('native-source-')) {
      const source = value as AzureCePlan;
      verifyAzureCePlan(source);
      require(name === `native-source-${source.planSha256}.json`, 'source filename differs');
      if (source.intent.operation === 'replace-node') {
        if (source.networkReplacementProfile) {
          const network = records.get(
            `native-source-${source.networkReplacementProfile.retainedNetworkPlanSha256}.json`,
          ) as AzureCePlan;
          require(network, 'retained network source is unresolved');
          verifyAzureNativeNetworkReplacementOriginalSource(source, base, network);
        } else verifyAzureNativeReplacementOriginalSource(source, base);
      }
      sources.set(source.planSha256, source);
    }
  for (const [name, value] of records)
    if (isAzureNativeReplacementHistory(name)) {
      const source = sources.get(String(object(value).sourcePlanSha256));
      require(source && name === azureNativeReplacementHistoryName(source), 'history source is unresolved');
      const replacement = validate(source as AzureCePlan, value);
      require(same(replacement.originalSourcePlan, base) &&
        replacement.siteUid === siteUid &&
        !histories.has((source as AzureCePlan).planSha256), 'original creation or logical site differs');
      histories.set((source as AzureCePlan).planSha256, replacement);
    }
  const nodes = azureUpgradeBinding(base).nodes;
  const boundaries = new Map<string, string>();
  const visit = async (digest: string, path: Set<string>): Promise<void> => {
    require(!path.has(digest), 'recursive generation history');
    const current = histories.get(digest);
    require(current, 'generation history is unresolved');
    const next = new Set([...path, digest]);
    for (const node of nodes) {
      const owner = current?.ownerPlanSha256ByNode[node] as string;
      const key = `${owner}:${node}`,
        vmId = current?.oldVmIds[node]?.toLowerCase();
      require(vmId &&
        (!boundaries.has(key) ||
          boundaries.get(key) === vmId), 'survivor UUID differs across historical generation boundaries');
      boundaries.set(key, vmId as string);
      if (owner === base.planSha256) continue;
      const source = sources.get(owner),
        prior = histories.get(owner);
      require(source?.intent.replacementNode === nodes.indexOf(node) + 1 &&
        prior?.status === 'registered' &&
        prior.newVmId?.toLowerCase() ===
          current?.oldVmIds[node]?.toLowerCase(), 'retained VM owner or interface predecessor differs');
      if (!same(prior?.retainedNics, current?.retainedNics)) {
        const currentSource = sources.get(digest);
        require(currentSource?.networkReplacementProfile, 'retained VM owner or interface predecessor differs');
        await verifyAzureNativeNetworkReplacementRetirementNicBridge(
          currentSource as AzureCePlan,
          current as NonNullable<NativeWorkflowCheckpoint['replacement']>,
          owner,
          prior as NonNullable<NativeWorkflowCheckpoint['replacement']>,
          records,
        );
      }
      await visit(owner, next);
    }
  };
  for (const digest of histories.keys()) await visit(digest, new Set());
  for (const source of sources.values())
    if (source.intent.operation === 'replace-node' && !histories.has(source.planSha256))
      require(!Array.from(records.keys()).some((name) =>
        name.startsWith(`native-action-${source.planSha256}-`),
      ), 'executed source has no replacement history');
}
