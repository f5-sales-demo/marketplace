import type { CePlatformService } from '../../../platform/src/ce/service';
import type { CeTerraformService } from '../../../terraform/src/service';
import type { AzExecApi } from '../az/exec';
import type { PluginInterface } from '../az/types';
import { type AzureCeToolContext, loadPlanArtifact } from '../ce/artifacts';
import { canonicalSha256, safeHexEqual } from '../ce/canonical';
import { withAzureCeExecution } from '../ce/execution';
import {
  type AzureCeFailoverPlan,
  azureFailoverOwner,
  buildAzureCeFailoverPlan,
  collectAzureFailoverAcceptance,
  observeAzureFailoverVm,
  observeAzureFailoverVmState,
  requireAzureFailoverExecutionContract,
  runAzureCeFailover,
  verifyAzureCeFailoverPlan,
} from '../ce/failover';
import { azurePlatformService, azureTerraformService } from '../ce/platform';
import { createAzureTerraformFailoverController } from '../ce/terraform-failover';
import { makeExecApi } from './shared';

interface Dependencies {
  platform(pi: PluginInterface, signal?: AbortSignal): Promise<CePlatformService>;
  terraform(pi: PluginInterface, signal?: AbortSignal): Promise<CeTerraformService>;
  makeApi(cwd: string): AzExecApi;
}
const defaults: Dependencies = {
  platform: azurePlatformService,
  terraform: azureTerraformService,
  makeApi: makeExecApi,
};
async function optional(storage: Awaited<ReturnType<CePlatformService['storage']>>, name: string) {
  try {
    return await storage.read(name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

export function createAzureCeFailoverTool(pi: PluginInterface, dependencies: Dependencies = defaults) {
  const { Type } = pi.typebox;
  return {
    name: 'azure_ce_failover',
    label: 'Validate Azure Customer Edge Failover',
    description:
      'Prepare or execute an immutable, engine-owned Azure CE outage plan with exact VM identity, durable six-to-four-to-six Route Server evidence, effective routes, content-bound traffic, and Terraform state release.',
    parameters: Type.Object({
      operation: Type.Union([Type.Literal('prepare'), Type.Literal('apply')]),
      basePlanId: Type.String(),
      basePlanSha256: Type.String(),
      nodeIndex: Type.Optional(Type.Number()),
      failoverPlanId: Type.Optional(Type.String()),
      failoverPlanSha256: Type.Optional(Type.String()),
    }),
    async execute(
      _id: string,
      params: {
        operation: 'prepare' | 'apply';
        basePlanId: string;
        basePlanSha256: string;
        nodeIndex?: number;
        failoverPlanId?: string;
        failoverPlanSha256?: string;
      },
      signal: AbortSignal | undefined,
      _update: unknown,
      ctx: AzureCeToolContext,
    ) {
      try {
        const allowed =
          params.operation === 'prepare'
            ? ['basePlanId', 'basePlanSha256', 'nodeIndex', 'operation']
            : ['basePlanId', 'basePlanSha256', 'failoverPlanId', 'failoverPlanSha256', 'operation'];
        if (Object.keys(params).some((key) => !allowed.includes(key)))
          throw new Error(`Azure CE failover ${params.operation} parameters differ`);
        const { plan } = await loadPlanArtifact(ctx.sessionManager, params.basePlanId, params.basePlanSha256);
        const platform = await dependencies.platform(pi, signal);
        const storage = await platform.storage(azureFailoverOwner(plan));
        const api = withAzureCeExecution(dependencies.makeApi(ctx.cwd), signal);
        if (params.operation === 'prepare') {
          if (!Number.isInteger(params.nodeIndex)) throw new Error('Failover preparation requires an exact nodeIndex');
          const evidence = await observeAzureFailoverVm(plan, params.nodeIndex as number, api, signal);
          const failover = buildAzureCeFailoverPlan(plan, evidence);
          const existing = await optional(storage, `${failover.planId}.json`);
          if (existing === undefined) await storage.write(`${failover.planId}.json`, failover);
          else if (canonicalSha256(existing) !== canonicalSha256(failover))
            throw new Error('Persisted Azure CE failover plan differs');
          await storage.write(`${failover.planId}-preparation-evidence.json`, evidence);
          const artifactId = await ctx.sessionManager.saveArtifact(
            JSON.stringify({
              kind: failover.kind,
              engine: failover.engine,
              planId: failover.planId,
              planSha256: failover.planSha256,
              sourcePlanSha256: failover.sourcePlanSha256,
              nodeIndex: failover.nodeIndex,
              vmResourceId: failover.vmResourceId,
              vmId: failover.vmId,
              evidence: { source: evidence.source, observedAt: evidence.observedAt, powerState: evidence.powerState },
            }),
            'azure-ce-failover-plan',
          );
          if (!artifactId) throw new Error('Azure CE failover plan artifact persistence failed');
          return {
            content: [
              {
                type: 'text' as const,
                text: `Failover plan ID: ${failover.planId}\nSHA-256: ${failover.planSha256}\nNode: ${failover.nodeIndex}\nArtifact: artifact://${artifactId}`,
              },
            ],
            details: {
              tool: 'azure_ce_failover',
              operation: 'prepare',
              artifactId,
              planId: failover.planId,
              planSha256: failover.planSha256,
            },
          };
        }
        if (!params.failoverPlanId || !params.failoverPlanSha256)
          throw new Error('Failover apply requires the exact failover plan identity');
        const failover = (await storage.read(`${params.failoverPlanId}.json`)) as AzureCeFailoverPlan;
        verifyAzureCeFailoverPlan(plan, failover);
        if (failover.planId !== params.failoverPlanId || !safeHexEqual(failover.planSha256, params.failoverPlanSha256))
          throw new Error('Persisted Azure CE failover plan identity differs');
        const routing = await storage.read('platform-routing.json');
        requireAzureFailoverExecutionContract(plan, failover, routing);
        const authorizationName = `${failover.planId}-authorization.json`;
        const expectedAuthorization = {
          schemaVersion: 1,
          engine: plan.engine,
          sourcePlanSha256: plan.planSha256,
          failoverPlanSha256: failover.planSha256,
          mutations: true,
        };
        const authorization = await optional(storage, authorizationName);
        if (authorization === undefined) {
          if (!ctx.hasUI && process.env.XCSH_CE_HEADLESS_MUTATIONS !== '1')
            throw new Error('Headless Azure CE failover requires XCSH_CE_HEADLESS_MUTATIONS=1');
          if (
            ctx.hasUI &&
            !(await ctx.ui.confirm(
              'Execute planned Azure CE failover',
              `${failover.planId}\n${failover.planSha256}\nNode ${failover.nodeIndex}`,
            ))
          )
            throw new Error('Azure CE failover was not approved');
          await storage.write(authorizationName, expectedAuthorization);
        } else if (canonicalSha256(authorization) !== canonicalSha256(expectedAuthorization))
          throw new Error('Persisted Azure CE failover authorization differs');
        const runtime = await platform.runtime(plan.engine, plan.intent.platformContext);
        const observe = (currentSignal?: AbortSignal) =>
          observeAzureFailoverVmState(plan, failover, api, currentSignal);
        const collect = (phase: 'baseline' | 'outage' | 'recovered', currentSignal?: AbortSignal) =>
          collectAzureFailoverAcceptance(plan, failover, routing, phase, runtime, storage, api, currentSignal);
        let mutate: (phase: 'stop' | 'start', currentSignal?: AbortSignal) => Promise<void>;
        let release: (currentSignal?: AbortSignal) => Promise<void> = async () => {};
        if (plan.engine === 'terraform') {
          const controller = await createAzureTerraformFailoverController(
            plan,
            failover,
            await dependencies.terraform(pi, signal),
            storage,
            observe,
            process.env,
            signal,
          );
          mutate = controller.mutate;
          release = controller.release;
        } else {
          mutate = async (phase, currentSignal) => {
            await observe(currentSignal);
            const result = await api.exec(
              'az',
              [
                'vm',
                phase === 'stop' ? 'deallocate' : 'start',
                '--ids',
                failover.vmResourceId,
                '--subscription',
                plan.subscription.id,
                '--output',
                'json',
              ],
              currentSignal ? { signal: currentSignal } : undefined,
            );
            if (result.exitCode !== 0) throw new Error(`Azure native failover ${phase} request failed`);
          };
        }
        const result = await runAzureCeFailover(
          plan,
          failover,
          params.failoverPlanSha256,
          storage,
          observe,
          mutate,
          collect,
          release,
          signal,
        );
        const artifactId = await ctx.sessionManager.saveArtifact(JSON.stringify(result), 'azure-ce-failover-receipt');
        if (!artifactId) throw new Error('Azure CE failover receipt persistence failed');
        return {
          content: [
            {
              type: 'text' as const,
              text: `Azure CE node ${failover.nodeIndex}: ${result.status}; BGP sessions 6 → 4 → 6 and content-bound traffic passed.`,
            },
          ],
          details: { tool: 'azure_ce_failover', operation: 'apply', artifactId, ...result },
        };
      } catch (error) {
        signal?.throwIfAborted();
        return {
          content: [
            {
              type: 'text' as const,
              text: `Azure CE failover failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
          details: { tool: 'azure_ce_failover', operation: params.operation },
        };
      }
    },
  };
}
