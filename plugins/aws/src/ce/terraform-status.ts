import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
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
