import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { TerraformSession } from '../../../terraform/src/service';
import { siteForNode } from './topology';
import type { AwsCeCheckpoint, AwsCePlan } from './types';

/** Read workflow progress separately from live health; never export admission bootstrap material. */
export async function readAwsTerraformWorkflowStatus(
  plan: AwsCePlan,
  storage: Pick<CeDeploymentStore, 'read' | 'verify'>,
) {
  if (plan.engine !== 'terraform') throw new Error('Terraform status requires the owning engine');
  await storage.verify();
  let raw: unknown;
  try {
    raw = await storage.read('terraform-workflow.json');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return { progress: { state: 'not-started', engine: 'terraform', source: 'terraform-workflow.json' } };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Malformed Terraform workflow');
  const record = raw as Record<string, unknown>;
  if (
    record.schemaVersion !== 1 ||
    record.engine !== 'terraform' ||
    record.planSha256 !== plan.planSha256 ||
    !['network-pending', 'registration-pending', 'registered'].includes(String(record.stage))
  )
    throw new Error('Terraform workflow identity differs from the owning plan');
  let routing: AwsCeCheckpoint | undefined;
  try {
    const value = (await storage.read('terraform-routing-checkpoint.json')) as AwsCeCheckpoint;
    if (
      !value ||
      value.schemaVersion !== plan.schemaVersion ||
      value.engine !== 'terraform' ||
      value.planId !== plan.planId ||
      value.planSha256 !== plan.planSha256 ||
      !['running', 'partial', 'complete'].includes(value.state) ||
      !Array.isArray(value.completedActionIds) ||
      !value.completedActionIds.every((id) => typeof id === 'string') ||
      !value.resolvedValues ||
      typeof value.resolvedValues !== 'object' ||
      Array.isArray(value.resolvedValues) ||
      !Object.values(value.resolvedValues).every((value) => typeof value === 'string')
    )
      throw new Error('Terraform routing checkpoint identity differs');
    routing = value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  return {
    progress: {
      state: String(record.stage),
      engine: 'terraform',
      source: 'terraform-workflow.json',
      planSha256: plan.planSha256,
    },
    routing,
  };
}

/** Current outputs and state must agree; cloud inventory independently verifies these locators. */
export async function readAwsTerraformInstanceBindings(
  plan: AwsCePlan,
  session: Pick<TerraformSession, 'readOutputs' | 'readResourceIdentities'>,
  env: Record<string, string | undefined>,
  signal?: AbortSignal,
): Promise<Record<string, string>> {
  if (plan.engine !== 'terraform' || !session.readResourceIdentities)
    throw new Error('Current instance identities require the owning Terraform reader');
  signal?.throwIfAborted();
  const outputs = await session.readOutputs(['ce_instances'], env, signal);
  const instances = outputs.ce_instances;
  const identities = (await session.readResourceIdentities(env, signal)).filter((row) => row.type === 'aws_instance');
  if (
    !instances ||
    typeof instances !== 'object' ||
    Array.isArray(instances) ||
    Object.keys(instances).length !== plan.topology.nodeCount ||
    identities.length !== plan.topology.nodeCount
  )
    throw new Error('Current Terraform instance evidence is incomplete');
  const bindings: Record<string, string> = {};
  const seen = new Set<string>();
  for (let node = 1; node <= plan.topology.nodeCount; node++) {
    const value = (instances as Record<string, unknown>)[String(node)];
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('Current Terraform instance output is malformed');
    const row = value as Record<string, unknown>;
    if (
      typeof row.id !== 'string' ||
      !/^i-[0-9a-f]{8,17}$/.test(row.id) ||
      seen.has(row.id) ||
      row.site_name !== siteForNode(plan.intent, node).name ||
      row.hostname !== `${plan.deploymentName}-${node}` ||
      identities.filter((identity) => identity.address === `aws_instance.node_${node}` && identity.id === row.id)
        .length !== 1
    )
      throw new Error('Current Terraform instance output and state identities differ');
    seen.add(row.id);
    bindings[`__INSTANCE_${node}__`] = row.id;
  }
  return bindings;
}
