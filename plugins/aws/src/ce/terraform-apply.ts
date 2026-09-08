import type { CePlatformService } from '../../../platform/src/ce/service';
import type { CeTerraformService } from '../../../terraform/src/service';
import type { AwsExecApi } from '../aws/exec';
import { type AwsCeApplyInput, assertAwsApplyAllowed } from './apply';
import { type AwsCeToolContext, loadAwsPlan } from './artifacts';
import { applyAwsTerraformConnectStage } from './terraform-connect-stage';
import { awsTerraformFoundationDeployment } from './terraform-foundation';
import { revalidateAwsTerraformPlan } from './terraform-preflight';
import { configureAwsTerraformRouting } from './terraform-routing';
import { runAwsTerraformAdmission } from './terraform-workflow';

export async function executeAwsCeTerraformApply(
  input: AwsCeApplyInput,
  ctx: AwsCeToolContext,
  api: AwsExecApi,
  platform: CePlatformService,
  terraform: CeTerraformService,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
  preflight: typeof revalidateAwsTerraformPlan = revalidateAwsTerraformPlan,
) {
  if (Object.keys(input).some((key) => !['planId', 'planSha256'].includes(key)))
    throw new Error('Terraform apply accepts only the persisted plan identity');
  const { plan, observation } = await loadAwsPlan(ctx.sessionManager, input.planId, input.planSha256);
  // Validate translation before authorization or creation of any workspace.
  await awsTerraformFoundationDeployment(plan);
  const storage = await platform.storage({
    deploymentId: plan.deploymentName,
    engine: 'terraform',
    provider: 'aws',
    account: plan.accountId,
    region: plan.region,
  });
  let authorization: unknown;
  try {
    authorization = await storage.read('terraform-authorization.json');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const authorized = Boolean(
    authorization &&
      typeof authorization === 'object' &&
      (authorization as Record<string, unknown>).schemaVersion === 1 &&
      (authorization as Record<string, unknown>).engine === 'terraform' &&
      (authorization as Record<string, unknown>).planSha256 === plan.planSha256 &&
      (authorization as Record<string, unknown>).mutations === true,
  );
  if (authorization !== undefined && !authorized)
    throw new Error('Terraform authorization checkpoint differs from this plan or engine');
  assertAwsApplyAllowed(plan, {
    ...input,
    hasUI: ctx.hasUI,
    env: process.env,
    authorized,
    executionEngine: 'terraform',
  });
  let current = observation;
  const revalidate = async () => {
    current = await preflight(plan, observation, platform, api, fetcher, signal);
  };
  await revalidate();
  if (
    !authorized &&
    ctx.hasUI &&
    !(await ctx.ui.confirm('Apply immutable AWS CE Terraform plan', `${plan.planId}\n${plan.planSha256}`))
  )
    throw new Error('AWS CE Terraform apply was not approved');
  await storage.write('terraform-authorization.json', {
    schemaVersion: 1,
    engine: 'terraform',
    planSha256: plan.planSha256,
    mutations: true,
  });
  const runtime = await platform.runtime('terraform', plan.intent.platformContext);
  if (plan.routing?.profile === 'tgw-connect') runtime.requireAwsRoutingContract();
  let connectStarted = false;
  try {
    const marker = (await storage.read('terraform-connect-stage.json')) as Record<string, unknown>;
    if (
      marker.schemaVersion !== 1 ||
      marker.engine !== 'terraform' ||
      marker.planSha256 !== plan.planSha256 ||
      !['pending', 'applied'].includes(String(marker.stage)) ||
      plan.routing?.profile !== 'tgw-connect'
    )
      throw new Error('Terraform Connect checkpoint differs from the plan');
    connectStarted = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  let result: Record<string, unknown> = connectStarted
    ? {
        planId: plan.planId,
        planSha256: plan.planSha256,
        engine: 'terraform',
        status: 'routing-in-progress',
        routing: 'unknown',
        traffic: 'unknown',
      }
    : await runAwsTerraformAdmission(plan, terraform, runtime, storage, api, revalidate, process.env, signal);
  if (plan.routing?.profile === 'tgw-connect' && (connectStarted || result.status === 'registered')) {
    const owner = {
      deploymentId: plan.deploymentName,
      engine: 'terraform' as const,
      provider: 'aws' as const,
      account: plan.accountId,
      region: plan.region,
    };
    const session = await terraform.open(owner, await awsTerraformFoundationDeployment(plan), 'current');
    await applyAwsTerraformConnectStage(plan, current, session, storage, revalidate, process.env, signal);
    try {
      const bgp = await configureAwsTerraformRouting(plan, session, runtime, storage, api, process.env, signal);
      const refresh = await session.plan(process.env, signal);
      result = {
        ...result,
        status: 'pending-route-and-traffic-acceptance',
        bgp,
        terraformNoChanges: refresh.noChanges,
      };
    } catch (error) {
      if (signal?.aborted || !(error instanceof Error) || !error.message.includes('has not converged')) throw error;
      result = { ...result, status: 'pending-routing-convergence', reason: error.message };
    }
  }
  const artifactId = await ctx.sessionManager.saveArtifact(JSON.stringify(result), 'aws-ce-terraform-checkpoint');
  if (!artifactId) throw new Error('Terraform outcome artifact persistence failed; deployment checkpoint is retained');
  return { ...result, status: String(result.status), artifactId };
}

export function awsTerraformService(pi: { [key: string]: unknown }, signal?: AbortSignal): Promise<CeTerraformService> {
  const bus = pi.events as { emit?: (channel: string, value: unknown) => void } | undefined;
  return new Promise((resolve, reject) => {
    const fail = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', fail);
      reject(new Error('Terraform CE service unavailable or cancelled'));
    };
    const timer = setTimeout(fail, 5000);
    signal?.addEventListener('abort', fail, { once: true });
    if (signal?.aborted || typeof bus?.emit !== 'function') return fail();
    try {
      bus.emit('xcsh:ce-terraform:v1:service', {
        version: 1,
        resolve: (service: CeTerraformService) => {
          clearTimeout(timer);
          signal?.removeEventListener('abort', fail);
          resolve(service);
        },
      });
    } catch {
      fail();
    }
  });
}
