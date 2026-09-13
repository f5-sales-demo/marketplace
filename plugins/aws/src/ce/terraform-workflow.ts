import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { CeTerraformService, TerraformSession } from '../../../terraform/src/service';
import type { AwsExecApi } from '../aws/exec';
import { verifyAwsCePlan } from './artifacts';
import { admitAwsTerraformSites } from './terraform-admission';
import { awsTerraformFoundationDeployment } from './terraform-foundation';
import type { AwsCePlan } from './types';

interface WorkflowCheckpoint {
  schemaVersion: 1;
  engine: 'terraform';
  planSha256: string;
  stage: 'network-pending' | 'registration-pending' | 'registered';
}

/** Called within an authorized deployment workflow. Routing and traffic remain subsequent stages. */
export async function runAwsTerraformAdmission(
  plan: AwsCePlan,
  terraform: CeTerraformService,
  runtime: Parameters<typeof admitAwsTerraformSites>[2],
  storage: Pick<CeDeploymentStore, 'read' | 'write' | 'verify'>,
  api: AwsExecApi,
  revalidate: () => Promise<void>,
  env: Record<string, string | undefined>,
  signal?: AbortSignal,
) {
  verifyAwsCePlan(plan);
  const deployment = await awsTerraformFoundationDeployment(plan);
  const owner = {
    deploymentId: plan.deploymentName,
    engine: 'terraform' as const,
    provider: 'aws' as const,
    account: plan.accountId,
    region: plan.region,
  };
  await storage.verify();
  let checkpoint: WorkflowCheckpoint;
  try {
    checkpoint = (await storage.read('terraform-workflow.json')) as WorkflowCheckpoint;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    checkpoint = { schemaVersion: 1, engine: 'terraform', planSha256: plan.planSha256, stage: 'network-pending' };
    await storage.write('terraform-workflow.json', checkpoint);
  }
  if (
    checkpoint.schemaVersion !== 1 ||
    checkpoint.engine !== 'terraform' ||
    checkpoint.planSha256 !== plan.planSha256 ||
    !['network-pending', 'registration-pending', 'registered'].includes(checkpoint.stage)
  )
    throw new Error('Terraform workflow checkpoint differs from the owning plan');
  signal?.throwIfAborted();
  let session: TerraformSession;
  if (checkpoint.stage === 'network-pending') {
    try {
      session = await terraform.open(owner, deployment, false);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      session = await terraform.open(owner, deployment, 'current');
    }
    await revalidate();
    const receipt = await session.plan(env, signal);
    if (
      receipt.changes.some((change) => change.actions.some((action) => !['create', 'read', 'no-op'].includes(action)))
    )
      throw new Error('Terraform foundation would mutate existing resources; lifecycle reconciliation required');
    await storage.write('terraform-foundation-plan.json', receipt);
    await storage.verify();
    await revalidate();
    await session.apply(receipt, env, signal);
    checkpoint.stage = 'registration-pending';
    await storage.write('terraform-workflow.json', checkpoint);
  } else session = await terraform.open(owner, deployment, 'current');
  await revalidate();
  const admission = await admitAwsTerraformSites(plan, session, runtime, storage, api, env, signal);
  checkpoint.stage = admission.status === 'registered' ? 'registered' : 'registration-pending';
  await storage.write('terraform-workflow.json', checkpoint);
  return { planId: plan.planId, planSha256: plan.planSha256, engine: 'terraform' as const, ...admission };
}
