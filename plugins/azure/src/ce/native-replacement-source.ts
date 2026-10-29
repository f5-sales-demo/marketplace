import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { verifyAzureCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import { type NativeWorkflowCheckpoint, validateAzureNativeAdmissionCheckpoint } from './native-workflow';
import type { AzureRelayRetainedNic } from './relay-replacement-identity';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

const require = (condition: unknown, message: string): void => {
  if (!condition) throw Error(`Azure native replacement source: ${message}`);
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

/** Exact original creation, independent of the mutable VM generation owners. */
export function verifyAzureNativeReplacementOriginalSource(plan: AzureCePlan, original: AzureCePlan): void {
  verifyAzureCePlan(plan);
  verifyAzureCePlan(original);
  require(plan.engine === 'native' &&
    !plan.relayProfile &&
    plan.intent.operation === 'replace-node' &&
    original.engine === 'native' &&
    !original.relayProfile &&
    original.intent.operation === 'deploy' &&
    same(azureUpgradeBinding(plan), azureUpgradeBinding(original)) &&
    same(scope(plan), scope(original)), 'original creation scope differs');
}

/** Resolve every VM owner through saved creation or completed registration generation, including survivor history. */
export async function qualifyAzureNativeReplacementOriginalSource(
  plan: AzureCePlan,
  oldVmIds: Record<string, string>,
  owners: Record<string, string>,
  siteUid: string,
  storage: Pick<CeDeploymentStore, 'read' | 'verify'>,
): Promise<{ original: AzureCePlan; retainedNics?: Record<string, AzureRelayRetainedNic> }> {
  await storage.verify();
  const nodes = azureUpgradeBinding(plan).nodes;
  require(same(Object.keys(oldVmIds).sort(), nodes.toSorted()) &&
    same(Object.keys(owners).sort(), nodes.toSorted()), 'complete VM owner inventory differs');
  let original: AzureCePlan | undefined;
  let retained: unknown;
  const boundaries = new Map<string, string>();
  const visit = async (digest: string, node: string, vmId: string, path: Set<string>): Promise<void> => {
    require(/^[a-f0-9]{64}$/.test(digest) && !path.has(digest), 'recursive or unresolved generation owner');
    require(typeof vmId === 'string' &&
      /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(vmId), 'VM generation UUID is unavailable');
    const key = `${digest}:${node}`;
    require(!boundaries.has(key) ||
      boundaries.get(key) === vmId.toLowerCase(), 'survivor UUID differs across generation boundaries');
    boundaries.set(key, vmId.toLowerCase());
    const source = (await storage.read(`native-source-${digest}.json`)) as AzureCePlan;
    verifyAzureCePlan(source);
    require(source.planSha256 === digest &&
      source.engine === 'native' &&
      !source.relayProfile &&
      same(scope(source), scope(plan)), 'generation source differs');
    const checkpoint = (await storage.read(`native-admission-${digest}.json`)) as NativeWorkflowCheckpoint;
    validateAzureNativeAdmissionCheckpoint(source, checkpoint);
    const candidate = source.intent.operation === 'deploy' ? source : checkpoint.replacement?.originalSourcePlan;
    require(candidate, 'original creation is unresolved');
    verifyAzureNativeReplacementOriginalSource(plan, candidate as AzureCePlan);
    const saved = await storage.read(`native-source-${(candidate as AzureCePlan).planSha256}.json`);
    require(same(saved, candidate) &&
      (!original || same(original, candidate)), 'original saved creation differs across VM generations');
    original = candidate as AzureCePlan;
    if (source.intent.operation === 'deploy') {
      require(checkpoint.siteReserved &&
        nodes.every((name) => {
          const index = String(nodes.indexOf(name) + 1);
          return checkpoint.bootstrapByNode[index] && checkpoint.launchedAtByNode[index];
        }), 'original native creation admission is incomplete');
      return;
    }
    const prior = checkpoint.replacement;
    require(source.intent.operation === 'replace-node' &&
      prior?.status === 'registered' &&
      prior.siteUid === siteUid &&
      source.intent.replacementNode === nodes.indexOf(node) + 1 &&
      prior.newVmId?.toLowerCase() === vmId.toLowerCase(), 'prior generation registration or VM identity differs');
    require(retained === undefined ||
      same(retained, prior?.retainedNics), 'prior generation retained interface identities differ');
    retained = prior?.retainedNics;
    const next = new Set([...path, digest]);
    for (const name of nodes)
      await visit(prior?.ownerPlanSha256ByNode[name] as string, name, prior?.oldVmIds[name] as string, next);
  };
  for (const node of nodes) await visit(owners[node], node, oldVmIds[node], new Set());
  require(original, 'original creation is unavailable');
  return {
    original: original as AzureCePlan,
    ...(retained !== undefined ? { retainedNics: retained as Record<string, AzureRelayRetainedNic> } : {}),
  };
}

/** Public execution checkpoint acceptance is separate from local identity preparation. */
export async function requireAzureNativePriorGenerationExecution(
  checkpoint: NativeWorkflowCheckpoint,
  storage: Pick<CeDeploymentStore, 'read'>,
  load: (source: AzureCePlan) => Promise<{ state: string } | null | undefined>,
): Promise<void> {
  require(checkpoint.replacement?.originalSourcePlan, 'original generation binding is missing');
  for (const digest of new Set(Object.values(checkpoint.replacement?.ownerPlanSha256ByNode ?? {}))) {
    const source = (await storage.read(`native-source-${digest}.json`)) as AzureCePlan;
    verifyAzureCePlan(source);
    require(source.planSha256 === digest &&
      (await load(source))?.state === 'complete', 'prior generation public execution is incomplete');
  }
}
