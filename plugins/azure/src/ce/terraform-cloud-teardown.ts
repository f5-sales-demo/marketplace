import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { PlanReceipt } from '../../../terraform/src/runner';
import type { TerraformSession } from '../../../terraform/src/service';
import type { AzExecApi } from '../az/exec';
import { verifyAzureCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import {
  observeAzureTerraformDestroyBoundary,
  verifyAzureTerraformDestroyOwnership,
} from './terraform-destroy-ownership';
import type { AzureCePlan } from './types';

async function optional(storage: CeDeploymentStore, name: string): Promise<unknown> {
  try {
    return await storage.read(name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

export async function runAzureTerraformCloudTeardown(
  plan: AzureCePlan,
  session: TerraformSession,
  storage: CeDeploymentStore,
  api: AzExecApi,
  env: Record<string, string | undefined>,
  signal?: AbortSignal,
) {
  verifyAzureCePlan(plan);
  if (plan.engine !== 'terraform' || plan.intent.operation !== 'deploy')
    throw new Error('Azure Terraform teardown requires the original Terraform deployment plan');
  await storage.verify();
  const name = 'azure-terraform-cloud-destroy-plan.json';
  let receipt = (await optional(storage, name)) as PlanReceipt | undefined;
  if (!receipt) {
    receipt = await session.planDestroy(env, signal);
    await verifyAzureTerraformDestroyOwnership(plan, receipt, session, api, env, signal);
    await storage.write(name, receipt);
  }
  if (!receipt.noChanges) {
    try {
      await session.apply(receipt, env, signal);
    } catch {
      const evidence = await observeAzureTerraformDestroyBoundary(plan, api, signal);
      await storage.write('azure-terraform-cloud-destroy-reconciliation.json', evidence);
      await session.reconcileApplyFromEvidence(receipt, canonicalSha256(evidence));
      if (evidence.status !== 'absent') {
        receipt = await session.planDestroy(env, signal);
        await verifyAzureTerraformDestroyOwnership(plan, receipt, session, api, env, signal);
        await storage.write(name, receipt);
        if (!receipt.noChanges) await session.apply(receipt, env, signal);
      }
    }
  }
  const final = await session.planDestroy(env, signal);
  if (
    final.engine !== 'terraform' ||
    final.operation !== 'destroy' ||
    final.deploymentId !== plan.deploymentName ||
    final.backendIdentity !== `local:${plan.deploymentName}` ||
    !final.noChanges ||
    final.changes.length
  )
    throw new Error('Azure Terraform cloud teardown did not converge to no changes');
  await storage.write('azure-terraform-cloud-destroy-final.json', final);
  return {
    status: 'terraform-cloud-retired' as const,
    sourcePlanSha256: plan.planSha256,
    finalPlanSha256: final.planSha256,
  };
}
