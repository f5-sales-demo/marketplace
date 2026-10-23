import { VerifiedIngressContract } from '../../../platform/src/ce/ingress-contract';
import { CeApiError } from '../../../platform/src/ce/runtime';
import type { CePlatformService } from '../../../platform/src/ce/service';
import type { CeTerraformService } from '../../../terraform/src/service';
import type { AwsExecApi } from '../aws/exec';
import { type AwsCeApplyInput, assertAwsApplyAllowed } from './apply';
import { type AwsCeToolContext, loadAwsPlan } from './artifacts';
import { collectAwsNetworkHealth } from './network-health';
import { ensureAwsPlatformIngress } from './platform-ingress';
import { scopedAwsApi } from './scoped-exec';
import {
  awsTerraformBrownfieldPlacementBaseline,
  loadAwsTerraformBrownfieldBinding,
} from './terraform-brownfield-binding';
import { applyAwsTerraformConnectStage } from './terraform-connect-stage';
import { activateAwsTerraformDirectRoutes } from './terraform-direct-activation';
import type { AwsTerraformDirectOwnership } from './terraform-direct-ownership';
import { importAwsTerraformDirectRoutes } from './terraform-direct-stage';
import { awsTerraformFoundationDeployment } from './terraform-foundation';
import { discoverAwsTerraformInterfaces } from './terraform-identities';
import { runAwsTerraformInitialReplacement } from './terraform-initial-replacement';
import { assertAwsTerraformDeploymentActive, withAwsTerraformLifecycle } from './terraform-lifecycle';
import { revalidateAwsTerraformPlan } from './terraform-preflight';
import { bindTerraformIngress, configureAwsTerraformRouting } from './terraform-routing';
import { bindTerraformStaticRouting } from './terraform-static';
import { runAwsTerraformAdmission } from './terraform-workflow';
import { siteBindings } from './topology';
import { collectAwsTrafficProbe } from './traffic-probe';
import type { AwsCeCheckpoint } from './types';

export async function executeAwsCeTerraformApply(...args: Parameters<typeof executeAwsCeTerraformApplyUnlocked>) {
  const [input, ctx, , platform, , , signal] = args;
  if (Object.keys(input).some((key) => !['planId', 'planSha256'].includes(key)))
    throw new Error('Terraform apply accepts only the persisted plan identity');
  const { plan } = await loadAwsPlan(ctx.sessionManager, input.planId, input.planSha256);
  const storage = await platform.storage({
    deploymentId: plan.deploymentName,
    engine: 'terraform',
    provider: 'aws',
    account: plan.accountId,
    region: plan.region,
  });
  return withAwsTerraformLifecycle(storage, signal, async () => {
    await assertAwsTerraformDeploymentActive(storage);
    return executeAwsCeTerraformApplyUnlocked(...args);
  });
}

async function executeAwsCeTerraformApplyUnlocked(
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
  await awsTerraformFoundationDeployment(
    plan,
    {},
    plan.intent.vpc.mode === 'brownfield' ? awsTerraformBrownfieldPlacementBaseline(plan) : undefined,
  );
  const runtime = await platform.runtime('terraform', plan.intent.platformContext);
  if (typeof runtime.resourceMutation !== 'function')
    throw new Error('Terraform F5 resource-state service is required before deployment');
  if (
    plan.intent.topology.nodeCount === 3 &&
    (!plan.intent.topology.sites || plan.intent.topology.sites.some((site) => site.nodeIndexes.length === 3))
  )
    runtime.requireAwsHaContract();
  const storage = await platform.storage({
    deploymentId: plan.deploymentName,
    engine: 'terraform',
    provider: 'aws',
    account: plan.accountId,
    region: plan.region,
  });
  await runtime.reconcileTerraformResources(
    {
      deploymentId: plan.deploymentName,
      engine: 'terraform',
      provider: 'aws',
      account: plan.accountId,
      region: plan.region,
    },
    signal,
  );
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
  if (authorization && (authorization as Record<string, unknown>).f5StateOwner !== 'terraform')
    throw new Error('Legacy mixed-engine Terraform deployment is inspection-only; automatic F5 adoption is prohibited');
  if (authorization !== undefined && !authorized)
    throw new Error('Terraform authorization checkpoint differs from this plan or engine');
  if (!authorization) {
    for (const { binding } of siteBindings(plan)) {
      try {
        await runtime.observeOwnedSite(binding, signal);
        throw new Error('Existing F5 site cannot be adopted by a fresh Terraform deployment');
      } catch (error) {
        if (!(error instanceof CeApiError && error.category === 'not-found')) throw error;
      }
    }
  }
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
    f5StateOwner: 'terraform',
  });
  if (plan.routing?.profile === 'tgw-connect') runtime.requireAwsRoutingContract();
  let connectStarted = false;
  try {
    const marker = (await storage.read('terraform-connect-stage.json')) as Record<string, unknown>;
    if (
      marker.schemaVersion !== 1 ||
      marker.engine !== 'terraform' ||
      marker.planSha256 !== plan.planSha256 ||
      !['pending', 'applied'].includes(String(marker.stage)) ||
      !['tgw-connect', 'tgw-static'].includes(plan.routing?.profile)
    )
      throw new Error('Terraform Connect checkpoint differs from the plan');
    connectStarted = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  let directStarted = false;
  try {
    await storage.read('terraform-direct-import-source.json');
    if (
      plan.intent.vpc.mode !== 'brownfield' ||
      plan.intent.routing.profile !== 'direct-eni' ||
      !plan.intent.routes.length
    )
      throw new Error('Direct import source belongs to a different deployment profile');
    directStarted = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  let result: Record<string, unknown> =
    connectStarted || directStarted
      ? {
          planId: plan.planId,
          planSha256: plan.planSha256,
          engine: 'terraform',
          status: 'routing-in-progress',
          routing: 'unknown',
          traffic: 'unknown',
        }
      : await (async () => {
          const pending = await runAwsTerraformInitialReplacement(
            plan,
            terraform,
            runtime,
            storage,
            api,
            fetcher,
            signal,
          );
          if (pending.handled && pending.status !== 'registered') return pending;
          try {
            return await runAwsTerraformAdmission(
              plan,
              terraform,
              runtime,
              storage,
              api,
              revalidate,
              process.env,
              signal,
            );
          } catch (error) {
            if (!(error instanceof Error) || !error.message.includes('coupled VM/site replacement')) throw error;
            const replacement = await runAwsTerraformInitialReplacement(
              plan,
              terraform,
              runtime,
              storage,
              api,
              fetcher,
              signal,
            );
            if (!replacement.handled) throw error;
            if (replacement.status === 'registered')
              await storage.write('terraform-workflow.json', {
                schemaVersion: 1,
                engine: 'terraform',
                planSha256: plan.planSha256,
                stage: 'registered',
              });
            return replacement;
          }
        })();
  if (
    ['tgw-connect', 'tgw-static'].includes(plan.routing?.profile) &&
    (connectStarted || result.status === 'registered')
  ) {
    const owner = {
      deploymentId: plan.deploymentName,
      engine: 'terraform' as const,
      provider: 'aws' as const,
      account: plan.accountId,
      region: plan.region,
    };
    const placement =
      plan.intent.vpc.mode === 'brownfield'
        ? await loadAwsTerraformBrownfieldBinding(plan, storage, api, signal)
        : undefined;
    const session = await terraform.open(owner, await awsTerraformFoundationDeployment(plan, {}, placement), 'current');
    await applyAwsTerraformConnectStage(plan, current, session, storage, revalidate, process.env, signal);
    try {
      let bgp: Record<string, unknown> | undefined;
      let routingCheckpoint: AwsCeCheckpoint;
      if (plan.routing.profile === 'tgw-connect') {
        bgp = await configureAwsTerraformRouting(plan, session, runtime, storage, api, process.env, signal);
        if (bgp.status !== 'healthy') throw new Error('Observed AWS BGP sessions have not converged');
        routingCheckpoint = (await storage.read('terraform-routing-checkpoint.json')) as AwsCeCheckpoint;
      } else {
        const outputs = await session.readOutputs(
          ['ce_vpc_id', 'ce_interfaces', 'ce_instances', 'ce_transport_attachment', 'ce_static_route_tables'],
          process.env,
          signal,
        );
        const identities = await discoverAwsTerraformInterfaces(plan, outputs, api, signal);
        routingCheckpoint = {
          schemaVersion: 2,
          engine: 'terraform',
          planId: plan.planId,
          planSha256: plan.planSha256,
          completedActionIds: [],
          state: 'running',
          resolvedValues: { ...identities.bindings, ...bindTerraformStaticRouting(plan, outputs) },
        };
        await storage.write('terraform-routing-checkpoint.json', routingCheckpoint);
      }
      const routes = await collectAwsNetworkHealth(
        'routes',
        plan,
        routingCheckpoint,
        scopedAwsApi(api, plan.intent.awsProfile, signal),
        signal,
      );
      if (routes.status === 'unknown') throw new Error('AWS TGW route evidence is unavailable');
      if (routes.status !== 'healthy') throw new Error('Observed AWS TGW routes have not converged');
      const refresh = await session.plan(process.env, signal);
      if (!refresh.noChanges) throw new Error('Terraform changed after routing convergence');
      result = {
        ...result,
        status: 'pending-route-and-traffic-acceptance',
        bgp,
        routes,
        terraformNoChanges: true,
      };
    } catch (error) {
      if (signal?.aborted || !(error instanceof Error) || !error.message.includes('has not converged')) throw error;
      result = { ...result, status: 'pending-routing-convergence', reason: error.message };
    }
  }
  if (
    plan.intent.vpc.mode === 'brownfield' &&
    plan.intent.routing.profile === 'direct-eni' &&
    plan.intent.routes.length &&
    (directStarted || result.status === 'registered')
  ) {
    const placement = await loadAwsTerraformBrownfieldBinding(plan, storage, api, signal);
    const owner = {
      deploymentId: plan.deploymentName,
      engine: 'terraform' as const,
      provider: 'aws' as const,
      account: plan.accountId,
      region: plan.region,
    };
    const session = await terraform.open(owner, await awsTerraformFoundationDeployment(plan, {}, placement), 'current');
    const outputs = await session.readOutputs(['ce_vpc_id', 'ce_interfaces', 'ce_instances'], process.env, signal);
    const discovered = await discoverAwsTerraformInterfaces(plan, outputs, api, signal);
    let activationStarted = false;
    try {
      await storage.read('terraform-direct-activation-source.json');
      activationStarted = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (!activationStarted)
      await importAwsTerraformDirectRoutes(
        plan,
        {
          ...discovered.bindings,
          __INSTANCE_1__: String((outputs.ce_instances as Record<string, { id?: unknown }>)['1']?.id ?? ''),
        },
        session,
        storage,
        api,
        revalidate,
        process.env,
        signal,
      );
    const ownership = (await storage.read('terraform-direct-ownership.json')) as AwsTerraformDirectOwnership;
    const { binding } = siteBindings(plan)[0];
    result = {
      ...result,
      ...(await activateAwsTerraformDirectRoutes(
        plan,
        ownership,
        session,
        storage,
        api,
        () =>
          runtime.observeAwsInterfaces(
            binding,
            plan.interfaces.map((_i, index) => ({
              node: `${plan.deploymentName}-1`,
              role: index === 0 ? ('slo' as const) : ('sli' as const),
              mac: discovered.bindings[`__ENI_1_${index}_MAC__`],
            })),
            signal,
          ),
        revalidate,
        process.env,
        signal,
      )),
    };
  }
  const routingReady = ['tgw-connect', 'tgw-static'].includes(plan.routing?.profile)
    ? result.status === 'pending-route-and-traffic-acceptance'
    : plan.intent.vpc.mode === 'brownfield' && plan.intent.routing.profile === 'direct-eni' && plan.intent.routes.length
      ? result.status === 'pending-route-and-traffic-acceptance'
      : result.status === 'registered';
  if (plan.intent.ingress?.mode === 'nlb' && routingReady) {
    const owner = {
      deploymentId: plan.deploymentName,
      engine: 'terraform' as const,
      provider: 'aws' as const,
      account: plan.accountId,
      region: plan.region,
    };
    const placement =
      plan.intent.vpc.mode === 'brownfield'
        ? await loadAwsTerraformBrownfieldBinding(plan, storage, api, signal)
        : undefined;
    const session = await terraform.open(owner, await awsTerraformFoundationDeployment(plan, {}, placement), 'current');
    const outputs = await session.readOutputs(
      ['ce_vpc_id', 'ce_interfaces', 'ce_instances', 'ce_ingress'],
      process.env,
      signal,
    );
    const discovered = await discoverAwsTerraformInterfaces(plan, outputs, api, signal);
    const resolvedValues = { ...discovered.bindings, ...bindTerraformIngress(plan, outputs) };
    const ingress = await ensureAwsPlatformIngress(
      plan,
      runtime,
      storage,
      await VerifiedIngressContract.release(fetcher, signal),
      resolvedValues,
      scopedAwsApi(api, plan.intent.awsProfile, signal),
      signal,
    );
    const nlb = await collectAwsNetworkHealth(
      'nlb',
      plan,
      {
        schemaVersion: plan.schemaVersion,
        engine: 'terraform',
        planId: plan.planId,
        planSha256: plan.planSha256,
        completedActionIds: [],
        resolvedValues,
        state: 'running',
      } as AwsCeCheckpoint,
      scopedAwsApi(api, plan.intent.awsProfile, signal),
      signal,
    );
    if (nlb.status !== 'healthy') {
      result = { ...result, status: 'pending-ingress-convergence', ingress, nlb, traffic: 'unknown' };
    } else {
      const traffic = await collectAwsTrafficProbe(plan, { resolvedValues }, storage, api, signal);
      const refresh = await session.plan(process.env, signal);
      if (!refresh.noChanges) throw new Error('Terraform changed after platform ingress convergence');
      result = {
        ...result,
        status: 'accepted',
        ingress,
        nlb,
        terraformNoChanges: true,
        traffic,
      };
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
