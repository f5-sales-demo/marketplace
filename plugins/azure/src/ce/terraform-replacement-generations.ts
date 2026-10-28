import { verifyAzureCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import { validAzureRetainedNicsForSource } from './relay-replacement-identity';
import { type ReplacementCheckpoint, validateAzureTerraformReplacementCheckpoint } from './terraform-replacement';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

const require = (condition: unknown, message: string): void => {
  if (!condition) throw Error(`Azure Terraform generation provenance: ${message}`);
};
const same = (a: unknown, b: unknown) => canonicalSha256(a) === canonicalSha256(b);
const scope = (plan: AzureCePlan) => {
  const { operation: _operation, replacementNode: _node, ...intent } = plan.intent;
  const { termsAccepted: _terms, ...image } = plan.image;
  return {
    intent,
    image,
    subscription: plan.subscription,
    topology: plan.topology,
    nics: plan.nics,
    vm: plan.vm,
    routing: plan.routing,
    egress: plan.egress,
    workloadProfile: plan.workloadProfile ?? null,
  };
};

/** Identity provenance only; public completion, saved runner stage proofs and fresh live evidence are separate gates. */
export function verifyAzureTerraformReplacementGenerationOwners(
  plan: AzureCePlan,
  current: Pick<
    ReplacementCheckpoint,
    'oldVmIds' | 'ownerPlanSha256ByNode' | 'retainedNics' | 'siteUid' | 'siteConfigurationSha256'
  >,
  original: AzureCePlan,
  sources: Map<string, AzureCePlan>,
  checkpoints: Map<string, ReplacementCheckpoint>,
): void {
  verifyAzureCePlan(plan);
  verifyAzureCePlan(original);
  require(plan.engine === 'terraform' &&
    !plan.relayProfile &&
    plan.intent.operation === 'replace-node' &&
    original.engine === 'terraform' &&
    !original.relayProfile &&
    original.intent.operation === 'deploy' &&
    same(azureUpgradeBinding(plan), azureUpgradeBinding(original)) &&
    same(scope(plan), scope(original)) &&
    same(sources.get(original.planSha256), original), 'exact original creation differs');
  const nodes = azureUpgradeBinding(original).nodes;
  const boundaries = new Map<string, string>();
  const validateInventory = (state: typeof current) => {
    require(same(Object.keys(state.oldVmIds).sort(), nodes.toSorted()) &&
      same(Object.keys(state.ownerPlanSha256ByNode).sort(), nodes.toSorted()) &&
      Object.values(state.oldVmIds).every((id) => /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) &&
      new Set(Object.values(state.oldVmIds).map((id) => id.toLowerCase())).size === nodes.length &&
      validAzureRetainedNicsForSource(original, state.retainedNics) &&
      same(state.retainedNics, current.retainedNics) &&
      state.siteUid === current.siteUid &&
      state.siteConfigurationSha256 ===
        current.siteConfigurationSha256, 'complete original interface, logical site or UUID inventory differs');
  };
  validateInventory(current);
  const visit = (owner: string, node: string, vmId: string, path: Set<string>) => {
    require(!path.has(owner), 'recursive generation owner');
    const boundary = `${owner}:${node}`;
    const normalized = vmId.toLowerCase();
    require(!boundaries.has(boundary) ||
      boundaries.get(boundary) === normalized, 'survivor UUID differs across generation boundaries');
    boundaries.set(boundary, normalized);
    const source = sources.get(owner);
    require(source, 'generation source is unresolved');
    verifyAzureCePlan(source as AzureCePlan);
    require(source?.planSha256 === owner &&
      source.engine === 'terraform' &&
      !source.relayProfile &&
      same(azureUpgradeBinding(source), azureUpgradeBinding(original)) &&
      same(scope(source), scope(original)), 'generation source scope differs');
    if (owner === original.planSha256) return;
    require(source?.intent.operation === 'replace-node' &&
      source.intent.replacementNode === nodes.indexOf(node) + 1, 'generation owns a different selected node');
    const prior = validateAzureTerraformReplacementCheckpoint(source as AzureCePlan, checkpoints.get(owner));
    require(prior.phase === 'complete' &&
      prior.newVmId?.toLowerCase() === normalized, 'predecessor completion or selected UUID differs');
    validateInventory(prior);
    const next = new Set([...path, owner]);
    for (const retainedNode of nodes)
      visit(prior.ownerPlanSha256ByNode[retainedNode], retainedNode, prior.oldVmIds[retainedNode], next);
  };
  for (const node of nodes)
    visit(current.ownerPlanSha256ByNode[node], node, current.oldVmIds[node], new Set([plan.planSha256]));
}
