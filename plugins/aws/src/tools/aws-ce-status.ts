import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { AwsExecApi } from '../aws/exec';
import type { PluginInterface } from '../aws/types';
import type { AwsCeToolContext } from '../ce/artifacts';
import { loadAwsCheckpoint, loadAwsPlan } from '../ce/artifacts';
import { collectAwsCeInventory } from '../ce/inventory';
import { awsPlatformService } from '../ce/platform';
import { collectAwsCeStatus } from '../ce/status';
import { makeExecApi } from './shared';

export function createAwsCeStatusTool(pi: PluginInterface, makeApi: (cwd: string) => AwsExecApi = makeExecApi) {
  const { Type } = pi.typebox;
  return {
    name: 'aws_ce_status',
    label: 'AWS Customer Edge Status',
    description:
      'Collect scoped AWS instance/interface identities and shared-platform registration/site health. Caller-supplied health is rejected; unavailable routing, traffic or platform evidence remains unknown.',
    parameters: Type.Object({
      planId: Type.Optional(Type.String()),
      planSha256: Type.Optional(Type.String()),
      site: Type.Optional(
        Type.Object({
          accountId: Type.String(),
          awsProfile: Type.String(),
          region: Type.String(),
          siteName: Type.String(),
          platformContext: Type.Optional(Type.String()),
        }),
      ),
    }),
    async execute(
      _id: string,
      params: {
        planId?: string;
        planSha256?: string;
        site?: { accountId: string; awsProfile: string; region: string; siteName: string; platformContext?: string };
      },
      signal: AbortSignal | undefined,
      _update: unknown,
      ctx: AwsCeToolContext,
    ) {
      try {
        if (Object.hasOwn(params, 'f5Evidence')) throw new Error('Caller-supplied F5 health evidence is unsupported');
        if (params.site) {
          if (params.planId || params.planSha256 || !/^[a-z][a-z0-9-]{0,62}$/.test(params.site.siteName))
            throw new Error('Select a saved plan or an inventory site');
          const scope = params.site;
          const inventory = await collectAwsCeInventory(
            { accountId: scope.accountId, awsProfile: scope.awsProfile, regions: [scope.region] },
            makeApi(ctx.cwd),
            signal,
          );
          const nodes = inventory.nodes.filter((node) => node.siteName === scope.siteName);
          let platform: Record<string, unknown> = { status: 'unknown', reason: 'platform-service-unavailable' };
          try {
            platform = await (
              await (await awsPlatformService(pi, signal)).runtime('native', scope.platformContext)
            ).observeReadOnlySite(
              scope.siteName,
              nodes.map((node) => node.instanceId),
              signal,
            );
          } catch {
            signal?.throwIfAborted();
          }
          return {
            content: [
              {
                type: 'text' as const,
                text: `AWS CE ${scope.siteName}: ${nodes.length} inventory-selected node(s); F5 evidence ${platform.status}. Ownership remains as observed; this selection is read-only.`,
              },
            ],
            details: {
              tool: 'aws_ce_status',
              status: {
                observedAt: inventory.collectedAt,
                scope,
                ownership: nodes.map((node) => ({
                  instanceId: node.instanceId,
                  ownership: node.ownership,
                  engine: node.engine,
                })),
                aws: { status: 'observed', nodes },
                f5: platform,
                canSatisfyMutationGate: false,
              },
            },
          };
        }
        if (!params.planId || !params.planSha256) throw new Error('An exact saved plan or inventory site is required');
        const { plan } = await loadAwsPlan(ctx.sessionManager, params.planId, params.planSha256, 'inspect');
        if (Number(plan.schemaVersion) === 1)
          return {
            content: [
              {
                type: 'text' as const,
                text: `Legacy AWS CE plan ${plan.planId} is integrity-valid and inspectable. Rediscover and replan with schema v2 before mutation.`,
              },
            ],
            details: {
              tool: 'aws_ce_status',
              status: {
                schemaVersion: 1,
                planId: plan.planId,
                engine: 'unrecorded',
                capability: 'inspection-only',
                canSatisfyMutationGate: false,
              },
            },
          };
        const checkpoint = await loadAwsCheckpoint(ctx.sessionManager, plan.planId, plan.planSha256);
        let runtime: CeRuntime | undefined;
        try {
          runtime = await (await awsPlatformService(pi, signal)).runtime(plan.engine, plan.intent.platformContext);
        } catch {
          signal?.throwIfAborted();
        }
        const status = await collectAwsCeStatus(plan, checkpoint, makeApi(ctx.cwd), runtime, signal);
        return {
          content: [
            {
              type: 'text' as const,
              text: `AWS CE ${plan.deploymentName}: cloud evidence ${status.aws.status}; registration ${status.f5.registration.status}; site health ${status.f5.health.status}. Routing evidence ${status.routing.status}; traffic evidence remains unknown.`,
            },
          ],
          details: { tool: 'aws_ce_status', status },
        };
      } catch {
        signal?.throwIfAborted();
        return {
          content: [
            {
              type: 'text' as const,
              text: 'AWS CE status is unavailable. Use the exact persisted plan and tool-collected evidence.',
            },
          ],
          isError: true,
          details: { tool: 'aws_ce_status' },
        };
      }
    },
  };
}
