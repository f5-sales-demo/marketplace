// biome-ignore-all lint: Generated Bun bundle; lint the source modules instead.
// @bun

import { loadAwsPlan } from './runtime-2srcqb9f.js';
import { awsPlatformService } from './runtime-w4s6e2gy.js';
import {
  AwsCeRevalidationError,
  awsTerraformService,
  executeAwsCeApply,
  executeAwsCeTerraformApply,
} from './runtime-y39p0vy5.js';
import './runtime-fex55vat.js';
import { makeExecApi } from './runtime-30f0rzjf.js';
import './runtime-ay1zjq29.js';

// plugins/aws/src/ce/native-apply-qualification.ts
function nativeAwsApplyQualification(plan, checkpoint) {
  const bound =
    plan.engine === 'native' &&
    checkpoint.engine === 'native' &&
    checkpoint.planId === plan.planId &&
    checkpoint.planSha256 === plan.planSha256;
  const ordered =
    bound &&
    checkpoint.completedActionIds.length <= plan.actions.length &&
    checkpoint.completedActionIds.every((id, index) => id === plan.actions[index].id);
  const complete =
    ordered && checkpoint.state === 'complete' && checkpoint.completedActionIds.length === plan.actions.length;
  const trafficGates = plan.actions.filter((action) => action.kind === 'traffic-gate');
  const trafficGateCompleted =
    ordered &&
    plan.intent.ingress?.mode === 'nlb' &&
    trafficGates.length === 1 &&
    checkpoint.completedActionIds.includes(trafficGates[0].id);
  return {
    installation: { status: complete ? 'complete' : 'incomplete' },
    healthScope: 'site-global-only',
    nodeHealth: 'unknown',
    traffic: {
      status: 'unknown',
      gateCompleted: trafficGateCompleted,
      reason:
        plan.intent.ingress?.mode !== 'nlb'
          ? 'no-ingress-probe-configured'
          : trafficGateCompleted
            ? 'checkpointed-probe-is-not-current-live-evidence'
            : 'traffic-gate-not-complete',
    },
  };
}

// plugins/aws/src/tools/aws-ce-apply.ts
function createAwsCeApplyTool(pi, makeApi = makeExecApi) {
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
    async execute(_id, params, signal, _update, ctx) {
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
                type: 'text',
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
              type: 'text',
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
              type: 'text',
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

export { createAwsCeApplyTool };
