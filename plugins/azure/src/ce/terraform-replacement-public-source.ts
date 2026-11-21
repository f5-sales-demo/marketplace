import { createHash } from 'node:crypto';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { verifyAzureCePlan } from './artifacts';
import { renderAzureTerraformFoundation } from './terraform-foundation';
import {
  type ReplacementCheckpoint,
  validateAzureTerraformReplacementCheckpoint,
  validateAzureTerraformReplacementStageHistory,
} from './terraform-replacement';
import { verifyAzureTerraformNonRelayConfiguration } from './terraform-replacement-artifact-provenance';
import { verifyAzureTerraformReplacementGenerationOwners } from './terraform-replacement-generations';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

type State = Pick<
  ReplacementCheckpoint,
  'oldVmIds' | 'ownerPlanSha256ByNode' | 'retainedNics' | 'siteUid' | 'siteConfigurationSha256'
>;
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Azure Terraform public source record is malformed');
  return value as Record<string, unknown>;
};
const require = (condition: unknown, message: string) => {
  if (!condition) throw Error(`Azure Terraform public source: ${message}`);
};

/** Resolve complete owned public generations before new enrollment or any replacement stage execution. */
export async function qualifyAzureTerraformReplacementPublicSource(
  plan: AzureCePlan,
  source: string,
  current: State,
  store: Pick<CeDeploymentStore, 'read' | 'verify'>,
  loadSource: (digest: string) => Promise<AzureCePlan>,
  loadOutcome: (source: AzureCePlan) => Promise<Record<string, unknown>>,
  providerLockSha256: string,
): Promise<void> {
  require(!plan.terraformNetworkReplacementProfile, 'network-bound replacement requires its dedicated owning source contract');
  await store.verify();
  const workflow = object(await store.read('terraform-workflow.json'));
  require(workflow.schemaVersion === 1 &&
    workflow.engine === 'terraform' &&
    workflow.stage === 'registered' &&
    typeof workflow.planSha256 === 'string' &&
    /^[a-f0-9]{64}$/.test(workflow.planSha256), 'original creation admission is incomplete');
  const original = await loadSource(workflow.planSha256 as string);
  verifyAzureCePlan(original);
  require(original.planSha256 === workflow.planSha256, 'original creation digest differs');
  const bootstraps = object(workflow.bootstrapByNode),
    launches = object(workflow.launchedAtByNode);
  require(azureUpgradeBinding(original).nodes.every(
    (_, i) =>
      typeof bootstraps[String(i + 1)] === 'string' &&
      typeof launches[String(i + 1)] === 'string' &&
      Number.isFinite(Date.parse(launches[String(i + 1)] as string)),
  ), 'original bootstrap or launch boundaries are incomplete');
  require(workflow.configurationSha256 ===
    createHash('sha256')
      .update(renderAzureTerraformFoundation(original, bootstraps as Record<string, string>))
      .digest('hex'), 'original admitted configuration digest differs');
  const sources = new Map<string, AzureCePlan>([[original.planSha256, original]]);
  const checkpoints = new Map<string, ReplacementCheckpoint>();
  const bootstrapMaterials = new Map<string, string>(
    Object.entries(bootstraps).map(([node, material]) => [`${original.planSha256}:${node}`, material as string]),
  );
  const outcome = async (owner: AzureCePlan, cp?: ReplacementCheckpoint) => {
    const row = await loadOutcome(owner);
    require(row.planSha256 === owner.planSha256 &&
      row.planId === owner.planId &&
      row.engine === 'terraform' &&
      object(row.configuration).status === 'configured' &&
      (cp
        ? row.status === 'complete' &&
          object(row.health).status === 'healthy' &&
          row.replacedNode === cp.node &&
          row.oldVmId === cp.oldVmIds[`${owner.deploymentName}-${cp.node}`] &&
          row.newVmId === cp.newVmId &&
          row.siteUid === cp.siteUid &&
          row.terraformNoChanges === true
        : ['registered', 'accepted'].includes(String(row.status)) && object(row.registrations).status === 'healthy') &&
      (owner.routing.mode !== 'route-server' || row.routing === 'healthy') &&
      (owner.intent.ingress?.mode !== 'platform-http' ||
        (object(row.traffic).status === 'healthy' &&
          row.terraformNoChanges === true)), 'prior generation public execution is incomplete');
  };
  await outcome(original);
  const visit = async (digest: string) => {
    if (sources.has(digest)) return;
    const owner = await loadSource(digest);
    verifyAzureCePlan(owner);
    require(owner.planSha256 === digest, 'generation source digest differs');
    sources.set(digest, owner);
    const cp = validateAzureTerraformReplacementCheckpoint(
      owner,
      await store.read(`${owner.planId}-terraform-replacement.json`),
    );
    require(cp.phase === 'complete', 'predecessor execution is incomplete');
    checkpoints.set(digest, cp);
    const history = new Map<string, unknown>();
    for (const suffix of ['quiesce-plan', 'launch-plan', 'replacement-final-plan']) {
      const name = `${owner.planId}-terraform-${suffix}.json`;
      history.set(name, await store.read(name));
    }
    const snapshot = object(await store.read(`${owner.planId}-terraform-replacement-source.json`));
    validateAzureTerraformReplacementStageHistory(owner, cp, snapshot, history, providerLockSha256);
    bootstrapMaterials.set(`${digest}:${cp.node}`, snapshot.bootstrap as string);
    await outcome(owner, cp);
    for (const prior of new Set(Object.values(cp.ownerPlanSha256ByNode))) await visit(prior);
  };
  for (const digest of new Set(Object.values(current.ownerPlanSha256ByNode))) await visit(digest);
  verifyAzureTerraformReplacementGenerationOwners(plan, current, original, sources, checkpoints);
  let configuration: Record<string, unknown>;
  try {
    configuration = object(JSON.parse(source));
  } catch {
    throw Error('Azure Terraform retained source is malformed');
  }
  verifyAzureTerraformNonRelayConfiguration(original, current, configuration);
  const instances = object(object(configuration.resource).azurerm_linux_virtual_machine);
  for (const [index, node] of azureUpgradeBinding(original).nodes.entries()) {
    const encoded = object(instances[`node_${index + 1}`]).custom_data;
    require(typeof encoded === 'string' &&
      Buffer.from(encoded, 'base64').toString('utf8') ===
        bootstrapMaterials.get(
          `${current.ownerPlanSha256ByNode[node]}:${index + 1}`,
        ), 'retained bootstrap differs from its owning generation');
  }
}
