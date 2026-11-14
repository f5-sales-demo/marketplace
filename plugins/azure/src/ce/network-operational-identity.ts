import type { ExpectedCeInterface } from '../../../platform/src/ce/interface-evidence';
import type { AzExecApi } from '../az/exec';
import { verifyAzureCePlan } from './artifacts';
import { canonicalEqual, canonicalSha256 } from './canonical';
import { captureAzureNetworkUpdateInventory, validateAzureNetworkUpdateInventory } from './network-update';
import {
  type AzureOperationalIdentityRuntime,
  collectAzureOperationalIdentityJoins,
} from './operational-identity-joins';
import type { AzureTerraformNetworkAcceptanceIdentity } from './terraform-network-checkpoint';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

type Runtime = AzureOperationalIdentityRuntime;
const same = canonicalEqual;
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure network operational identity: ${message}`);
}
const sha = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);

/** Read-only cloud/configuration/registration/physical-interface joins for the serial observer.
 * This component preserves explicit interface state. Registration and observed link publication
 * alone do not establish per-node operational health, original sample freshness, routing or traffic.
 */
export async function collectAzureNetworkOperationalIdentity(
  source: AzureCePlan,
  expected: AzureTerraformNetworkAcceptanceIdentity,
  runtime: Runtime,
  api: AzExecApi,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const plan = structuredClone(source),
    identity = structuredClone(expected);
  verifyAzureCePlan(plan);
  validateAzureNetworkUpdateInventory(plan, identity.inventory);
  const binding = azureUpgradeBinding(plan);
  require(plan.engine === 'terraform' &&
    plan.intent.operation === 'update-network' &&
    runtime.engine === plan.engine &&
    same(identity.owner, binding.owner) &&
    identity.planSha256 === plan.planSha256 &&
    identity.siteName === plan.siteName &&
    typeof identity.siteUid === 'string' &&
    identity.siteUid.trim() &&
    Number.isInteger(identity.node) &&
    identity.node >= 1 &&
    identity.node <= plan.topology.nodeCount &&
    sha(identity.configurationSha256) &&
    sha(identity.siteConfigurationSha256), 'owning resolved node/site identity required');
  const instances: Record<string, string> = {},
    interfaces: ExpectedCeInterface[] = [];
  for (const [node, vm] of Object.entries(identity.inventory.nodes)) {
    const name = `${plan.deploymentName}-${node}`;
    instances[name] = vm.vmId;
    for (const [index, nic] of Object.entries(vm.nics)) {
      const role = plan.nics.find((n) => n.index === Number(index))?.role;
      require(role === 'slo' || role === 'data' || role === 'sli', 'complete configured interface role scope required');
      interfaces.push({ node: name, role, mac: nic.mac });
    }
  }
  const base = {
    schemaVersion: 1,
    scope: 'node-registration-interface-identity' as const,
    owner: identity.owner,
    planSha256: identity.planSha256,
    node: identity.node,
    siteName: identity.siteName,
    siteUid: identity.siteUid,
    siteConfigurationSha256: identity.siteConfigurationSha256,
    configurationSha256: identity.configurationSha256,
    expectedInventorySha256: canonicalSha256(identity.inventory.nodes),
    collectedAt: new Date().toISOString(),
    operationalAcceptance: 'unknown' as const,
    nodeHealth: 'unknown' as const,
    freshness: 'unqualified' as const,
    routing: 'unknown' as const,
    traffic: 'unknown' as const,
  };
  return collectAzureOperationalIdentityJoins(
    base,
    binding,
    identity,
    instances,
    interfaces,
    runtime,
    async (deadline) => {
      const inventory = await captureAzureNetworkUpdateInventory(plan, api, deadline);
      require(same(inventory.nodes, identity.inventory.nodes), 'current cloud identity differs');
      return canonicalSha256(inventory.nodes);
    },
    signal,
  );
}
