import type { CePlatformService } from '../../../platform/src/ce/service';
import type { AzExecApi } from '../az/exec';
import type { PluginInterface } from '../az/types';
import { type AzureCeToolContext, loadPlanArtifact } from '../ce/artifacts';
import { canonicalSha256, safeHexEqual } from '../ce/canonical';
import { withAzureCeExecution } from '../ce/execution';
import {
  type AzureCeFailoverPlan,
  azureFailoverOwner,
  buildAzureCeFailoverPlan,
  observeAzureFailoverVm,
  requireAzureFailoverExecutionContract,
  verifyAzureCeFailoverPlan,
} from '../ce/failover';
import { azurePlatformService } from '../ce/platform';
import { makeExecApi } from './shared';

interface Dependencies {
  platform(pi: PluginInterface, signal?: AbortSignal): Promise<CePlatformService>;
  makeApi(cwd: string): AzExecApi;
}
const defaults: Dependencies = { platform: azurePlatformService, makeApi: makeExecApi };
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
      'Prepare an immutable, engine-owned Azure CE outage plan from a live VM identity. Apply fails closed until published platform SLO routing and collected Route Server session, route, and traffic evidence can prove outage and recovery.',
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
        if (params.operation === 'prepare') {
          if (!Number.isInteger(params.nodeIndex)) throw new Error('Failover preparation requires an exact nodeIndex');
          const evidence = await observeAzureFailoverVm(
            plan,
            params.nodeIndex as number,
            withAzureCeExecution(dependencies.makeApi(ctx.cwd), signal),
            signal,
          );
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
        requireAzureFailoverExecutionContract(plan, failover);
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
