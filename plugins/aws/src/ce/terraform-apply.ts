import type { CePlatformService } from '../../../platform/src/ce/service';
import type { CeTerraformService } from '../../../terraform/src/service';
import type { AwsExecApi } from '../aws/exec';
import { type AwsCeApplyInput, assertAwsApplyAllowed } from './apply';
import { type AwsCeToolContext, loadAwsPlan } from './artifacts';
import { awsTerraformFoundationDeployment } from './terraform-foundation';
import { revalidateAwsTerraformPlan } from './terraform-preflight';
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
  const revalidate = () => preflight(plan, observation, platform, api, fetcher, signal).then(() => {});
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
  const result = await runAwsTerraformAdmission(
    plan,
    terraform,
    runtime,
    storage,
    api,
    revalidate,
    process.env,
    signal,
  );
  const artifactId = await ctx.sessionManager.saveArtifact(JSON.stringify(result), 'aws-ce-terraform-checkpoint');
  if (!artifactId) throw new Error('Terraform outcome artifact persistence failed; deployment checkpoint is retained');
  return { ...result, artifactId };
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
