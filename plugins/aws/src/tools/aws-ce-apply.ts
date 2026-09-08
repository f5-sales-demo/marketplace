import type { AwsExecApi } from '../aws/exec';
import type { PluginInterface } from '../aws/types';
import type { AwsCeApplyInput } from '../ce/apply';
import { executeAwsCeApply } from '../ce/apply';
import type { AwsCeToolContext } from '../ce/artifacts';
import { awsPlatformService } from '../ce/platform';
import { makeExecApi } from './shared';

export function createAwsCeApplyTool(pi: PluginInterface, makeApi: (cwd: string) => AwsExecApi = makeExecApi) {
  const { Type } = pi.typebox;
  return {
    name: 'aws_ce_apply',
    label: 'Apply AWS Customer Edge Plan',
    description:
      'Apply or resume only the exact persisted AWS CE plan ID and SHA-256 after revalidating identity, source digests, SSM/AMI, agreement, limits, routes, TGW/NLB state, platform capabilities, and ownership.',
    parameters: Type.Object({
      planId: Type.String(),
      planSha256: Type.String(),
    }),
    async execute(
      _id: string,
      params: AwsCeApplyInput,
      signal: AbortSignal | undefined,
      _update: unknown,
      ctx: AwsCeToolContext,
    ) {
      try {
        const { plan, checkpoint } = await executeAwsCeApply(
          params,
          ctx,
          makeApi(ctx.cwd),
          await awsPlatformService(pi, signal),
          fetch,
          signal,
        );
        return {
          content: [
            {
              type: 'text' as const,
              text: `AWS CE ${plan.deploymentName}: ${checkpoint.state}; ${checkpoint.completedActionIds.length}/${plan.actions.length} immutable actions checkpointed.`,
            },
          ],
          details: { tool: 'aws_ce_apply', planId: plan.planId, planSha256: plan.planSha256, checkpoint },
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `AWS CE apply failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
          details: { tool: 'aws_ce_apply' },
        };
      }
    },
  };
}
