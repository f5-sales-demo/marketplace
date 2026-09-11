import { VerifiedIngressContract } from '../../../platform/src/ce/ingress-contract';
import type { CePlatformService } from '../../../platform/src/ce/service';
import type { CeTerraformService } from '../../../terraform/src/service';
import type { AzExecApi } from '../az/exec';
import type { PluginInterface } from '../az/types';
import { type AzureCeToolContext, loadCheckpoint, loadPlanArtifact, saveCheckpoint } from '../ce/artifacts';
import { safeHexEqual } from '../ce/canonical';
import { withAzureCeExecution } from '../ce/execution';
import {
  type AzureNativeTeardownPlan,
  observeAzureNativeGroupAbsence,
  prepareAzureNativeTeardown,
  runAzureNativeTeardown,
} from '../ce/native-teardown';
import { azurePlatformService, azureTerraformService } from '../ce/platform';
import { azureTerraformCurrentDeployment } from '../ce/terraform-foundation';
import {
  type AzureTerraformTeardownPlan,
  prepareAzureTerraformTeardown,
  runAzureTerraformTeardown,
} from '../ce/terraform-teardown';
import { azureUpgradeBinding } from '../ce/terraform-upgrade';
import { AZURE_CE_SCHEMA_VERSION } from '../ce/types';
import { executeAzureCeNativeApply } from './azure-ce-apply';
import { makeExecApi } from './shared';

interface Dependencies {
  platform(pi: PluginInterface, signal?: AbortSignal): Promise<CePlatformService>;
  terraform(pi: PluginInterface, signal?: AbortSignal): Promise<CeTerraformService>;
  contract(signal?: AbortSignal): Promise<VerifiedIngressContract>;
  prepare: typeof prepareAzureTerraformTeardown;
  run: typeof runAzureTerraformTeardown;
  prepareNative: typeof prepareAzureNativeTeardown;
  runNative: typeof runAzureNativeTeardown;
  applyNative: typeof executeAzureCeNativeApply;
  makeApi(cwd: string): AzExecApi;
}
const defaults: Dependencies = {
  platform: azurePlatformService,
  terraform: azureTerraformService,
  contract: (signal) => VerifiedIngressContract.release(fetch, signal),
  prepare: prepareAzureTerraformTeardown,
  run: runAzureTerraformTeardown,
  prepareNative: prepareAzureNativeTeardown,
  runNative: runAzureNativeTeardown,
  applyNative: executeAzureCeNativeApply,
  makeApi: makeExecApi,
};
const optional = async (storage: Awaited<ReturnType<CePlatformService['storage']>>, name: string) => {
  try {
    return await storage.read(name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
};

export function createAzureCeTeardownTool(pi: PluginInterface, dependencies: Dependencies = defaults) {
  const { Type } = pi.typebox;
  return {
    name: 'azure_ce_teardown',
    label: 'Teardown Azure Customer Edge',
    description:
      'Prepare or apply an immutable Terraform-owned Azure Customer Edge teardown. It drains platform resources, applies the exact cloud destroy plan, retires enrollment and site identities, and verifies absence without manual state edits.',
    parameters: Type.Object({
      operation: Type.Union([Type.Literal('prepare'), Type.Literal('apply')]),
      basePlanId: Type.String(),
      basePlanSha256: Type.String(),
      teardownPlanId: Type.Optional(Type.String()),
      teardownPlanSha256: Type.Optional(Type.String()),
      cloudPlanId: Type.Optional(Type.String()),
      cloudPlanSha256: Type.Optional(Type.String()),
    }),
    async execute(
      _id: string,
      params: {
        operation: 'prepare' | 'apply';
        basePlanId: string;
        basePlanSha256: string;
        teardownPlanId?: string;
        teardownPlanSha256?: string;
        cloudPlanId?: string;
        cloudPlanSha256?: string;
      },
      signal: AbortSignal | undefined,
      _update: unknown,
      ctx: AzureCeToolContext,
    ) {
      try {
        const allowed =
          params.operation === 'prepare'
            ? ['basePlanId', 'basePlanSha256', 'cloudPlanId', 'cloudPlanSha256', 'operation']
            : ['basePlanId', 'basePlanSha256', 'operation', 'teardownPlanId', 'teardownPlanSha256'];
        if (Object.keys(params).some((key) => !allowed.includes(key)))
          throw new Error(`Azure CE teardown ${params.operation} parameters differ`);
        const { plan } = await loadPlanArtifact(ctx.sessionManager, params.basePlanId, params.basePlanSha256);
        if (plan.intent.operation !== 'deploy')
          throw new Error('Azure CE teardown requires the original deployment plan');
        const platform = await dependencies.platform(pi, signal);
        const storage = await platform.storage(azureUpgradeBinding(plan).owner);
        const runtime = await platform.runtime(plan.engine, plan.intent.platformContext);
        const contract = await dependencies.contract(signal);
        if (params.operation === 'prepare') {
          const cloud =
            plan.engine === 'native' && params.cloudPlanId && params.cloudPlanSha256
              ? (await loadPlanArtifact(ctx.sessionManager, params.cloudPlanId, params.cloudPlanSha256)).plan
              : undefined;
          if (plan.engine === 'native' && !cloud)
            throw new Error('Native Azure teardown requires the exact reviewed cloud teardown plan');
          if (plan.engine === 'terraform' && (params.cloudPlanId || params.cloudPlanSha256))
            throw new Error('Terraform Azure teardown does not accept a separate cloud plan');
          const teardown =
            plan.engine === 'terraform'
              ? await dependencies.prepare(plan, runtime, contract, storage, signal)
              : await dependencies.prepareNative(plan, cloud as never, runtime, contract, storage, signal);
          const artifactId = await ctx.sessionManager.saveArtifact(
            JSON.stringify({
              kind: teardown.kind,
              engine: teardown.engine,
              planId: teardown.planId,
              planSha256: teardown.planSha256,
              sourcePlanSha256: teardown.sourcePlanSha256,
              siteCount: teardown.retirement.length,
              listenerCount: teardown.drain.listeners.length,
              originCount: teardown.drain.origins.length,
              routingCount: teardown.drain.sites.reduce((sum, site) => sum + site.routing.length, 0),
            }),
            'azure-ce-teardown-plan',
          );
          if (!artifactId) throw new Error('Azure CE teardown plan artifact persistence failed');
          return {
            content: [
              {
                type: 'text' as const,
                text: `Teardown plan ID: ${teardown.planId}\nSHA-256: ${teardown.planSha256}\nArtifact: artifact://${artifactId}`,
              },
            ],
            details: {
              tool: 'azure_ce_teardown',
              operation: 'prepare',
              artifactId,
              planId: teardown.planId,
              planSha256: teardown.planSha256,
            },
          };
        }
        if (!params.teardownPlanId || !params.teardownPlanSha256)
          throw new Error('Azure CE teardown apply requires the exact teardown plan identity');
        const teardown = (await storage.read(`${params.teardownPlanId}.json`)) as
          | AzureTerraformTeardownPlan
          | AzureNativeTeardownPlan;
        if (
          teardown.planId !== params.teardownPlanId ||
          !safeHexEqual(teardown.planSha256, params.teardownPlanSha256) ||
          teardown.sourcePlanSha256 !== plan.planSha256
        )
          throw new Error('Persisted Azure CE teardown plan identity differs');
        const authorizationName = `${teardown.planId}-authorization.json`;
        const authorization = await optional(storage, authorizationName);
        if (authorization === undefined) {
          if (ctx.hasUI) {
            if (
              !(await ctx.ui.confirm(
                'Apply immutable Azure CE teardown plan',
                `${teardown.planId}\n${teardown.planSha256}`,
              ))
            )
              throw new Error('Azure CE teardown was not approved');
          } else if (process.env.XCSH_CE_HEADLESS_MUTATIONS !== '1' || process.env.XCSH_CE_ALLOW_DESTROY !== '1') {
            throw new Error('Headless Azure CE teardown requires mutation and destroy authorization');
          }
          await storage.write(authorizationName, {
            schemaVersion: 1,
            engine: plan.engine,
            sourcePlanSha256: plan.planSha256,
            teardownPlanSha256: teardown.planSha256,
            mutations: true,
          });
        } else if (
          !authorization ||
          typeof authorization !== 'object' ||
          (authorization as Record<string, unknown>).schemaVersion !== 1 ||
          (authorization as Record<string, unknown>).engine !== plan.engine ||
          (authorization as Record<string, unknown>).sourcePlanSha256 !== plan.planSha256 ||
          (authorization as Record<string, unknown>).teardownPlanSha256 !== teardown.planSha256 ||
          (authorization as Record<string, unknown>).mutations !== true
        ) {
          throw new Error('Persisted Azure CE teardown authorization differs');
        }
        const result =
          plan.engine === 'terraform'
            ? await dependencies.run(
                plan,
                teardown as AzureTerraformTeardownPlan,
                params.teardownPlanSha256,
                runtime,
                contract,
                await (await dependencies.terraform(pi, signal)).open(
                  azureUpgradeBinding(plan).owner,
                  await azureTerraformCurrentDeployment(plan),
                  'current',
                ),
                storage,
                dependencies.makeApi(ctx.cwd),
                process.env,
                signal,
              )
            : await dependencies.runNative(
                plan,
                (
                  await loadPlanArtifact(
                    ctx.sessionManager,
                    (teardown as AzureNativeTeardownPlan).cloudPlanId,
                    (teardown as AzureNativeTeardownPlan).cloudPlanSha256,
                  )
                ).plan,
                teardown as AzureNativeTeardownPlan,
                params.teardownPlanSha256,
                runtime,
                contract,
                storage,
                async (signal) => {
                  const native = teardown as AzureNativeTeardownPlan;
                  const { plan: cloud } = await loadPlanArtifact(
                    ctx.sessionManager,
                    native.cloudPlanId,
                    native.cloudPlanSha256,
                  );
                  if (!(await loadCheckpoint(ctx.sessionManager, cloud.planId, cloud.planSha256)))
                    await saveCheckpoint(ctx.sessionManager, {
                      schemaVersion: AZURE_CE_SCHEMA_VERSION,
                      engine: 'native',
                      authorization: { apply: true, terms: false, destroy: true },
                      planId: cloud.planId,
                      planSha256: cloud.planSha256,
                      completedActionIds: [],
                      state: 'running',
                    });
                  const api = withAzureCeExecution(dependencies.makeApi(ctx.cwd), signal);
                  const applied = await dependencies.applyNative(
                    { planId: cloud.planId, planSha256: cloud.planSha256 },
                    ctx,
                    api,
                    platform,
                    signal,
                  );
                  if (applied.checkpoint.state !== 'complete')
                    throw new Error('Azure native cloud teardown remains partial');
                  return observeAzureNativeGroupAbsence(plan, api, signal);
                },
                signal,
              );
        const artifactId = await ctx.sessionManager.saveArtifact(
          JSON.stringify(result),
          'azure-ce-teardown-checkpoint',
        );
        if (!artifactId) throw new Error('Azure CE teardown checkpoint artifact persistence failed');
        return {
          content: [{ type: 'text' as const, text: `Azure CE teardown ${plan.deploymentName}: ${result.status}.` }],
          details: { tool: 'azure_ce_teardown', operation: 'apply', artifactId, ...result },
        };
      } catch (error) {
        signal?.throwIfAborted();
        return {
          content: [
            {
              type: 'text' as const,
              text: `Azure CE teardown failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
          details: { tool: 'azure_ce_teardown', operation: params.operation },
        };
      }
    },
  };
}
