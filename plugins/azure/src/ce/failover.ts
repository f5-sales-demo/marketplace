import type { CeOwner } from '../../../platform/src/ce/runtime';
import type { AzExecApi } from '../az/exec';
import { verifyAzureCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import type { AzureCePlan } from './types';

const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed Azure failover evidence');
  return value as Record<string, unknown>;
};
const lower = (value: unknown) => (typeof value === 'string' ? value.toLowerCase() : '');
const uuid = (value: unknown) =>
  typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);

export interface AzureCeFailoverPlan {
  schemaVersion: 1;
  engine: 'native' | 'terraform';
  kind: 'azure-ce-failover';
  sourcePlanSha256: string;
  nodeIndex: number;
  vmResourceId: string;
  vmId: string;
  planId: string;
  planSha256: string;
}

export interface AzureCeFailoverPreparationEvidence {
  schemaVersion: 1;
  source: 'azure-cli-live';
  subscriptionId: string;
  region: string;
  engine: 'native' | 'terraform';
  deploymentId: string;
  sourcePlanSha256: string;
  nodeIndex: number;
  vmResourceId: string;
  vmId: string;
  powerState: 'running';
  observedAt: string;
}

export function azureFailoverOwner(plan: AzureCePlan): CeOwner {
  verifyAzureCePlan(plan);
  return {
    deploymentId: plan.deploymentName,
    engine: plan.engine,
    provider: 'azure',
    account: plan.subscription.id,
    region: plan.region,
  };
}

function plannedVm(plan: AzureCePlan, nodeIndex: number): string {
  if (!Number.isInteger(nodeIndex) || nodeIndex < 1 || nodeIndex > plan.topology.nodeCount)
    throw new Error('Azure failover requires an exact planned node index');
  const matches = plan.actions.filter((action) => action.kind === 'vm-create' && action.node === nodeIndex);
  if (matches.length !== 1 || typeof matches[0].resourceId !== 'string')
    throw new Error('Azure failover VM resource identity is unavailable');
  return matches[0].resourceId;
}

export async function observeAzureFailoverVm(
  plan: AzureCePlan,
  nodeIndex: number,
  api: AzExecApi,
  signal?: AbortSignal,
): Promise<AzureCeFailoverPreparationEvidence> {
  verifyAzureCePlan(plan);
  signal?.throwIfAborted();
  const run = async (args: string[]) => {
    const result = await api.exec('az', [...args, '--subscription', plan.subscription.id, '--output', 'json'], {
      signal,
    });
    signal?.throwIfAborted();
    if (result.exitCode !== 0) throw new Error('Azure failover identity observation unavailable');
    let value: Record<string, unknown>;
    try {
      value = object(JSON.parse(result.stdout));
    } catch {
      throw new Error('Malformed Azure failover identity observation');
    }
    if (!Object.keys(value).length || value.nextLink) throw new Error('Incomplete Azure failover identity observation');
    return value;
  };
  const account = await run(['account', 'show']);
  if (
    lower(account.id) !== lower(plan.subscription.id) ||
    lower(account.tenantId) !== lower(plan.subscription.tenantId) ||
    account.environmentName !== plan.subscription.cloud ||
    account.state !== 'Enabled'
  )
    throw new Error('Azure failover account observation differs from deployment');
  const vmResourceId = plannedVm(plan, nodeIndex);
  const expectedScope = `/subscriptions/${plan.subscription.id}/resourcegroups/${plan.intent.resourceGroup}/providers/microsoft.compute/virtualmachines/`;
  if (!lower(vmResourceId).startsWith(expectedScope.toLowerCase()))
    throw new Error('Azure failover VM is outside the deployment scope');
  const vm = await run(['vm', 'show', '--ids', vmResourceId, '--show-details']);
  const tags = object(vm.tags);
  const power = lower(vm.powerState).replace(/^vm\s+/, '');
  if (
    lower(vm.id) !== lower(vmResourceId) ||
    lower(vm.location) !== lower(plan.region) ||
    vm.provisioningState !== 'Succeeded' ||
    !uuid(vm.vmId) ||
    power !== 'running' ||
    tags['xcsh-managed-by'] !== 'azure-ce' ||
    tags['xcsh-execution-engine'] !== plan.engine ||
    tags['xcsh-deployment-id'] !== plan.deploymentName ||
    tags['xcsh-plan-sha256'] !== plan.planSha256 ||
    tags['xcsh-node-index'] !== String(nodeIndex)
  )
    throw new Error('Azure failover VM identity, readiness, or ownership differs');
  return {
    schemaVersion: 1,
    source: 'azure-cli-live',
    subscriptionId: plan.subscription.id,
    region: plan.region,
    engine: plan.engine,
    deploymentId: plan.deploymentName,
    sourcePlanSha256: plan.planSha256,
    nodeIndex,
    vmResourceId,
    vmId: String(vm.vmId),
    powerState: 'running',
    observedAt: new Date().toISOString(),
  };
}

export function buildAzureCeFailoverPlan(
  base: AzureCePlan,
  evidence: AzureCeFailoverPreparationEvidence,
): AzureCeFailoverPlan {
  verifyAzureCePlan(base);
  const vmResourceId = plannedVm(base, evidence.nodeIndex);
  if (
    base.routing.mode !== 'route-server' ||
    evidence.schemaVersion !== 1 ||
    evidence.source !== 'azure-cli-live' ||
    evidence.subscriptionId !== base.subscription.id ||
    evidence.region !== base.region ||
    evidence.engine !== base.engine ||
    evidence.deploymentId !== base.deploymentName ||
    evidence.sourcePlanSha256 !== base.planSha256 ||
    lower(evidence.vmResourceId) !== lower(vmResourceId) ||
    !uuid(evidence.vmId) ||
    evidence.powerState !== 'running' ||
    !Number.isFinite(Date.parse(evidence.observedAt))
  )
    throw new Error('Azure failover preparation evidence differs from the owning deployment');
  const draft = {
    schemaVersion: 1 as const,
    engine: base.engine,
    kind: 'azure-ce-failover' as const,
    sourcePlanSha256: base.planSha256,
    nodeIndex: evidence.nodeIndex,
    vmResourceId,
    vmId: evidence.vmId,
  };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planId: `azure-ce-failover-${planSha256.slice(0, 24)}`, planSha256 };
}

export function verifyAzureCeFailoverPlan(base: AzureCePlan, failover: AzureCeFailoverPlan): void {
  const evidence: AzureCeFailoverPreparationEvidence = {
    schemaVersion: 1,
    source: 'azure-cli-live',
    subscriptionId: base.subscription.id,
    region: base.region,
    engine: base.engine,
    deploymentId: base.deploymentName,
    sourcePlanSha256: base.planSha256,
    nodeIndex: failover.nodeIndex,
    vmResourceId: failover.vmResourceId,
    vmId: failover.vmId,
    powerState: 'running',
    observedAt: new Date(0).toISOString(),
  };
  const expected = buildAzureCeFailoverPlan(base, evidence);
  if (canonicalSha256(expected) !== canonicalSha256(failover)) throw new Error('Saved Azure CE failover plan changed');
}

export function requireAzureFailoverExecutionContract(base: AzureCePlan, failover: AzureCeFailoverPlan): never {
  verifyAzureCeFailoverPlan(base, failover);
  throw new Error(
    'Azure failover apply requires a verified platform SLO BGP mapping, collected per-Route-Server-session convergence, effective-route evidence, and traffic proof',
  );
}
