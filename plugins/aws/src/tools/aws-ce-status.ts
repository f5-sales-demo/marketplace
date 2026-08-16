import type { AwsExecApi } from '../aws/exec';
import type { PluginInterface } from '../aws/types';
import type { AwsCeToolContext } from '../ce/artifacts';
import { loadAwsCheckpoint, loadAwsPlan } from '../ce/artifacts';
import { sha256Hex } from '../ce/canonical';
import { makeExecApi } from './shared';

async function evidence(api: AwsExecApi, args: string[]) {
  const result = await api.exec('aws', [...args, '--output', 'json']);
  const raw = `${result.stdout}\n${result.stderr}`;
  let count = 0;
  if (result.exitCode === 0) {
    try {
      const value = JSON.parse(result.stdout) as Record<string, unknown>;
      const array = Object.values(value).find(Array.isArray);
      count = Array.isArray(array) ? array.length : 0;
    } catch {
      // Evidence remains digest-only when AWS returns malformed JSON.
    }
  }
  return { ok: result.exitCode === 0, count, bytes: Buffer.byteLength(raw), digest: sha256Hex(raw) };
}

export function createAwsCeStatusTool(pi: PluginInterface, makeApi: (cwd: string) => AwsExecApi = makeExecApi) {
  const { Type } = pi.typebox;
  return {
    name: 'aws_ce_status',
    label: 'AWS Customer Edge Status',
    description:
      'Correlate tagged EC2/ENI resources, NLB targets, TGW attachments/peers/routes, persisted checkpoints, and supplied non-secret F5 registration, health, BGP, and routing evidence.',
    parameters: Type.Object({
      planId: Type.String(),
      planSha256: Type.String(),
      f5Evidence: Type.Optional(
        Type.Object({
          siteState: Type.Optional(Type.String()),
          registeredNodes: Type.Optional(Type.Array(Type.Number())),
          healthyNodes: Type.Optional(Type.Array(Type.Number())),
          bgpSessionsEstablished: Type.Optional(Type.Number()),
          learnedRouteCount: Type.Optional(Type.Number()),
          advertisedRouteCount: Type.Optional(Type.Number()),
        }),
      ),
    }),
    async execute(
      _id: string,
      params: { planId: string; planSha256: string; f5Evidence?: Record<string, unknown> },
      _signal: AbortSignal | undefined,
      _update: unknown,
      ctx: AwsCeToolContext,
    ) {
      try {
        const { plan } = await loadAwsPlan(ctx.sessionManager, params.planId, params.planSha256);
        const api = makeApi(ctx.cwd);
        const checkpoint = await loadAwsCheckpoint(ctx.sessionManager, plan.planId, plan.planSha256);
        const targetGroupArn = checkpoint?.resolvedValues.__NLB_TARGET_GROUP_ARN__;
        const filters = [
          '--filters',
          `Name=tag:xcsh-managed-by,Values=aws-ce`,
          `Name=tag:xcsh-deployment-id,Values=${plan.deploymentName}`,
          `Name=tag:xcsh-plan-sha256,Values=${plan.planSha256}`,
          '--region',
          plan.region,
        ];
        const [instances, enis, nlb, tgw, peers] = await Promise.all([
          evidence(api, ['ec2', 'describe-instances', ...filters]),
          evidence(api, ['ec2', 'describe-network-interfaces', ...filters]),
          plan.routing.profile === 'nlb-ingress' && targetGroupArn
            ? evidence(api, [
                'elbv2',
                'describe-target-health',
                '--target-group-arn',
                targetGroupArn,
                '--region',
                plan.region,
              ])
            : Promise.resolve(undefined),
          plan.routing.profile.startsWith('tgw-')
            ? evidence(api, [
                'ec2',
                'describe-transit-gateway-attachments',
                '--filters',
                `Name=tag:xcsh-deployment-id,Values=${plan.deploymentName}`,
                '--region',
                plan.region,
              ])
            : Promise.resolve(undefined),
          plan.routing.profile === 'tgw-connect'
            ? evidence(api, ['ec2', 'describe-transit-gateway-connect-peers', '--region', plan.region])
            : Promise.resolve(undefined),
        ]);
        const status = {
          checkpoint: checkpoint ?? { state: 'not-started', completedActionIds: [] },
          aws: { instances, enis, nlb, tgw, peers },
          f5: params.f5Evidence ?? {},
        };
        return {
          content: [
            {
              type: 'text' as const,
              text: `AWS CE ${plan.deploymentName}: ${instances.count} instance record(s), ${enis.count} ENI record(s), checkpoint ${status.checkpoint.state}. Raw cloud output was withheld.`,
            },
          ],
          details: { tool: 'aws_ce_status', status },
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `AWS CE status failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
          details: { tool: 'aws_ce_status' },
        };
      }
    },
  };
}
