import { VerifiedIngressContract } from '../../../platform/src/ce/ingress-contract';
import type { CePlatformService } from '../../../platform/src/ce/service';
import type { CeTerraformService } from '../../../terraform/src/service';
import type { AzExecApi } from '../az/exec';
import { assertApplyAllowed, assertObservationFresh } from './apply';
import { type AzureCeToolContext, loadPlanArtifact } from './artifacts';
import { discoverAzureCompute } from './discovery';
import { ensureAzurePlatformIngress } from './platform-ingress';
import { fingerprintCurrentObservation } from './recovery';
import { azureTerraformLifecycleDeployment, runAzureTerraformLifecycle } from './terraform-lifecycle';
import { runAzureTerraformReplacement } from './terraform-replacement';
import { azureUpgradeBinding } from './terraform-upgrade';
import { runAzureTerraformAdmission } from './terraform-workflow';
import { collectAzureTrafficProbe } from './traffic-probe';
import type { AzureCeObservation, AzureCePlan } from './types';

interface AzureTerraformApplyDependencies {
  ingressContract?: () => Promise<VerifiedIngressContract>;
}

/** Accept only the observed subscription-level agreement transition caused by the exact initial Terraform deploy. */
export function reconcileAzureTerraformMarketplaceTermsAcceptance(
  plan: AzureCePlan,
  current: AzureCeObservation,
): string {
  if (
    plan.engine !== 'terraform' ||
    plan.intent.operation !== 'deploy' ||
    plan.image.termsAccepted ||
    current.image.termsAccepted !== true
  )
    throw new Error('Stale Azure CE plan: Marketplace terms changed outside the initial Terraform deployment contract');
  const beforeAcceptance = structuredClone(current);
  beforeAcceptance.image.termsAccepted = false;
  assertObservationFresh(plan, beforeAcceptance);
  return fingerprintCurrentObservation(plan, current);
}

/** Keep unsupported lifecycle intents from falling through to the deployment-only admission workflow. */
export function assertAzureTerraformApplyOperation(plan: Awaited<ReturnType<typeof loadPlanArtifact>>['plan']): void {
  if (!['deploy', 'start', 'stop', 'resize', 'replace-node'].includes(plan.intent.operation))
    throw new Error(`Terraform ${plan.intent.operation} is not executable through Azure CE apply`);
}

export async function acceptAzureTerraformLifecycleTraffic(
  plan: Awaited<ReturnType<typeof loadPlanArtifact>>['plan'],
  terraform: CeTerraformService,
  runtime: Awaited<ReturnType<CePlatformService['runtime']>>,
  storage: Awaited<ReturnType<CePlatformService['storage']>>,
  api: AzExecApi,
  contract: VerifiedIngressContract,
  signal?: AbortSignal,
  dependencies: {
    ensureIngress?: typeof ensureAzurePlatformIngress;
    collectTraffic?: typeof collectAzureTrafficProbe;
  } = {},
) {
  if (!['start', 'resize'].includes(plan.intent.operation) || plan.intent.ingress?.mode !== 'platform-http')
    throw new Error('Azure Terraform lifecycle traffic acceptance requires start or resize with platform ingress');
  const ingress = await (dependencies.ensureIngress ?? ensureAzurePlatformIngress)(
    plan,
    runtime,
    storage,
    contract,
    api,
    signal,
  );
  if (ingress?.listener !== 'configured') throw new Error('Observed Azure platform ingress has not converged');
  const traffic = await (dependencies.collectTraffic ?? collectAzureTrafficProbe)(
    plan,
    storage,
    api,
    signal,
    `${plan.planId}-traffic-probe`,
  );
  if (traffic.status !== 'healthy') throw new Error('Observed end-to-end Azure traffic has not converged');
  const finalNode = plan.topology.nodeCount;
  const finalSession = await terraform.open(
    azureUpgradeBinding(plan).owner,
    await azureTerraformLifecycleDeployment(plan, finalNode, false),
    'current',
  );
  const refresh = await finalSession.plan(process.env, signal);
  if (!refresh.noChanges || refresh.changes.length !== 0)
    throw new Error('Terraform changed after Azure lifecycle traffic convergence');
  return { ingress, traffic: { ...traffic, status: 'healthy' as const }, terraformNoChanges: true as const };
}

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
  dependencies: AzureTerraformApplyDependencies = {},
) {
  if (Object.keys(input).some((key) => !['planId', 'planSha256'].includes(key)))
    throw new Error('Azure Terraform apply accepts only the persisted plan identity');
  const { plan } = await loadPlanArtifact(ctx.sessionManager, input.planId, input.planSha256);
  if (plan.engine !== 'terraform') throw new Error('Azure Terraform apply requires Terraform ownership');
  assertAzureTerraformApplyOperation(plan);
  const storage = await platform.storage(azureUpgradeBinding(plan).owner);
  const { authorized, name: authorizationName } = await readAzureTerraformAuthorization(storage, plan.planSha256);
  assertApplyAllowed(plan, {
    ...input,
    hasUI: ctx.hasUI,
    env: process.env,
    authorization: authorized ? { apply: true, terms: false, destroy: false } : undefined,
    executionEngine: 'terraform',
  });
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
  let acceptedTermsFingerprint: string | undefined;
  const revalidate = async () => {
    const current = await observe();
    if (acceptedTermsFingerprint) return assertObservationFresh(plan, current, acceptedTermsFingerprint);
    if (current.image.termsAccepted === true && plan.image.termsAccepted === false) {
      acceptedTermsFingerprint = reconcileAzureTerraformMarketplaceTermsAcceptance(plan, current);
      await storage.write('terraform-marketplace-terms-observation.json', {
        schemaVersion: 1,
        engine: 'terraform',
        planSha256: plan.planSha256,
        observationFingerprint: acceptedTermsFingerprint,
        image: {
          publisher: current.image.publisher,
          offer: current.image.offer,
          plan: current.image.plan,
          version: current.image.version,
          termsAccepted: true,
        },
      });
      return;
    }
    assertObservationFresh(plan, current);
  };
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
  const runtime = await platform.runtime('terraform', plan.intent.platformContext);
  const ingressContract =
    plan.intent.ingress?.mode === 'platform-http'
      ? await (dependencies.ingressContract?.() ?? VerifiedIngressContract.release(undefined, signal))
      : undefined;
  const acceptIngress = ingressContract
    ? async () => {
        const ingress = await ensureAzurePlatformIngress(plan, runtime, storage, ingressContract, api, signal);
        if (ingress?.listener !== 'configured') throw new Error('Observed Azure platform ingress has not converged');
        const traffic = await collectAzureTrafficProbe(plan, storage, api, signal);
        if (traffic.status !== 'healthy') throw new Error('Observed end-to-end Azure traffic has not converged');
        return { ingress, traffic: { ...traffic, status: 'healthy' as const } };
      }
    : undefined;
  let result: Record<string, unknown> = ['start', 'stop', 'resize'].includes(plan.intent.operation)
    ? await runAzureTerraformLifecycle(plan, terraform, runtime, storage, api, process.env, signal)
    : plan.intent.operation === 'replace-node'
      ? await runAzureTerraformReplacement(plan, terraform, runtime, storage, api, process.env, signal, acceptIngress)
      : await runAzureTerraformAdmission(
          plan,
          terraform,
          runtime,
          storage,
          api,
          revalidate,
          process.env,
          signal,
          undefined,
          acceptIngress,
        );
  if (
    ['start', 'resize'].includes(plan.intent.operation) &&
    ingressContract &&
    plan.intent.ingress?.mode === 'platform-http'
  ) {
    result = {
      ...result,
      ...(await acceptAzureTerraformLifecycleTraffic(plan, terraform, runtime, storage, api, ingressContract, signal)),
    };
  }
  const artifactId = await ctx.sessionManager.saveArtifact(JSON.stringify(result), 'azure-ce-terraform-checkpoint');
  if (!artifactId) throw new Error('Azure Terraform outcome artifact persistence failed; checkpoint is retained');
  return { ...result, status: String(result.status), artifactId };
}
