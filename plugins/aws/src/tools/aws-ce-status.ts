import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { AwsExecApi } from '../aws/exec';
import type { PluginInterface } from '../aws/types';
import type { AwsCeToolContext } from '../ce/artifacts';
import { loadAwsCheckpoint, loadAwsPlan } from '../ce/artifacts';
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
    parameters: Type.Object({ planId: Type.String(), planSha256: Type.String() }),
    async execute(
      _id: string,
      params: { planId: string; planSha256: string },
      signal: AbortSignal | undefined,
      _update: unknown,
      ctx: AwsCeToolContext,
    ) {
      try {
        if (Object.hasOwn(params, 'f5Evidence')) throw new Error('Caller-supplied F5 health evidence is unsupported');
        const { plan } = await loadAwsPlan(ctx.sessionManager, params.planId, params.planSha256);
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
