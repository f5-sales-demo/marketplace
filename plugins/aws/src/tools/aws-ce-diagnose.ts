import type { AwsExecApi } from '../aws/exec';
import type { PluginInterface } from '../aws/types';
import type { AwsCeToolContext } from '../ce/artifacts';
import { loadAwsCheckpoint, loadAwsPlan } from '../ce/artifacts';
import { sha256Hex } from '../ce/canonical';
import { makeExecApi } from './shared';

async function collect(api: AwsExecApi, args: string[], category: string) {
  const result = await api.exec('aws', args);
  const raw = `${result.stdout}\n${result.stderr}`;
  return {
    category,
    ok: result.exitCode === 0,
    bytes: Buffer.byteLength(raw),
    digest: sha256Hex(raw),
    errorsDetected: /error|fail|unhealthy|down/i.test(raw),
  };
}

export function createAwsCeDiagnoseTool(pi: PluginInterface, makeApi: (cwd: string) => AwsExecApi = makeExecApi) {
  const { Type } = pi.typebox;
  return {
    name: 'aws_ce_diagnose',
    label: 'Diagnose AWS Customer Edge',
    description:
      'Run passive AWS CE diagnostics or separately approved active SSM connectivity checks. Covers EC2 boot/status, ENIs/routes/security groups, NLB, TGW/Connect/BGP, and supplied F5 evidence while withholding console output, user data, and secrets.',
    parameters: Type.Object({
      planId: Type.String(),
      planSha256: Type.String(),
      mode: Type.Union([Type.Literal('passive'), Type.Literal('active')]),
      activeTarget: Type.Optional(
        Type.Object({
          destinationIp: Type.String(),
          destinationPort: Type.Number(),
          protocol: Type.Union([Type.Literal('tcp'), Type.Literal('udp')]),
        }),
      ),
    }),
    async execute(
      _id: string,
      params: {
        planId: string;
        planSha256: string;
        mode: 'passive' | 'active';
        activeTarget?: { destinationIp: string; destinationPort: number; protocol: 'tcp' | 'udp' };
      },
      _signal: AbortSignal | undefined,
      _update: unknown,
      ctx: AwsCeToolContext,
    ) {
      try {
        const { plan } = await loadAwsPlan(ctx.sessionManager, params.planId, params.planSha256);
        if (params.mode === 'active') {
          if (
            !params.activeTarget ||
            !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(params.activeTarget.destinationIp) ||
            params.activeTarget.destinationIp.split('.').some((part) => Number(part) > 255) ||
            !Number.isInteger(params.activeTarget.destinationPort) ||
            params.activeTarget.destinationPort < 1 ||
            params.activeTarget.destinationPort > 65535
          )
            throw new Error('Active diagnostics require a valid IPv4 destination and port');
          if (!ctx.hasUI && process.env.XCSH_CE_HEADLESS_MUTATIONS !== '1')
            throw new Error('Active headless diagnostics require XCSH_CE_HEADLESS_MUTATIONS=1');
          if (
            ctx.hasUI &&
            !(await ctx.ui.confirm(
              'Run active AWS CE diagnostics',
              'Run a bounded SSM connectivity check on owned CE nodes?',
            ))
          )
            throw new Error('Active diagnostics were not approved');
        }
        const api = makeApi(ctx.cwd);
        const checkpoint = await loadAwsCheckpoint(ctx.sessionManager, plan.planId, plan.planSha256);
        const ownedInstances = [
          ...new Set([
            ...plan.ownershipInventory
              .filter((item) => item.owned && /^i-[0-9a-f]{8,17}$/.test(item.resourceId))
              .map((item) => item.resourceId),
            ...Object.entries(checkpoint?.resolvedValues ?? {})
              .filter(([key, value]) => key.startsWith('__INSTANCE_') && /^i-[0-9a-f]{8,17}$/.test(value))
              .map(([, value]) => value),
          ]),
        ].sort();
        const commands: Array<{ category: string; args: string[] }> = [
          {
            category: 'instance-status',
            args: [
              'ec2',
              'describe-instance-status',
              '--include-all-instances',
              '--filters',
              `Name=tag:xcsh-deployment-id,Values=${plan.deploymentName}`,
              '--region',
              plan.region,
              '--output',
              'json',
            ],
          },
          {
            category: 'network-interfaces',
            args: [
              'ec2',
              'describe-network-interfaces',
              '--filters',
              `Name=tag:xcsh-deployment-id,Values=${plan.deploymentName}`,
              '--region',
              plan.region,
              '--output',
              'json',
            ],
          },
          {
            category: 'route-tables',
            args: [
              'ec2',
              'describe-route-tables',
              '--filters',
              `Name=tag:xcsh-deployment-id,Values=${plan.deploymentName}`,
              '--region',
              plan.region,
              '--output',
              'json',
            ],
          },
        ];
        for (const instanceId of ownedInstances) {
          commands.push({
            category: `${instanceId}-console`,
            args: [
              'ec2',
              'get-console-output',
              '--instance-id',
              instanceId,
              '--latest',
              '--region',
              plan.region,
              '--output',
              'json',
            ],
          });
          if (params.mode === 'active' && params.activeTarget) {
            const command =
              params.activeTarget.protocol === 'tcp'
                ? `timeout 10 bash -c '</dev/tcp/${params.activeTarget.destinationIp}/${params.activeTarget.destinationPort}'`
                : `timeout 10 nc -zvu ${params.activeTarget.destinationIp} ${params.activeTarget.destinationPort}`;
            commands.push({
              category: `${instanceId}-active`,
              args: [
                'ssm',
                'send-command',
                '--instance-ids',
                instanceId,
                '--document-name',
                'AWS-RunShellScript',
                '--parameters',
                JSON.stringify({ commands: [command] }),
                '--timeout-seconds',
                '20',
                '--region',
                plan.region,
                '--output',
                'json',
              ],
            });
          }
        }
        if (plan.routing.profile === 'nlb-ingress')
          commands.push({
            category: 'nlb',
            args: [
              'elbv2',
              'describe-load-balancers',
              '--names',
              `${plan.deploymentName}-nlb`,
              '--region',
              plan.region,
              '--output',
              'json',
            ],
          });
        if (plan.routing.profile.startsWith('tgw-'))
          commands.push({
            category: 'tgw',
            args: [
              'ec2',
              'describe-transit-gateway-attachments',
              '--filters',
              `Name=tag:xcsh-deployment-id,Values=${plan.deploymentName}`,
              '--region',
              plan.region,
              '--output',
              'json',
            ],
          });
        const results = [];
        for (const command of commands) results.push(await collect(api, command.args, command.category));
        return {
          content: [
            {
              type: 'text' as const,
              text: `AWS CE diagnostics collected ${results.length} redacted evidence digest(s); ${results.filter((item) => !item.ok || item.errorsDetected).length} require review. Raw console output, SSM output, and user data were withheld.`,
            },
          ],
          details: { tool: 'aws_ce_diagnose', mode: params.mode, results },
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `AWS CE diagnostics failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
          details: { tool: 'aws_ce_diagnose' },
        };
      }
    },
  };
}
