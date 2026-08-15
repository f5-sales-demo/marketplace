import type { AzExecApi } from '../az/exec';
import type { PluginInterface } from '../az/types';
import { loadCheckpoint, loadPlanArtifact } from '../ce/artifacts';
import { sha256Hex } from '../ce/canonical';
import { makeExecApi } from './shared';

async function commandJson(api: AzExecApi, args: string[]): Promise<unknown> {
  const result = await api.exec('az', [...args, '--output', 'json']);
  if (result.exitCode !== 0) return { error: true, digest: sha256Hex(`${result.stdout}\n${result.stderr}`) };
  try { return JSON.parse(result.stdout); } catch { return { error: 'Azure returned invalid JSON' }; }
}

export function summarizeF5Evidence(raw: unknown) {
  const item = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const nodes = Array.isArray(item.nodes) ? item.nodes as Array<Record<string, unknown>> : [];
  return {
    siteState: typeof item.siteState === 'string' ? item.siteState : 'UNKNOWN',
    nodes: nodes.map((node) => ({
      name: String(node.name ?? ''), registration: String(node.registration ?? 'UNKNOWN'), health: String(node.health ?? 'UNKNOWN'),
    })),
    bgpEstablished: Boolean(item.bgpEstablished),
    learnedRouteCount: Number(item.learnedRouteCount ?? 0),
  };
}

function azureSummary(resources: unknown, vms: unknown, peers: unknown) {
  const resourceItems = Array.isArray(resources) ? resources as Array<Record<string, unknown>> : [];
  const vmItems = Array.isArray(vms) ? vms as Array<Record<string, unknown>> : [];
  const peerItems = Array.isArray(peers) ? peers as Array<Record<string, unknown>> : [];
  return {
    resources: resourceItems.map((item) => ({ id: item.id, name: item.name, type: item.type, provisioningState: item.provisioningState })),
    vms: vmItems.map((item) => ({ name: item.name, powerState: item.powerState, provisioningState: item.provisioningState, zones: item.zones })),
    routeServerPeers: peerItems.map((item) => ({ name: item.name, provisioningState: item.provisioningState, peerAsn: item.peerAsn, peerIp: item.peerIp })),
  };
}

export function createAzureCeStatusTool(pi: PluginInterface, makeApi: (cwd: string) => AzExecApi = makeExecApi) {
  const { Type } = pi.typebox;
  return {
    name: 'azure_ce_status', label: 'Azure Customer Edge Status',
    description: 'Correlate owned Azure resources, VM state, Route Server peers, persisted checkpoints, and non-secret F5 site/node/BGP/route health evidence.',
    parameters: Type.Object({ planId: Type.String(), planSha256: Type.String(), f5Evidence: Type.Optional(Type.Object({ siteState: Type.Optional(Type.String()), nodes: Type.Optional(Type.Array(Type.Object({ name: Type.String(), registration: Type.String(), health: Type.String() }))), bgpEstablished: Type.Optional(Type.Boolean()), learnedRouteCount: Type.Optional(Type.Number()) })) }),
    async execute(_id: string, params: { planId: string; planSha256: string; f5Evidence?: unknown }, _signal: AbortSignal | undefined, _update: unknown, ctx: any) {
      try {
        const { plan } = await loadPlanArtifact(ctx.sessionManager, params.planId, params.planSha256);
        const api = makeApi(ctx.cwd);
        const [resources, vms, peers, checkpoint] = await Promise.all([
          commandJson(api, ['resource', 'list', '--resource-group', plan.intent.resourceGroup, '--subscription', plan.subscription.id]),
          commandJson(api, ['vm', 'list', '--resource-group', plan.intent.resourceGroup, '--show-details', '--subscription', plan.subscription.id]),
          plan.routing.mode === 'route-server'
            ? commandJson(api, ['network', 'routeserver', 'peering', 'list', '--resource-group', plan.intent.resourceGroup, '--routeserver', `${plan.deploymentName}-rs`, '--subscription', plan.subscription.id])
            : Promise.resolve([]),
          loadCheckpoint(ctx.sessionManager, plan.planId, plan.planSha256),
        ]);
        const azure = azureSummary(resources, vms, peers);
        const evidence = { planId: plan.planId, checkpoint: checkpoint ?? { state: 'not-started', completedActionIds: [] }, azure, f5: summarizeF5Evidence(params.f5Evidence) };
        return { content: [{ type: 'text' as const, text: `Azure CE ${plan.deploymentName}: ${azure.vms.length}/${plan.topology.nodeCount} VM records, ${azure.routeServerPeers.length} Route Server peers, checkpoint ${evidence.checkpoint.state}.` }], details: { tool: 'azure_ce_status', evidence } };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: `Azure CE status failed: ${error instanceof Error ? error.message : String(error)}` }], isError: true, details: { tool: 'azure_ce_status' } };
      }
    },
  };
}
