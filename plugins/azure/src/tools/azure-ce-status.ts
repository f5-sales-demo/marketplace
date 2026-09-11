import type { AzExecApi } from '../az/exec';
import type { PluginInterface } from '../az/types';
import { type AzureCeToolContext, loadCheckpoint, loadPlanArtifact } from '../ce/artifacts';
import { sha256Hex } from '../ce/canonical';
import { withAzureCeExecution } from '../ce/execution';
import { azurePlatformService } from '../ce/platform';
import { collectAzurePlatformHealth } from '../ce/platform-health';
import { collectAzureRouteServerHealth } from '../ce/route-server-health';
import type { AzureCePlan } from '../ce/types';
import { makeExecApi } from './shared';

async function commandJson(api: AzExecApi, args: string[]): Promise<unknown> {
  const result = await api.exec('az', [...args, '--output', 'json']);
  if (result.exitCode !== 0)
    return {
      error: true,
      digest: sha256Hex(`${result.stdout}\n${result.stderr}`),
    };
  try {
    return JSON.parse(result.stdout);
  } catch {
    return { error: 'Azure returned invalid JSON' };
  }
}

export function azureSummary(plan: AzureCePlan, resources: unknown, vms: unknown, peers: unknown) {
  const resourceItems = Array.isArray(resources) ? (resources as Array<Record<string, unknown>>) : [];
  const vmItems = Array.isArray(vms) ? (vms as Array<Record<string, unknown>>) : [];
  const peerItems = Array.isArray(peers) ? (peers as Array<Record<string, unknown>>) : [];
  const ownerPlanSha256s = new Set([
    plan.planSha256,
    ...plan.actions.flatMap((action) =>
      action.expectedOwnerPlanSha256 && /^[a-f0-9]{64}$/.test(action.expectedOwnerPlanSha256)
        ? [action.expectedOwnerPlanSha256]
        : [],
    ),
  ]);
  const owned = (item: Record<string, unknown>) => {
    if (!item || typeof item !== 'object') return false;
    const tags = item.tags as Record<string, unknown> | undefined;
    const scope = `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/`.toLowerCase();
    return (
      typeof item.id === 'string' &&
      item.id.toLowerCase().startsWith(scope) &&
      tags?.['xcsh-managed-by'] === 'azure-ce' &&
      tags?.['xcsh-deployment-id'] === plan.deploymentName &&
      tags?.['xcsh-execution-engine'] === plan.engine &&
      typeof tags?.['xcsh-plan-sha256'] === 'string' &&
      ownerPlanSha256s.has(tags['xcsh-plan-sha256'])
    );
  };
  return {
    coverage: {
      resources: Array.isArray(resources) ? 'observed' : 'unknown',
      vms: Array.isArray(vms) ? 'observed' : 'unknown',
      peers: Array.isArray(peers) ? 'observed' : 'unknown',
    },
    resources: resourceItems.filter(owned).map((item) => ({
      id: item.id,
      name: item.name,
      type: item.type,
      provisioningState: item.provisioningState,
    })),
    vms: vmItems.filter(owned).map((item) => ({
      name: item.name,
      powerState: item.powerState,
      provisioningState: item.provisioningState,
      zones: item.zones,
    })),
    routeServerPeers: peerItems
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({
        name: item.name,
        provisioningState: item.provisioningState,
        peerAsn: item.peerAsn,
        peerIp: item.peerIp,
      })),
  };
}

export function createAzureCeStatusTool(pi: PluginInterface, makeApi: (cwd: string) => AzExecApi = makeExecApi) {
  const { Type } = pi.typebox;
  return {
    name: 'azure_ce_status',
    label: 'Azure Customer Edge Status',
    description:
      'Correlate owned Azure resources, VM state, Route Server peers, persisted checkpoints, and non-secret F5 site/node/BGP/route health evidence.',
    parameters: Type.Object({
      planId: Type.String(),
      planSha256: Type.String(),
    }),
    async execute(
      _id: string,
      params: { planId: string; planSha256: string; f5Evidence?: unknown },
      signal: AbortSignal | undefined,
      _update: unknown,
      ctx: AzureCeToolContext,
    ) {
      try {
        if ('f5Evidence' in params)
          throw new Error('Caller-supplied F5 health evidence is unsupported; status collects live observations');
        const { plan } = await loadPlanArtifact(ctx.sessionManager, params.planId, params.planSha256);
        const api = withAzureCeExecution(makeApi(ctx.cwd), signal, 120_000);
        const [resources, vms, peers, checkpoint] = await Promise.all([
          commandJson(api, [
            'resource',
            'list',
            '--resource-group',
            plan.intent.resourceGroup,
            '--subscription',
            plan.subscription.id,
          ]),
          commandJson(api, [
            'vm',
            'list',
            '--resource-group',
            plan.intent.resourceGroup,
            '--show-details',
            '--subscription',
            plan.subscription.id,
          ]),
          plan.routing.mode === 'route-server'
            ? commandJson(api, [
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
              ])
            : Promise.resolve([]),
          loadCheckpoint(ctx.sessionManager, plan.planId, plan.planSha256),
        ]);
        const azure = azureSummary(plan, resources, vms, peers);
        const routing = await collectAzureRouteServerHealth(plan, api, signal);
        let f5: unknown;
        try {
          const service = await azurePlatformService(pi as unknown as Record<string, unknown>, signal);
          const runtime = await service.runtime(plan.engine, plan.intent.platformContext);
          f5 = await collectAzurePlatformHealth(plan, vms, runtime, signal);
        } catch (error) {
          if (signal?.aborted) throw error;
          f5 = {
            status: 'unknown',
            reason: 'platform-service-unavailable',
            bgp: 'unknown',
            routes: 'unknown',
            traffic: 'unknown',
          };
        }
        const evidence = {
          planId: plan.planId,
          checkpoint: checkpoint ?? {
            state: 'not-started',
            completedActionIds: [],
          },
          azure,
          f5,
          routing,
        };
        return {
          content: [
            {
              type: 'text' as const,
              text: `Azure CE ${plan.deploymentName}: ${azure.vms.length}/${plan.topology.nodeCount} VM records, ${azure.routeServerPeers.length} Route Server peers, checkpoint ${evidence.checkpoint.state}.`,
            },
          ],
          details: { tool: 'azure_ce_status', evidence },
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Azure CE status failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
          details: { tool: 'azure_ce_status' },
        };
      }
    },
  };
}
