import type { AwsExecApi } from '../aws/exec';
import type { PluginInterface } from '../aws/types';
import type { AwsCeApplyInput } from '../ce/apply';
import { executeAwsCeApply } from '../ce/apply';
import type { AwsCeToolContext } from '../ce/artifacts';
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
      bootstrapRefs: Type.Optional(Type.Array(Type.Object({ node: Type.Number(), reference: Type.String() }))),
      f5Capabilities: Type.Object({
        smsv2ContractVersion: Type.Literal('v2'),
        supportedProviders: Type.Array(Type.Union([Type.Literal('aws'), Type.Literal('azure')])),
        bootstrapDrivers: Type.Array(Type.Literal('console')),
        providerNetworkingProfiles: Type.Object({
          aws: Type.Optional(Type.Array(Type.String())),
          azure: Type.Optional(Type.Array(Type.String())),
        }),
        awsSmsv2TgwConnect: Type.Object({
          supported: Type.Boolean(),
          schemaVersion: Type.Union([Type.String(), Type.Null()]),
        }),
      }),
      f5Evidence: Type.Optional(
        Type.Object({
          registeredNodes: Type.Optional(Type.Array(Type.Number())),
          healthyNodes: Type.Optional(Type.Array(Type.Number())),
          bgpEstablished: Type.Optional(Type.Boolean()),
          nlbHealthy: Type.Optional(Type.Boolean()),
          tgwRoutesHealthy: Type.Optional(Type.Boolean()),
          trafficHealthy: Type.Optional(Type.Boolean()),
        }),
      ),
    }),
    async execute(
      _id: string,
      params: AwsCeApplyInput,
      _signal: AbortSignal | undefined,
      _update: unknown,
      ctx: AwsCeToolContext,
    ) {
      try {
        const { plan, checkpoint } = await executeAwsCeApply(params, ctx, makeApi(ctx.cwd));
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
