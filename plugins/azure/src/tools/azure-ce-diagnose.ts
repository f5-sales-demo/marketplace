import type { AzExecApi } from '../az/exec';
import type { PluginInterface } from '../az/types';
import { type AzureCeToolContext, loadPlanArtifact } from '../ce/artifacts';
import { sha256Hex } from '../ce/canonical';
import { summarizeF5Evidence } from './azure-ce-status';
import { makeExecApi } from './shared';

interface ActiveTarget {
  destinationIp: string;
  protocol: 'TCP' | 'UDP';
  destinationPort: number;
  direction: 'Inbound' | 'Outbound';
  localPort: number;
}

function validateActiveTarget(target: ActiveTarget): void {
  if (
    !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(target.destinationIp) ||
    target.destinationIp.split('.').some((part) => Number(part) > 255)
  )
    throw new Error('Active diagnostic destinationIp must be an IPv4 address');
  for (const [label, port] of [
    ['destinationPort', target.destinationPort],
    ['localPort', target.localPort],
  ] as const) {
    if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error(`${label} must be between 1 and 65535`);
  }
}

async function collect(api: AzExecApi, args: string[], category: string) {
  const result = await api.exec('az', args);
  const text = `${result.stdout}\n${result.stderr}`;
  return {
    category,
    ok: result.exitCode === 0,
    bytes: Buffer.byteLength(text),
    digest: sha256Hex(text),
    cloudInitFinished: /cloud-init.*finish|status:\s*done/i.test(text),
    errorsDetected: /cloud-init.*(?:error|fail)|provisioningstate.*failed/i.test(text),
  };
}

async function diagnosticSourceIp(
  api: AzExecApi,
  resourceGroup: string,
  nicName: string,
  subscriptionId: string,
): Promise<string> {
  const result = await api.exec('az', [
    'network',
    'nic',
    'show',
    '--resource-group',
    resourceGroup,
    '--name',
    nicName,
    '--query',
    'ipConfigurations[0].privateIPAddress',
    '--output',
    'tsv',
    '--subscription',
    subscriptionId,
  ]);
  const value = result.stdout.trim();
  if (
    result.exitCode !== 0 ||
    !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value) ||
    value.split('.').some((part) => Number(part) > 255)
  )
    throw new Error(`Unable to resolve a safe diagnostic source IP for ${nicName}`);
  return value;
}

export function createAzureCeDiagnoseTool(pi: PluginInterface, makeApi: (cwd: string) => AzExecApi = makeExecApi) {
  const { Type } = pi.typebox;
  return {
    name: 'azure_ce_diagnose',
    label: 'Diagnose Azure Customer Edge',
    description:
      'Run passive or explicitly approved active CE diagnostics across VM provisioning, boot, NIC/effective NSG/routes, Network Watcher, Route Server/BGP, and supplied non-secret F5 evidence. Raw guest/user data is never returned.',
    parameters: Type.Object({
      planId: Type.String(),
      planSha256: Type.String(),
      mode: Type.Union([Type.Literal('passive'), Type.Literal('active')]),
      activeTarget: Type.Optional(
        Type.Object({
          destinationIp: Type.String(),
          protocol: Type.Union([Type.Literal('TCP'), Type.Literal('UDP')]),
          destinationPort: Type.Number(),
          direction: Type.Union([Type.Literal('Inbound'), Type.Literal('Outbound')]),
          localPort: Type.Number(),
        }),
      ),
      f5Evidence: Type.Optional(
        Type.Object({
          siteState: Type.Optional(Type.String()),
          nodes: Type.Optional(
            Type.Array(Type.Object({ name: Type.String(), registration: Type.String(), health: Type.String() })),
          ),
          bgpEstablished: Type.Optional(Type.Boolean()),
          learnedRouteCount: Type.Optional(Type.Number()),
        }),
      ),
    }),
    async execute(
      _id: string,
      params: {
        planId: string;
        planSha256: string;
        mode: 'passive' | 'active';
        activeTarget?: ActiveTarget;
        f5Evidence?: unknown;
      },
      _signal: AbortSignal | undefined,
      _update: unknown,
      ctx: AzureCeToolContext,
    ) {
      try {
        const { plan } = await loadPlanArtifact(ctx.sessionManager, params.planId, params.planSha256);
        if (params.mode === 'active') {
          if (!ctx.hasUI && process.env.XCSH_AZURE_CE_HEADLESS_MUTATIONS !== '1')
            throw new Error('Active headless diagnostics require XCSH_AZURE_CE_HEADLESS_MUTATIONS=1');
          if (
            ctx.hasUI &&
            !(await ctx.ui.confirm(
              'Run active CE diagnostics',
              'Run Azure VM Run Command and Network Watcher checks? These operations may create diagnostic state.',
            ))
          )
            throw new Error('Active diagnostics were not approved');
          if (params.activeTarget) validateActiveTarget(params.activeTarget);
        }
        const api = makeApi(ctx.cwd);
        const commands: Array<{ category: string; args: string[] }> = [];
        for (let node = 1; node <= plan.topology.nodeCount; node++) {
          const vmName = `${plan.deploymentName}-${node}`;
          commands.push({
            category: `vm-${node}-instance-view`,
            args: [
              'vm',
              'get-instance-view',
              '--resource-group',
              plan.intent.resourceGroup,
              '--name',
              vmName,
              '--subscription',
              plan.subscription.id,
              '--output',
              'json',
            ],
          });
          commands.push({
            category: `vm-${node}-boot`,
            args: [
              'vm',
              'boot-diagnostics',
              'get-boot-log',
              '--resource-group',
              plan.intent.resourceGroup,
              '--name',
              vmName,
              '--subscription',
              plan.subscription.id,
            ],
          });
          for (let nic = 0; nic < plan.nics.length; nic++) {
            commands.push({
              category: `vm-${node}-nic-${nic}-nsg`,
              args: [
                'network',
                'nic',
                'list-effective-nsg',
                '--resource-group',
                plan.intent.resourceGroup,
                '--name',
                `${vmName}-nic${nic}`,
                '--subscription',
                plan.subscription.id,
                '--output',
                'json',
              ],
            });
            commands.push({
              category: `vm-${node}-nic-${nic}-routes`,
              args: [
                'network',
                'nic',
                'show-effective-route-table',
                '--resource-group',
                plan.intent.resourceGroup,
                '--name',
                `${vmName}-nic${nic}`,
                '--subscription',
                plan.subscription.id,
                '--output',
                'json',
              ],
            });
          }
          if (params.mode === 'active') {
            commands.push({
              category: `vm-${node}-cloud-init-status`,
              args: [
                'vm',
                'run-command',
                'invoke',
                '--resource-group',
                plan.intent.resourceGroup,
                '--name',
                vmName,
                '--command-id',
                'RunShellScript',
                '--scripts',
                'cloud-init status --long',
                '--subscription',
                plan.subscription.id,
                '--output',
                'json',
              ],
            });
            if (params.activeTarget) {
              const diagnosticNic = `${vmName}-nic${plan.nics.length > 1 ? 1 : 0}`;
              const sourceIp = await diagnosticSourceIp(
                api,
                plan.intent.resourceGroup,
                diagnosticNic,
                plan.subscription.id,
              );
              commands.push({
                category: `vm-${node}-next-hop`,
                args: [
                  'network',
                  'watcher',
                  'show-next-hop',
                  '--resource-group',
                  plan.intent.resourceGroup,
                  '--vm',
                  vmName,
                  '--nic',
                  diagnosticNic,
                  '--source-ip',
                  sourceIp,
                  '--dest-ip',
                  params.activeTarget.destinationIp,
                  '--subscription',
                  plan.subscription.id,
                  '--output',
                  'json',
                ],
              });
              commands.push({
                category: `vm-${node}-ip-flow`,
                args: [
                  'network',
                  'watcher',
                  'test-ip-flow',
                  '--resource-group',
                  plan.intent.resourceGroup,
                  '--vm',
                  vmName,
                  '--nic',
                  diagnosticNic,
                  '--direction',
                  params.activeTarget.direction,
                  '--protocol',
                  params.activeTarget.protocol,
                  '--local',
                  `${sourceIp}:${params.activeTarget.localPort}`,
                  '--remote',
                  `${params.activeTarget.destinationIp}:${params.activeTarget.destinationPort}`,
                  '--subscription',
                  plan.subscription.id,
                  '--output',
                  'json',
                ],
              });
            }
          }
        }
        if (plan.routing.mode === 'route-server') {
          commands.push({
            category: 'route-server-peers',
            args: [
              'network',
              'routeserver',
              'peering',
              'list',
              '--resource-group',
              plan.intent.resourceGroup,
              '--routeserver',
              `${plan.deploymentName}-rs`,
              '--subscription',
              plan.subscription.id,
              '--output',
              'json',
            ],
          });
          for (let node = 1; node <= plan.topology.nodeCount; node++)
            commands.push({
              category: `route-server-peer-${node}-learned-routes`,
              args: [
                'network',
                'routeserver',
                'peering',
                'list-learned-routes',
                '--resource-group',
                plan.intent.resourceGroup,
                '--routeserver',
                `${plan.deploymentName}-rs`,
                '--name',
                `${plan.deploymentName}-${node}`,
                '--subscription',
                plan.subscription.id,
                '--output',
                'json',
              ],
            });
        }
        const diagnostics = [];
        for (const command of commands) diagnostics.push(await collect(api, command.args, command.category));
        const failures = diagnostics.filter((item) => !item.ok || item.errorsDetected);
        return {
          content: [
            {
              type: 'text' as const,
              text: `Azure CE diagnostics completed in ${params.mode} mode: ${diagnostics.length} checks, ${failures.length} failures/findings. Raw boot and guest output was withheld.`,
            },
          ],
          details: {
            tool: 'azure_ce_diagnose',
            mode: params.mode,
            diagnostics,
            f5: summarizeF5Evidence(params.f5Evidence),
          },
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Azure CE diagnostics failed safely: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
          details: { tool: 'azure_ce_diagnose' },
        };
      }
    },
  };
}
