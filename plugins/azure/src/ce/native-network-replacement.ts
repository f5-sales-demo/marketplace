import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { AzExecApi } from '../az/exec';
import { verifyAzureCePlan } from './artifacts';
import { canonicalEqual, canonicalSha256 } from './canonical';
import { qualifyAzureNativeNetworkGenerationBoundary } from './native-network-generation';
import {
  azureNativeNetworkHistoryName,
  validateAzureNativeNetworkHistory,
  verifyAzureNativeNetworkHistoryBoundary,
} from './native-network-history';
import { azureNativeNetworkScope, verifyAzureNativeNetworkProfile } from './native-network-plan';
import { readAzureNativeFinalConfiguration } from './native-registered-configuration';
import { captureAzureNetworkUpdateInventory } from './network-update';
import {
  qualifyAzureNativeNetworkUpdateSource,
  verifyAzureNativeNetworkUpdateSite,
} from './network-update-native-source';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCeCheckpoint, AzureCePlan } from './types';

export type AzureNativeNetworkReplacementProfile =
  | {
      schemaVersion: 1;
      originalPlanSha256: string;
      retainedNetworkPlanSha256: string;
    }
  | {
      schemaVersion: 2;
      originalPlanSha256: string;
      retainedNetworkPlanSha256: string;
      retainedReplacementPlanSha256: string;
    };
function require(condition: unknown, message: string): asserts condition {
  if (!condition) throw Error(`Azure native network replacement: ${message}`);
}
const same = canonicalEqual;

/** Structural plan binding only. Every execution needs independent completed history and current identity checks. */
export function verifyAzureNativeNetworkReplacementProfile(plan: AzureCePlan): AzureNativeNetworkReplacementProfile {
  const profile = plan.networkReplacementProfile;
  require(profile &&
    typeof profile === 'object' &&
    !Array.isArray(profile) &&
    ((profile.schemaVersion === 1 &&
      Object.keys(profile).sort().join(',') === 'originalPlanSha256,retainedNetworkPlanSha256,schemaVersion') ||
      (profile.schemaVersion === 2 &&
        Object.keys(profile).sort().join(',') ===
          'originalPlanSha256,retainedNetworkPlanSha256,retainedReplacementPlanSha256,schemaVersion' &&
        /^[a-f0-9]{64}$/.test(profile.retainedReplacementPlanSha256) &&
        ![profile.originalPlanSha256, profile.retainedNetworkPlanSha256, plan.planSha256].includes(
          profile.retainedReplacementPlanSha256,
        ))) &&
    plan.engine === 'native' &&
    !plan.relayProfile &&
    !plan.networkProfile &&
    plan.intent.operation === 'replace-node' &&
    Number.isInteger(plan.intent.replacementNode) &&
    Number(plan.intent.replacementNode) >= 1 &&
    Number(plan.intent.replacementNode) <= plan.topology.nodeCount &&
    /^[a-f0-9]{64}$/.test(profile.originalPlanSha256) &&
    /^[a-f0-9]{64}$/.test(profile.retainedNetworkPlanSha256) &&
    profile.originalPlanSha256 !== profile.retainedNetworkPlanSha256 &&
    profile.originalPlanSha256 !== plan.planSha256 &&
    profile.retainedNetworkPlanSha256 !==
      plan.planSha256, 'exact original and retained network source identities required');
  return profile;
}

/** This separate contract permits only the subnet configuration of the explicit network predecessor.
 * The original replacement-source guard remains unchanged.
 */
export function verifyAzureNativeNetworkReplacementOriginalSource(
  plan: AzureCePlan,
  original: AzureCePlan,
  network: AzureCePlan,
): void {
  for (const source of [plan, original, network]) verifyAzureCePlan(source);
  const profile = verifyAzureNativeNetworkReplacementProfile(plan),
    predecessor = verifyAzureNativeNetworkProfile(network);
  require(original.engine === 'native' &&
    !original.relayProfile &&
    original.intent.operation === 'deploy' &&
    profile.originalPlanSha256 === original.planSha256 &&
    profile.retainedNetworkPlanSha256 === network.planSha256 &&
    predecessor.originalPlanSha256 === original.planSha256 &&
    same(azureUpgradeBinding(plan), azureUpgradeBinding(original)) &&
    same(azureUpgradeBinding(network), azureUpgradeBinding(original)) &&
    same(azureNativeNetworkScope(plan, true), azureNativeNetworkScope(original, true)) &&
    same(azureNativeNetworkScope(network, true), azureNativeNetworkScope(original, true)) &&
    same(
      azureNativeNetworkScope(plan, false),
      azureNativeNetworkScope(network, false),
    ), 'original scope or exact retained network configuration differs');
}

/** Compile a selected-node replacement bound to the exact completed-network candidate, without rewriting creation. */
export function compileAzureNativeNetworkReplacementPlan(
  base: AzureCePlan,
  network: AzureCePlan,
  original: AzureCePlan,
): AzureCePlan {
  for (const source of [base, network, original]) verifyAzureCePlan(source);
  require(base.engine === 'native' &&
    !base.relayProfile &&
    !base.networkProfile &&
    !base.networkReplacementProfile &&
    base.intent.operation === 'replace-node', 'unbound native replacement plan required');
  const { planId: _id, planSha256: _sha, ...draft } = structuredClone(base);
  if (network.networkReplacementProfile) {
    const retained = verifyAzureNativeNetworkReplacementProfile(network);
    require(retained.originalPlanSha256 === original.planSha256 &&
      same(azureUpgradeBinding(base), azureUpgradeBinding(original)) &&
      same(azureUpgradeBinding(network), azureUpgradeBinding(original)) &&
      same(azureNativeNetworkScope(base, true), azureNativeNetworkScope(original, true)) &&
      same(
        azureNativeNetworkScope(base, false),
        azureNativeNetworkScope(network, false),
      ), 'retained replacement scope or original identity differs');
    draft.networkReplacementProfile = {
      schemaVersion: 2,
      originalPlanSha256: original.planSha256,
      retainedNetworkPlanSha256: retained.retainedNetworkPlanSha256,
      retainedReplacementPlanSha256: network.planSha256,
    };
  } else
    draft.networkReplacementProfile = {
      schemaVersion: 1,
      originalPlanSha256: original.planSha256,
      retainedNetworkPlanSha256: network.planSha256,
    };
  const digest = canonicalSha256(draft),
    plan = { ...draft, planId: `azure-ce-${digest.slice(0, 24)}`, planSha256: digest };
  if (network.networkReplacementProfile) verifyAzureCePlan(plan);
  else verifyAzureNativeNetworkReplacementOriginalSource(plan, original, network);
  return plan;
}

function completed(plan: AzureCePlan, checkpoint: AzureCeCheckpoint | undefined): AzureCeCheckpoint {
  require(checkpoint?.engine === 'native' &&
    checkpoint.planId === plan.planId &&
    checkpoint.planSha256 === plan.planSha256 &&
    checkpoint.state === 'complete' &&
    !checkpoint.pendingAction &&
    same(
      checkpoint.completedActionIds,
      plan.actions.map((action) => action.id),
    ), 'complete ordered network public execution required');
  return checkpoint;
}

/** Read-only source qualification before replacement enrollment or mutation.
 * Historical registration binds UUID/MAC/device/site identity; collection metadata never proves link freshness.
 */
export async function qualifyAzureNativeNetworkReplacementHistory(
  plan: AzureCePlan,
  store: Pick<CeDeploymentStore, 'read' | 'verify'>,
  load: (source: AzureCePlan) => Promise<AzureCeCheckpoint | undefined>,
) {
  await store.verify();
  verifyAzureCePlan(plan);
  const profile = verifyAzureNativeNetworkReplacementProfile(plan);
  const original = (await store.read(`native-source-${profile.originalPlanSha256}.json`)) as AzureCePlan;
  const networkSource = (await store.read(`native-source-${profile.retainedNetworkPlanSha256}.json`)) as AzureCePlan;
  verifyAzureNativeNetworkReplacementOriginalSource(plan, original, networkSource);
  const history = validateAzureNativeNetworkHistory(
    networkSource,
    await store.read(azureNativeNetworkHistoryName(networkSource)),
  );
  const checkpoint = completed(networkSource, await load(networkSource));
  require(same(
    checkpoint.networkUpdate,
    history.networkUpdate,
  ), 'completed network checkpoint and immutable history differ');
  const source = await qualifyAzureNativeNetworkUpdateSource(networkSource, history.networkUpdate.before, store, load);
  require(same(history.networkUpdate.source, source), 'completed network source binding changed');
  const final = await readAzureNativeFinalConfiguration(networkSource, history.networkUpdate.current, store);
  require(final.receiptSha256 === history.finalConfigurationSha256 &&
    final.siteUid === source.siteUid &&
    final.siteConfigurationSha256 === source.siteConfigurationSha256 &&
    Object.entries(final.instances).every(
      ([node, uuid]) =>
        uuid.toLowerCase() ===
        history.networkUpdate.current.nodes[
          String(azureUpgradeBinding(networkSource).nodes.indexOf(node) + 1)
        ].vmId.toLowerCase(),
    ), 'final network configuration receipt or registered UUID differs');
  const networkInventory =
    profile.schemaVersion === 2
      ? (
          await qualifyAzureNativeNetworkGenerationBoundary(
            networkSource,
            history.networkUpdate.current,
            profile.retainedReplacementPlanSha256,
            store,
            load,
          )
        ).inventory
      : history.networkUpdate.current;
  const selected = plan.actions.filter(
    (action) => action.kind === 'vm-delete' && action.node === plan.intent.replacementNode,
  );
  const before = networkInventory.nodes[String(plan.intent.replacementNode)];
  require(selected.length === 1 &&
    selected[0].resourceId?.toLowerCase() === before.resourceId.toLowerCase() &&
    selected[0].expectedOwnerPlanSha256 === before.ownerPlanSha256, 'selected VM delete boundary differs');
  return { original, networkSource, source, networkInventory, historySha256: canonicalSha256(history) };
}

/** Current cloud and site qualification before replacement enrollment. */
export async function qualifyAzureNativeNetworkReplacementSource(
  plan: AzureCePlan,
  store: Pick<CeDeploymentStore, 'read' | 'verify'>,
  load: (source: AzureCePlan) => Promise<AzureCeCheckpoint | undefined>,
  api: AzExecApi,
  runtime: Pick<CeRuntime, 'observeOwnedSite' | 'ownedSiteConfiguration'>,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const history = await qualifyAzureNativeNetworkReplacementHistory(plan, store, load);
  if (plan.networkReplacementProfile?.schemaVersion === 2) {
    const { verifyAzureNativeNetworkReplacementExecution, azureNativeNetworkReplacementNics } = await import(
      './native-network-replacement-execution'
    );
    const prepared = {
      schemaVersion: 1 as const,
      engine: 'native' as const,
      planSha256: plan.planSha256,
      siteReserved: false,
      bootstrapByNode: {},
      launchedAtByNode: {},
      replacement: {
        node: Number(plan.intent.replacementNode),
        status: 'prepared' as const,
        siteUid: history.source.siteUid,
        siteConfigurationSha256: history.source.siteConfigurationSha256,
        originalSourcePlan: history.original,
        networkSourcePlan: history.networkSource,
        networkInventory: history.networkInventory,
        networkHistorySha256: history.historySha256,
        oldVmIds: Object.fromEntries(
          Object.entries(history.networkInventory.nodes).map(([index, vm]) => [
            `${plan.deploymentName}-${index}`,
            vm.vmId,
          ]),
        ),
        ownerPlanSha256ByNode: Object.fromEntries(
          Object.entries(history.networkInventory.nodes).map(([index, vm]) => [
            `${plan.deploymentName}-${index}`,
            vm.ownerPlanSha256,
          ]),
        ),
        retainedNics: azureNativeNetworkReplacementNics(history.networkInventory),
      },
    };
    await verifyAzureNativeNetworkReplacementExecution(plan, prepared, store, load, api, runtime, undefined, signal);
    return history;
  }
  const networkInventory = await captureAzureNetworkUpdateInventory(history.networkSource, api, signal);
  verifyAzureNativeNetworkHistoryBoundary(history.networkInventory, networkInventory);
  await verifyAzureNativeNetworkUpdateSite(history.networkSource, history.source, runtime, signal);
  signal?.throwIfAborted();
  return { ...history, networkInventory };
}
