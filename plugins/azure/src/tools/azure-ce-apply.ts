import type { CePlatformService } from '../../../platform/src/ce/service';
import type { CeTerraformService } from '../../../terraform/src/service';
import type { AzExecApi } from '../az/exec';
import type { PluginInterface } from '../az/types';
import { assertActionOwnership, assertApplyAllowed, assertObservationFresh, resolveActionArgs } from '../ce/apply';
import { type AzureCeToolContext, loadCheckpoint, loadPlanArtifact, saveCheckpoint } from '../ce/artifacts';
import { fingerprintObservation } from '../ce/canonical';
import { discoverAzureCompute } from '../ce/discovery';
import { withAzureCeExecution } from '../ce/execution';
import { resolveInterfaceAddress } from '../ce/interface-address';
import {
  azureNativeBootstrapForAction,
  collectAzureNativeAdmissionHealth,
  prepareAzureNativeAdmission,
  recordAzureNativeLaunch,
  withAzureNativeBootstrapFile,
} from '../ce/native-workflow';
import { azurePlatformService, azureTerraformService } from '../ce/platform';
import { executeAzureCeTerraformApply } from '../ce/terraform-apply';
import type { AzureCeCheckpoint, AzureCePlan } from '../ce/types';
import { AZURE_CE_SCHEMA_VERSION } from '../ce/types';
import { makeExecApi } from './shared';

interface TerraformDependencies {
  platform(pi: PluginInterface, signal?: AbortSignal): Promise<CePlatformService>;
  terraform(pi: PluginInterface, signal?: AbortSignal): Promise<CeTerraformService>;
}

const terraformDefaults: TerraformDependencies = {
  platform: azurePlatformService,
  terraform: azureTerraformService,
};

interface ApplyParams {
  planId: string;
  planSha256: string;
}

async function replacementsFor(args: string[], api: AzExecApi, plan: AzureCePlan): Promise<Record<string, string>> {
  const replacements: Record<string, string> = {};
  for (const arg of args) {
    const match = /^__NODE_(\d+)_(SLO|SLI|DATA)_PRIVATE_IP__$/.exec(arg);
    if (!match || replacements[arg]) continue;
    const role = match[2] === 'SLO' || (match[2] === 'DATA' && plan.nics.length === 1) ? 'slo' : 'sli';
    replacements[arg] = await resolveInterfaceAddress(api, plan, Number(match[1]), role);
  }
  return replacements;
}

async function executeApply(
  params: ApplyParams,
  ctx: AzureCeToolContext,
  api: AzExecApi,
  platform: CePlatformService,
  signal?: AbortSignal,
) {
  const { plan, observation } = await loadPlanArtifact(ctx.sessionManager, params.planId, params.planSha256);
  if (Object.keys(params).some((key) => !['planId', 'planSha256'].includes(key)))
    throw new Error('Azure apply accepts only the persisted plan identity; caller evidence is unsupported');
  const existing = await loadCheckpoint(ctx.sessionManager, plan.planId, plan.planSha256);
  if (existing) {
    if (existing.engine !== plan.engine) throw new Error('Checkpoint execution engine does not match the plan');
    const expectedPrefix = plan.actions.slice(0, existing.completedActionIds.length).map((action) => action.id);
    if (JSON.stringify(existing.completedActionIds) !== JSON.stringify(expectedPrefix))
      throw new Error('Persisted checkpoint is not an ordered prefix of the immutable plan');
    if (existing.observationFingerprint && !/^[a-f0-9]{64}$/.test(existing.observationFingerprint))
      throw new Error('Persisted checkpoint has an invalid observation fingerprint');
  }
  assertApplyAllowed(plan, {
    planId: params.planId,
    planSha256: params.planSha256,
    hasUI: ctx.hasUI,
    env: process.env,
    authorization: existing?.authorization,
  });
  const completed = new Set(existing?.completedActionIds ?? []);
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
  const current = await observe();
  if (
    !existing?.observationFingerprint &&
    completed.has(plan.actions.find((action) => action.kind === 'marketplace-terms-accept')?.id ?? '')
  )
    current.image.termsAccepted = observation.image.termsAccepted;
  assertObservationFresh(plan, current, existing?.observationFingerprint);

  const authorization = {
    apply: existing?.authorization?.apply === true,
    terms: existing?.authorization?.terms === true,
    destroy: existing?.authorization?.destroy === true,
  };
  if (ctx.hasUI) {
    if (!authorization.apply) {
      const confirmed = await ctx.ui.confirm(
        'Apply immutable Azure CE plan',
        `${plan.planId}\n${plan.planSha256}\n${plan.actions.length - completed.size} action(s) remain.`,
      );
      if (!confirmed) throw new Error('Apply was not approved');
      authorization.apply = true;
    }
    if (plan.intent.operation === 'teardown' && !authorization.destroy) {
      const destroy = await ctx.ui.confirm(
        'Tear down Customer Edge',
        `Drain routing, restore approved brownfield state, and delete only resources owned by ${plan.deploymentName}?`,
      );
      if (!destroy) throw new Error('Teardown was not approved');
      authorization.destroy = true;
    }
  }

  if (!ctx.hasUI) {
    authorization.apply ||= process.env.XCSH_CE_HEADLESS_MUTATIONS === '1';
    authorization.destroy ||= process.env.XCSH_CE_ALLOW_DESTROY === '1';
  }

  const runtime = await platform.runtime('native', plan.intent.platformContext);
  const storage = await platform.storage({
    deploymentId: plan.deploymentName,
    engine: 'native',
    provider: 'azure',
    account: plan.subscription.id,
    region: plan.region,
  });
  const native = await prepareAzureNativeAdmission(plan, runtime, storage, signal);

  const checkpoint: AzureCeCheckpoint = {
    authorization,
    engine: plan.engine,
    schemaVersion: AZURE_CE_SCHEMA_VERSION,
    planId: plan.planId,
    planSha256: plan.planSha256,
    completedActionIds: [...completed],
    observationFingerprint: existing?.observationFingerprint,
    state: 'running',
  };
  await saveCheckpoint(ctx.sessionManager, checkpoint);
  for (const action of plan.actions) {
    if (completed.has(action.id)) continue;
    try {
      await assertActionOwnership(plan, action, api);
      if (action.kind === 'health-gate') {
        const deadline = Date.now() + 15 * 60_000;
        let evidence: Awaited<ReturnType<typeof collectAzureNativeAdmissionHealth>>;
        while (true) {
          evidence = await collectAzureNativeAdmissionHealth(
            plan,
            action.node ?? plan.topology.nodeCount,
            api,
            runtime,
            storage,
            signal,
          );
          await storage.write(`${action.id}-evidence.json`, {
            ...evidence,
            planId: plan.planId,
            planSha256: plan.planSha256,
          });
          if (evidence.status === 'healthy') break;
          if (Date.now() >= deadline)
            throw new Error(
              evidence.status === 'unknown'
                ? 'Collected Azure platform health evidence is unavailable'
                : 'Observed Azure platform health has not converged',
            );
          await new Promise<void>((resolve, reject) => {
            const abort = () => {
              clearTimeout(timer);
              reject(signal?.reason ?? new Error('Azure health convergence cancelled'));
            };
            const timer = setTimeout(() => {
              signal?.removeEventListener('abort', abort);
              resolve();
            }, 10_000);
            signal?.addEventListener('abort', abort, { once: true });
            if (signal?.aborted) abort();
          });
        }
      }
      if (action.kind === 'bgp-gate') throw new Error('Collected Azure BGP evidence is unavailable');
      if (action.kind === 'traffic-gate') throw new Error('Collected Azure traffic evidence is unavailable');
      if (action.command && action.args) {
        const replacements = await replacementsFor(action.args, api, plan);
        const execute = (bootstrapFile?: string) =>
          api.exec(
            action.command as 'az',
            resolveActionArgs(action.args ?? [], plan.planSha256, {
              ...replacements,
              ...(bootstrapFile ? { __BOOTSTRAP_FILE__: bootstrapFile } : {}),
            }),
          );
        const result = action.requiresBootstrap
          ? await withAzureNativeBootstrapFile(
              await azureNativeBootstrapForAction(plan, action, native, runtime, storage, signal),
              execute,
            )
          : await execute();
        if (result.exitCode !== 0)
          throw new Error(`Azure action ${action.id} failed with exit code ${result.exitCode}`);
        if (action.kind === 'vm-create' && action.node)
          await recordAzureNativeLaunch(plan, action.node, native, storage);
      }
      completed.add(action.id);
      checkpoint.completedActionIds = [...completed];
      checkpoint.failedActionId = undefined;
      const changesFingerprint =
        action.kind === 'marketplace-terms-accept' ||
        action.kind === 'route-association-update' ||
        action.kind === 'brownfield-restore' ||
        (action.kind === 'route-create' && plan.intent.brownfield.routeChanges.length > 0);
      if (changesFingerprint)
        checkpoint.observationFingerprint = fingerprintObservation(await observe(), plan.intent.brownfield.resourceIds);
      await saveCheckpoint(ctx.sessionManager, checkpoint);
    } catch (error) {
      checkpoint.state = 'partial';
      checkpoint.failedActionId = action.id;
      await saveCheckpoint(ctx.sessionManager, checkpoint);
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}. Resume with the same plan ID and SHA-256; ${completed.size}/${plan.actions.length} actions are checkpointed.`,
      );
    }
  }
  checkpoint.state = 'complete';
  await saveCheckpoint(ctx.sessionManager, checkpoint);
  return { plan, checkpoint };
}

export function createAzureCeApplyTool(
  pi: PluginInterface,
  makeApi: (cwd: string) => AzExecApi = makeExecApi,
  terraformDependencies: TerraformDependencies = terraformDefaults,
) {
  const { Type } = pi.typebox;
  return {
    name: 'azure_ce_apply',
    label: 'Apply Azure Customer Edge Plan',
    description:
      'Apply or resume only an exact persisted Azure CE plan ID and SHA-256 after stale-state, ownership, image, networking, quota, terms, and security-gate revalidation.',
    parameters: Type.Object({
      planId: Type.String(),
      planSha256: Type.String(),
    }),
    async execute(
      _id: string,
      params: ApplyParams,
      signal: AbortSignal | undefined,
      _update: unknown,
      ctx: AzureCeToolContext,
    ) {
      try {
        const envelope = await loadPlanArtifact(ctx.sessionManager, params.planId, params.planSha256);
        if (envelope.plan.engine === 'terraform') {
          const platform = await terraformDependencies.platform(pi, signal);
          const result = await executeAzureCeTerraformApply(
            params,
            ctx,
            withAzureCeExecution(makeApi(ctx.cwd), signal),
            platform,
            await terraformDependencies.terraform(pi, signal),
            signal,
          );
          return {
            content: [
              {
                type: 'text' as const,
                text: `Azure CE Terraform plan ${envelope.plan.planId}: ${result.status}. Routing and traffic remain separate collected evidence.`,
              },
            ],
            details: { tool: 'azure_ce_apply', ...result },
          };
        }
        const { plan, checkpoint } = await executeApply(
          params,
          ctx,
          withAzureCeExecution(makeApi(ctx.cwd), signal),
          await terraformDependencies.platform(pi, signal),
          signal,
        );
        return {
          content: [
            {
              type: 'text' as const,
              text: `Azure CE plan ${plan.planId} applied successfully. ${checkpoint.completedActionIds.length} ordered actions are checkpointed and verified.`,
            },
          ],
          details: { tool: 'azure_ce_apply', planId: plan.planId, checkpoint },
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Azure CE apply stopped safely: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
          details: { tool: 'azure_ce_apply', planId: params.planId },
        };
      }
    },
  };
}
