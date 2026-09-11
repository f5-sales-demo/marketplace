import type { CePlatformService } from '../../../platform/src/ce/service';
import type { CeTerraformService } from '../../../terraform/src/service';
import type { AzExecApi } from '../az/exec';
import { assertApplyAllowed, assertObservationFresh } from './apply';
import { type AzureCeToolContext, loadPlanArtifact } from './artifacts';
import { discoverAzureCompute } from './discovery';
import { runAzureTerraformLifecycle } from './terraform-lifecycle';
import { azureUpgradeBinding } from './terraform-upgrade';
import { runAzureTerraformAdmission } from './terraform-workflow';

export async function readAzureTerraformAuthorization(
  storage: { read(name: string): Promise<unknown> },
  planSha256: string,
): Promise<{ authorized: boolean; name: string }> {
  const name = `terraform-authorization-${planSha256}.json`;
  let authorization: unknown;
  let scoped = true;
  try {
    authorization = await storage.read(name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    scoped = false;
    try {
      authorization = await storage.read('terraform-authorization.json');
    } catch (legacyError) {
      if ((legacyError as NodeJS.ErrnoException).code !== 'ENOENT') throw legacyError;
    }
  }
  const authorized = Boolean(
    authorization &&
      typeof authorization === 'object' &&
      (authorization as Record<string, unknown>).schemaVersion === 1 &&
      (authorization as Record<string, unknown>).engine === 'terraform' &&
      (authorization as Record<string, unknown>).planSha256 === planSha256 &&
      (authorization as Record<string, unknown>).mutations === true,
  );
  if (scoped && authorization !== undefined && !authorized)
    throw new Error('Azure Terraform authorization checkpoint differs from this plan or engine');
  return { authorized, name };
}

export async function executeAzureCeTerraformApply(
  input: { planId: string; planSha256: string },
  ctx: AzureCeToolContext,
  api: AzExecApi,
  platform: CePlatformService,
  terraform: CeTerraformService,
  signal?: AbortSignal,
) {
  if (Object.keys(input).some((key) => !['planId', 'planSha256'].includes(key)))
    throw new Error('Azure Terraform apply accepts only the persisted plan identity');
  const { plan } = await loadPlanArtifact(ctx.sessionManager, input.planId, input.planSha256);
  if (plan.engine !== 'terraform') throw new Error('Azure Terraform apply requires Terraform ownership');
  const storage = await platform.storage(azureUpgradeBinding(plan).owner);
  const { authorized, name: authorizationName } = await readAzureTerraformAuthorization(storage, plan.planSha256);
  assertApplyAllowed(plan, {
    ...input,
    hasUI: ctx.hasUI,
    env: process.env,
    authorization: authorized ? { apply: true, terms: false, destroy: false } : undefined,
    executionEngine: 'terraform',
  });
  const runtime = await platform.runtime('terraform', plan.intent.platformContext);
  const observe = () =>
    discoverAzureCompute(
      {
        subscriptionId: plan.subscription.id,
        publisher: plan.image.publisher,
        offer: plan.image.offer,
        plan: plan.image.plan,
        version: plan.image.version,
        vmSize: plan.vm.size,
        requiredNics: plan.nics.length,
        nodeCount: plan.topology.nodeCount,
        requireRouteServer: plan.routing.mode === 'route-server',
        brownfieldResourceIds: plan.intent.brownfield.resourceIds,
        deploymentName: plan.deploymentName,
        resourceGroup: plan.intent.resourceGroup,
      },
      api,
    );
  const revalidate = async () => assertObservationFresh(plan, await observe());
  await revalidate();
  if (
    !authorized &&
    ctx.hasUI &&
    !(await ctx.ui.confirm('Apply immutable Azure CE Terraform plan', `${plan.planId}\n${plan.planSha256}`))
  )
    throw new Error('Azure CE Terraform apply was not approved');
  await storage.write(authorizationName, {
    schemaVersion: 1,
    engine: 'terraform',
    planSha256: plan.planSha256,
    mutations: true,
  });
  const result = ['start', 'stop', 'resize'].includes(plan.intent.operation)
    ? await runAzureTerraformLifecycle(plan, terraform, runtime, storage, api, process.env, signal)
    : await runAzureTerraformAdmission(plan, terraform, runtime, storage, api, revalidate, process.env, signal);
  const artifactId = await ctx.sessionManager.saveArtifact(JSON.stringify(result), 'azure-ce-terraform-checkpoint');
  if (!artifactId) throw new Error('Azure Terraform outcome artifact persistence failed; checkpoint is retained');
  return { ...result, artifactId };
}
