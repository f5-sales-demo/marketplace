import type { AwsExecApi } from '../aws/exec';
import type { PluginInterface } from '../aws/types';
import type { AwsCeApplyInput } from '../ce/apply';
import { executeAwsCeApply } from '../ce/apply';
import { type AwsCeToolContext, loadAwsPlan } from '../ce/artifacts';
import { nativeAwsApplyQualification } from '../ce/native-apply-qualification';
import { AwsCeRevalidationError } from '../ce/observation-rejection';
import { awsPlatformService } from '../ce/platform';
import { awsTerraformService, executeAwsCeTerraformApply } from '../ce/terraform-apply';
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
        const selected = await loadAwsPlan(ctx.sessionManager, params.planId, params.planSha256);
        if (selected.plan.engine === 'terraform') {
          const result = await executeAwsCeTerraformApply(
            params,
            ctx,
            makeApi(ctx.cwd),
            await awsPlatformService(pi, signal),
            await awsTerraformService(pi, signal),
            fetch,
            signal,
          );
          return {
            content: [
              {
                type: 'text' as const,
                text: `AWS CE Terraform ${selected.plan.deploymentName}: ${result.status}. Collected routing and ingress evidence is included; traffic acceptance remains separate.`,
              },
            ],
            details: { tool: 'aws_ce_apply', ...result },
          };
        }
        const { plan, checkpoint } = await executeAwsCeApply(
          params,
          ctx,
          makeApi(ctx.cwd),
          await awsPlatformService(pi, signal),
          fetch,
          signal,
        );
        const qualification = nativeAwsApplyQualification(plan, checkpoint);
        return {
          content: [
            {
              type: 'text' as const,
              text: `AWS CE ${plan.deploymentName}: ${qualification.installation.status} installation; ${checkpoint.completedActionIds.length}/${plan.actions.length} immutable actions checkpointed. Global site health does not establish node health. ${plan.intent.ingress?.mode === 'nlb' ? 'Traffic probe completion is recorded in the checkpoint; current traffic requires a fresh observation.' : 'No ingress probe is configured; traffic qualification remains unknown.'}`,
            },
          ],
          details: {
            tool: 'aws_ce_apply',
            planId: plan.planId,
            planSha256: plan.planSha256,
            checkpoint,
            qualification,
          },
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
          details: {
            tool: 'aws_ce_apply',
            ...(error instanceof AwsCeRevalidationError ? { revalidation: error.diagnostic } : {}),
          },
        };
      }
    },
  };
}
