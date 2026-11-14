import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { verifyAzureCePlan } from './artifacts';
import { canonicalEqual, canonicalSha256 } from './canonical';
import { verifyAzureNativeNetworkProfile } from './native-network-plan';
import { validateAzureCeCheckpoint } from './recovery';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCeCheckpoint, AzureCePlan } from './types';

export interface AzureNativeNetworkCheckpointHistory {
  schemaVersion: 1;
  kind: 'azure-native-network-public-checkpoint';
  engine: 'native';
  owner: CeDeploymentStore['owner'];
  sourcePlanSha256: string;
  checkpoint: AzureCeCheckpoint;
  checkpointSha256: string;
  actionReceiptSha256ById: Record<string, string>;
}
function require(condition: unknown, message: string): asserts condition {
  if (!condition) throw Error(`Azure native network checkpoint history: ${message}`);
}
const same = canonicalEqual;
const object = (value: unknown): Record<string, unknown> => {
  require(value && typeof value === 'object' && !Array.isArray(value), 'malformed checkpoint record');
  return value as Record<string, unknown>;
};
const boundaryIds = (checkpoint: AzureCeCheckpoint) =>
  new Set([
    ...checkpoint.completedActionIds,
    ...(checkpoint.failedActionId ? [checkpoint.failedActionId] : []),
    ...(checkpoint.pendingAction ? [checkpoint.pendingAction.actionId] : []),
  ]);
export const azureNativeNetworkCheckpointHistoryName = (row: AzureNativeNetworkCheckpointHistory) =>
  `native-network-checkpoint-${row.sourcePlanSha256}-${canonicalSha256(row).slice(0, 24)}.json`;
export const isAzureNativeNetworkCheckpointHistory = (name: string) =>
  /^native-network-checkpoint-[a-f0-9]{64}-[a-f0-9]{24}\.json$/.test(name);

/** Exact public execution identity. Running/partial states never establish completed networking or CE freshness. */
export function validateAzureNativeNetworkCheckpointHistory(
  plan: AzureCePlan,
  value: unknown,
): AzureNativeNetworkCheckpointHistory {
  verifyAzureCePlan(plan);
  const profile = verifyAzureNativeNetworkProfile(plan),
    row = object(value);
  require(Object.keys(row).sort().join(',') ===
    'actionReceiptSha256ById,checkpoint,checkpointSha256,engine,kind,owner,schemaVersion,sourcePlanSha256' &&
    row.schemaVersion === 1 &&
    row.kind === 'azure-native-network-public-checkpoint' &&
    row.engine === 'native' &&
    row.sourcePlanSha256 === plan.planSha256 &&
    same(row.owner, azureUpgradeBinding(plan).owner) &&
    typeof row.checkpointSha256 === 'string' &&
    row.checkpointSha256 === canonicalSha256(row.checkpoint), 'public checkpoint owner, schema or digest differs');
  const checkpoint = validateAzureCeCheckpoint(row.checkpoint, plan);
  require(checkpoint.networkUpdate?.source?.originalPlanSha256 === profile.originalPlanSha256 &&
    (profile.retainedPlanSha256 === profile.originalPlanSha256
      ? checkpoint.networkUpdate.source.networkHistoryPlanSha256s.length === 0
      : checkpoint.networkUpdate.source.networkHistoryPlanSha256s.at(-1) ===
        profile.retainedPlanSha256), 'complete original and retained source provenance required');
  const receipts = object(row.actionReceiptSha256ById),
    ids = boundaryIds(checkpoint);
  require(Object.entries(receipts).every(
    ([id, digest]) => ids.has(id) && typeof digest === 'string' && /^[a-f0-9]{64}$/.test(digest),
  ), 'action receipt is outside the saved public boundary');
  return value as AzureNativeNetworkCheckpointHistory;
}

/** Persist only after the owning public checkpoint save. No enrollment secrets or command substitutions are copied. */
export async function persistAzureNativeNetworkCheckpointHistory(
  plan: AzureCePlan,
  checkpoint: AzureCeCheckpoint,
  store: Pick<CeDeploymentStore, 'read' | 'write' | 'verify' | 'owner'>,
): Promise<void> {
  await store.verify();
  require(same(store.owner, azureUpgradeBinding(plan).owner) &&
    same(await store.read(`native-source-${plan.planSha256}.json`), plan), 'owning saved source differs');
  const receipts: Record<string, string> = {};
  for (const id of boundaryIds(checkpoint)) {
    let value: unknown;
    try {
      value = await store.read(`native-action-${plan.planSha256}-${id}.json`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (value === undefined) continue;
    const row = object(value),
      action = plan.actions.find((item) => item.id === id);
    require(action &&
      Object.keys(row).sort().join(',') ===
        'actionId,actionSha256,engine,evidence,owner,schemaVersion,sourcePlanSha256' &&
      row.schemaVersion === 1 &&
      row.engine === 'native' &&
      same(row.owner, store.owner) &&
      row.sourcePlanSha256 === plan.planSha256 &&
      row.actionId === id &&
      row.actionSha256 === canonicalSha256(action), 'staged action receipt identity differs');
    receipts[id] = canonicalSha256(value);
  }
  const row: AzureNativeNetworkCheckpointHistory = {
    schemaVersion: 1,
    kind: 'azure-native-network-public-checkpoint',
    engine: 'native',
    owner: store.owner,
    sourcePlanSha256: plan.planSha256,
    checkpoint: structuredClone(checkpoint),
    checkpointSha256: canonicalSha256(checkpoint),
    actionReceiptSha256ById: receipts,
  };
  validateAzureNativeNetworkCheckpointHistory(plan, row);
  const name = azureNativeNetworkCheckpointHistoryName(row);
  let saved: unknown;
  try {
    saved = await store.read(name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  require(saved === undefined || same(saved, row), 'immutable public checkpoint record changed');
  if (saved === undefined) await store.write(name, row);
}
