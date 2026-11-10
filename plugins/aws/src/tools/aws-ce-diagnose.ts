import type { AwsExecApi } from '../aws/exec';
import type { PluginInterface } from '../aws/types';
import type { AwsCeToolContext } from '../ce/artifacts';
import { loadAwsCheckpoint, loadAwsPlan } from '../ce/artifacts';
import { sha256Hex } from '../ce/canonical';
import {
  observeDiagnosticInvocation,
  verifyDiagnosticInstance,
  verifyDiagnosticManagedNode,
} from '../ce/diagnostic-invocation';
import { collectAwsPassiveEvidence } from '../ce/passive-evidence';
import { scopedAwsApi } from '../ce/scoped-exec';
import { createAwsCeStatusTool } from './aws-ce-status';
import { makeExecApi } from './shared';

async function collect(api: AwsExecApi, args: string[], category: string) {
  const result = await api.exec('aws', args);
  const raw = `${result.stdout}\n${result.stderr}`;
  return {
    category,
    ok: result.exitCode === 0,
    bytes: Buffer.byteLength(raw),
    digest: sha256Hex(raw),
    health: 'unknown',
  };
}

export function createAwsCeDiagnoseTool(pi: PluginInterface, makeApi: (cwd: string) => AwsExecApi = makeExecApi) {
  const { Type } = pi.typebox;
  return {
    name: 'aws_ce_diagnose',
    label: 'Diagnose AWS Customer Edge',
    description:
      'Run passive AWS CE diagnostics or separately approved active SSM connectivity checks. Covers EC2 boot/status, ENIs/routes/security groups, NLB, TGW/Connect/BGP, and live platform observations while withholding console output, user data, and secrets.',
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
        planId?: string;
        planSha256?: string;
        site?: { accountId: string; awsProfile: string; region: string; siteName: string; platformContext?: string };
        mode: 'passive' | 'active';
        activeTarget?: { destinationIp: string; destinationPort: number; protocol: 'tcp' | 'udp' };
      },
      signal: AbortSignal | undefined,
      _update: unknown,
      ctx: AwsCeToolContext,
    ) {
      try {
        if (params.site) {
          if (params.mode !== 'passive' || params.activeTarget)
            throw new Error('Inventory-selected sites support passive diagnostics only');
          const observed = await createAwsCeStatusTool(pi, makeApi).execute(_id, params, signal, _update, ctx);
          const value = observed.details.status as
            | { aws?: { nodes?: Array<{ instanceId: string; interfaces: Array<{ id: string; vpcId: string }> }> } }
            | undefined;
          const nodes = value?.aws?.nodes ?? [];
          const passive = await collectAwsPassiveEvidence(
            {
              accountId: params.site.accountId,
              awsProfile: params.site.awsProfile,
              region: params.site.region,
              instanceIds: nodes.map((node) => node.instanceId),
              interfaceIds: nodes.flatMap((node) => node.interfaces.map((item) => item.id)),
              vpcIds: [...new Set(nodes.flatMap((node) => node.interfaces.map((item) => item.vpcId)))],
            },
            makeApi(ctx.cwd),
            signal,
          );
          return { ...observed, details: { tool: 'aws_ce_diagnose', status: observed.details.status, passive } };
        }
        if (!params.planId || !params.planSha256) throw new Error('A saved plan or inventory site is required');
        const { plan } = await loadAwsPlan(ctx.sessionManager, params.planId, params.planSha256);
        if (params.mode === 'active') {
          if (
            !params.activeTarget ||
            !['tcp', 'udp'].includes(params.activeTarget.protocol) ||
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
        const api = scopedAwsApi(makeApi(ctx.cwd), plan.intent.awsProfile, signal);
        const identity = await api.exec('aws', [
          'sts',
          'get-caller-identity',
          '--output',
          'json',
          '--region',
          plan.region,
        ]);
        if (identity.exitCode !== 0 || JSON.parse(identity.stdout).Account !== plan.accountId)
          throw new Error('Diagnostic account differs from plan');
        if (params.mode === 'active' && plan.engine !== 'native')
          throw new Error('Only the owning native engine may run guest commands');
        if (plan.engine === 'terraform') {
          const observed = await createAwsCeStatusTool(pi, makeApi).execute(
            _id,
            { planId: params.planId, planSha256: params.planSha256 },
            signal,
            _update,
            ctx,
          );
          if (observed.isError) return { ...observed, details: { tool: 'aws_ce_diagnose' } };
          const value = observed.details.status as {
            aws?: {
              status?: string;
              nodes?: Array<{ instanceId: string; state: string; interfaces: Array<{ id: string; vpcId?: string }> }>;
            };
          };
          const nodes = value.aws?.status === 'observed' ? (value.aws.nodes ?? []) : [];
          const passive = await collectAwsPassiveEvidence(
            {
              accountId: plan.accountId,
              awsProfile: plan.intent.awsProfile ?? 'default',
              region: plan.region,
              instanceIds: nodes.map((node) => node.instanceId),
              interfaceIds: nodes.flatMap((node) => node.interfaces.map((item) => item.id)),
              vpcIds: [
                ...new Set(
                  nodes.flatMap((node) => node.interfaces.flatMap((item) => (item.vpcId ? [item.vpcId] : []))),
                ),
              ],
            },
            makeApi(ctx.cwd),
            signal,
          );
          const results = [];
          for (const node of nodes.filter((node) => node.state === 'running')) {
            results.push(
              await collect(
                api,
                [
                  'ec2',
                  'get-console-output',
                  '--instance-id',
                  node.instanceId,
                  '--latest',
                  '--region',
                  plan.region,
                  '--output',
                  'json',
                ],
                `${node.instanceId}-console`,
              ),
            );
          }
          return {
            content: [
              {
                type: 'text' as const,
                text: 'AWS Terraform passive diagnostics use verified current workspace and cloud identities. Raw console and bootstrap material are withheld.',
              },
            ],
            details: { tool: 'aws_ce_diagnose', mode: params.mode, status: observed.details.status, passive, results },
          };
        }
        const checkpoint = await loadAwsCheckpoint(ctx.sessionManager, plan.planId, plan.planSha256);
        const ownedInstances = Array.from({ length: plan.topology.nodeCount }, (_, index) => ({
          node: index + 1,
          instanceId: checkpoint?.resolvedValues[`__INSTANCE_${index + 1}__`],
        })).filter((item): item is { node: number; instanceId: string } => typeof item.instanceId === 'string');
        if (new Set(ownedInstances.map((item) => item.instanceId)).size !== ownedInstances.length)
          throw new Error('Ambiguous diagnostic instance identities');
        if (params.mode === 'active' && ownedInstances.length !== plan.topology.nodeCount)
          throw new Error('Active diagnostics require all checkpointed instance identities');
        const commands: Array<{ category: string; args: string[] }> = [
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
        if (ownedInstances.length)
          commands.unshift({
            category: 'instance-status',
            args: [
              'ec2',
              'describe-instance-status',
              '--include-all-instances',
              '--instance-ids',
              ...ownedInstances.map((item) => item.instanceId),
              '--region',
              plan.region,
              '--output',
              'json',
            ],
          });
        for (const { instanceId, node } of ownedInstances) {
          await verifyDiagnosticInstance(api, plan, instanceId, node);
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
                JSON.stringify({ commands: [command], executionTimeout: ['20'] }),
                '--timeout-seconds',
                '30',
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
        for (const command of commands) {
          if (command.args[0] === 'ssm') {
            const instanceId = command.args[command.args.indexOf('--instance-ids') + 1];
            const node = ownedInstances.find((item) => item.instanceId === instanceId)?.node;
            if (!node || !params.activeTarget) throw new Error('Missing diagnostic execution binding');
            await verifyDiagnosticInstance(api, plan, instanceId, node);
            await verifyDiagnosticManagedNode(api, instanceId, plan.region);
            const submitted = await api.exec('aws', command.args);
            if (submitted.exitCode !== 0)
              throw new Error('SSM submission result is ambiguous; reconcile before retrying');
            const commandId = JSON.parse(submitted.stdout)?.Command?.CommandId;
            results.push(
              await observeDiagnosticInvocation(
                api,
                commandId,
                instanceId,
                plan.region,
                params.activeTarget.protocol,
                signal,
              ),
            );
          } else results.push(await collect(api, command.args, command.category));
        }
        const status = await createAwsCeStatusTool(pi, makeApi).execute(
          _id,
          { planId: params.planId, planSha256: params.planSha256 },
          signal,
          _update,
          ctx,
        );
        const bound = status.details.status as
          | { aws?: { nodes?: Array<{ instanceId: string; interfaces: Array<{ id: string; vpcId: string }> }> } }
          | undefined;
        const boundNodes = bound?.aws?.nodes ?? [];
        const passive = await collectAwsPassiveEvidence(
          {
            accountId: plan.accountId,
            awsProfile: plan.intent.awsProfile ?? 'default',
            region: plan.region,
            instanceIds: boundNodes.map((node) => node.instanceId),
            interfaceIds: boundNodes.flatMap((node) => node.interfaces.map((item) => item.id)),
            vpcIds: [...new Set(boundNodes.flatMap((node) => node.interfaces.map((item) => item.vpcId)))],
          },
          makeApi(ctx.cwd),
          signal,
        );
        return {
          content: [
            {
              type: 'text' as const,
              text: `AWS CE diagnostics collected ${results.length} redacted evidence digest(s); cloud and routing health are reported separately from command collection. Raw console output, SSM output, and user data were withheld.`,
            },
          ],
          details: {
            tool: 'aws_ce_diagnose',
            mode: params.mode,
            results,
            passive,
            status: status.details.status ?? { status: 'unknown' },
          },
        };
      } catch {
        signal?.throwIfAborted();
        return {
          content: [
            {
              type: 'text' as const,
              text: 'AWS CE diagnostics unavailable; verify the saved plan, scoped credentials and resource ownership. Do not blindly repeat an interrupted active command.',
            },
          ],
          isError: true,
          details: { tool: 'aws_ce_diagnose' },
        };
      }
    },
  };
}
