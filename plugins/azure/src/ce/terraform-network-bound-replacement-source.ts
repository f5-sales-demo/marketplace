import { createHash } from 'node:crypto';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { verifyAzureCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import { type AzureNetworkUpdateInventory, validateAzureNetworkUpdateInventory } from './network-update';
import type { AzureTerraformNetworkAcceptanceVerifier } from './terraform-network-checkpoint';
import { readAzureTerraformNetworkCompletionOne } from './terraform-network-completion-history';
import {
  type AzureTerraformNetworkCompletedGeneration,
  type AzureTerraformNetworkHistoryLoaders,
  azureTerraformCompletedGenerationLink,
  azureTerraformCompletedGenerationNodes,
  azureTerraformCompletedGenerationSite,
  runAzureTerraformNetworkGenerationHistory,
  validateAzureTerraformReplacementPredecessorInventory,
} from './terraform-network-generation-history';
import { AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256 } from './terraform-network-nic-projection';
import { azureTerraformNetworkScope, verifyAzureTerraformNetworkProfile } from './terraform-network-plan';
import type { AzureTerraformNetworkReplacementCompletedVerifier } from './terraform-network-replacement-completion';
import { verifyAzureTerraformNetworkReplacementProfile } from './terraform-network-replacement-plan';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

export interface AzureTerraformNetworkBoundReplacementInput {
  plan: AzureCePlan;
  networkPlan: AzureCePlan;
  originalPlan: AzureCePlan;
  source: string;
  inventory: AzureNetworkUpdateInventory;
  providerLockSha256: string;
  site: { siteUid: string; siteConfigurationSha256: string };
}
const same = (a: unknown, b: unknown) => canonicalSha256(a) === canonicalSha256(b);
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure Terraform network-bound replacement source: ${message}`);
}

/** Private read-only precursor after an explicitly completed network or replacement generation.
 * Public dispatch, repeated owning execution and current operational collection remain separate
 * contracts. Input inventory is collected against the explicit retained plan; neither its
 * collection timestamp nor historical acceptance establishes current operational freshness.
 */
export async function qualifyAzureTerraformNetworkBoundReplacementSource(
  request: AzureTerraformNetworkBoundReplacementInput,
  store: CeDeploymentStore,
  loaders: AzureTerraformNetworkHistoryLoaders,
  verifier: AzureTerraformNetworkAcceptanceVerifier,
  signal?: AbortSignal,
  replacementVerifier?: AzureTerraformNetworkReplacementCompletedVerifier,
  qualifiedPrevious?: AzureTerraformNetworkCompletedGeneration,
) {
  signal?.throwIfAborted();
  const input = structuredClone(request);
  const { plan, networkPlan: network, originalPlan: original } = input;
  for (const p of [plan, network, original]) verifyAzureCePlan(p);
  const profile = network.terraformNetworkReplacementProfile
    ? verifyAzureTerraformNetworkReplacementProfile(network)
    : verifyAzureTerraformNetworkProfile(network);
  const replacement = verifyAzureTerraformNetworkReplacementProfile(plan);
  require(replacement.originalPlanSha256 === original.planSha256 &&
    replacement.retainedPlanSha256 ===
      network.planSha256, 'exact bound original and immediate completed network predecessor required');
  require(plan.engine === 'terraform' &&
    plan.intent.engine === 'terraform' &&
    plan.intent.operation === 'replace-node' &&
    Number.isInteger(plan.intent.replacementNode) &&
    Number(plan.intent.replacementNode) >= 1 &&
    Number(plan.intent.replacementNode) <= plan.topology.nodeCount &&
    !plan.relayProfile &&
    !plan.networkProfile &&
    !plan.networkReplacementProfile &&
    !plan.terraformNetworkProfile &&
    original.engine === 'terraform' &&
    original.intent.operation === 'deploy' &&
    !original.relayProfile &&
    profile.originalPlanSha256 === original.planSha256 &&
    same(azureUpgradeBinding(plan), azureUpgradeBinding(original)) &&
    same(azureUpgradeBinding(network), azureUpgradeBinding(original)) &&
    same(azureTerraformNetworkScope(plan, true), azureTerraformNetworkScope(original, true)) &&
    same(azureTerraformNetworkScope(network, true), azureTerraformNetworkScope(original, true)) &&
    same(
      azureTerraformNetworkScope(plan, false),
      azureTerraformNetworkScope(network, false),
    ), 'exact selected Terraform replacement, original and retained network scope required');
  const history =
    qualifiedPrevious ??
    (
      await runAzureTerraformNetworkGenerationHistory(
        network,
        store,
        loaders,
        verifier,
        readAzureTerraformNetworkCompletionOne,
        undefined,
        signal,
        replacementVerifier,
      )
    ).completion;
  require(history && history.sourcePlanSha256 === network.planSha256, 'exact completed immediate predecessor required');
  const inventory = network.terraformNetworkReplacementProfile
    ? validateAzureTerraformReplacementPredecessorInventory(network, input.inventory, history)
    : validateAzureNetworkUpdateInventory(network, input.inventory);
  require(history.originalPlanSha256 === original.planSha256 &&
    input.source === history.finalSource &&
    createHash('sha256').update(input.source).digest('hex') === history.finalConfigurationSha256 &&
    input.providerLockSha256 === AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256 &&
    input.providerLockSha256 === history.sourceQualification.providerLockSha256 &&
    same(
      input.site,
      azureTerraformCompletedGenerationSite(history),
    ), 'exact private network source, provider lock and owned site required');
  const identities = (
    nodes: AzureNetworkUpdateInventory['nodes'] | ReturnType<typeof azureTerraformCompletedGenerationNodes>,
  ) =>
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
    identities(inventory.nodes),
    identities(azureTerraformCompletedGenerationNodes(history)),
  ), 'complete retained VM UUID/owner and NIC/MAC/IP-configuration/subnet identity required');
  const node = String(plan.intent.replacementNode);
  const selected = plan.actions.filter((action) => action.kind === 'vm-delete');
  require(selected.length === 1 &&
    selected[0].node === Number(node) &&
    selected[0].resourceId?.toLowerCase() === inventory.nodes[node].resourceId.toLowerCase() &&
    selected[0].expectedOwnerPlanSha256 ===
      inventory.nodes[node].ownerPlanSha256, 'one exact retained selected VM delete boundary required');
  signal?.throwIfAborted();
  require(same(input, request), 'requested source identity changed during historical qualification');
  return {
    schemaVersion: 1 as const,
    kind: 'azure-terraform-network-bound-replacement-source' as const,
    planSha256: plan.planSha256,
    originalPlanSha256: original.planSha256,
    retainedNetworkPlanSha256: network.planSha256,
    sourceConfigurationSha256: history.finalConfigurationSha256,
    providerLockSha256: input.providerLockSha256,
    ...azureTerraformCompletedGenerationSite(history),
    selectedNode: Number(node),
    retainedInventorySha256: canonicalSha256(inventory),
    networkHistory: [
      ...(history.sourceQualification.networkHistory ?? []),
      azureTerraformCompletedGenerationLink(history),
    ],
    currentOperationalAcceptanceQualified: false as const,
  };
}
