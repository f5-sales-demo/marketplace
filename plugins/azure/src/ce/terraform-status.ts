import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { AzureCePlan } from './types';

/** Read the owning workflow journal without exporting bootstrap material. */
export async function readAzureTerraformWorkflowStatus(
  plan: AzureCePlan,
  storage: Pick<CeDeploymentStore, 'read' | 'verify'>,
) {
  if (plan.engine !== 'terraform') throw new Error('Terraform checkpoint requires the owning engine');
  await storage.verify();
  let value: unknown;
  try {
    value = await storage.read('terraform-workflow.json');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return { state: 'not-started', engine: 'terraform', source: 'terraform-workflow.json' };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed Terraform workflow');
  const record = value as Record<string, unknown>;
  if (
    record.schemaVersion !== 1 ||
    record.engine !== 'terraform' ||
    record.planSha256 !== plan.planSha256 ||
    typeof record.configurationSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(record.configurationSha256) ||
    !['network-pending', 'registration-pending', 'registered'].includes(String(record.stage))
  )
    throw new Error('Terraform workflow identity differs from the owning plan');
  return {
    state: String(record.stage),
    engine: 'terraform',
    source: 'terraform-workflow.json',
    planSha256: plan.planSha256,
    configurationSha256: record.configurationSha256,
  };
}
