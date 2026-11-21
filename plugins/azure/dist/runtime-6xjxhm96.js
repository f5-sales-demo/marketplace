// biome-ignore-all lint: Generated Bun bundle; lint the source modules instead.
// @bun

import { sha256Hex } from './runtime-6j4b2rhv.js';
import { makeExecApi } from './runtime-2139fbqg.js';
import {
  azureUpgradeBinding,
  collectAzurePlatformHealth,
  collectAzureRouteServerHealth,
  loadCheckpoint,
  loadPlanArtifact,
} from './runtime-34064jyj.js';
import { azurePlatformService } from './runtime-hxhs7mq0.js';
import { withAzureCeExecution } from './runtime-tdt4p3w8.js';

// plugins/azure/src/ce/terraform-status.ts
async function readAzureTerraformWorkflowStatus(plan, storage) {
  if (plan.engine !== 'terraform') throw new Error('Terraform checkpoint requires the owning engine');
  await storage.verify();
  let value;
  try {
    value = await storage.read('terraform-workflow.json');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return { state: 'not-started', engine: 'terraform', source: 'terraform-workflow.json' };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed Terraform workflow');
  const record = value;
  if (
    record.schemaVersion !== 1 ||
    record.engine !== 'terraform' ||
    record.planSha256 !== plan.planSha256 ||
    typeof record.configurationSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(record.configurationSha256) ||
    !['network-pending', 'registration-pending', 'registered'].includes(String(record.stage))
  )
    throw new Error('Terraform workflow identity differs from the owning plan');
  return {
    state: String(record.stage),
    engine: 'terraform',
    source: 'terraform-workflow.json',
    planSha256: plan.planSha256,
    configurationSha256: record.configurationSha256,
  };
}

// plugins/azure/src/tools/azure-ce-status.ts
async function commandJson(api, args) {
  const result = await api.exec('az', [...args, '--output', 'json']);
  if (result.exitCode !== 0)
    return {
      error: true,
      digest: sha256Hex(`${result.stdout}
${result.stderr}`),
    };
  try {
    return JSON.parse(result.stdout);
  } catch {
    return { error: 'Azure returned invalid JSON' };
  }
}
function azureSummary(plan, resources, vms, peers) {
  const resourceItems = Array.isArray(resources) ? resources : [];
  const vmItems = Array.isArray(vms) ? vms : [];
  const peerItems = Array.isArray(peers) ? peers : [];
  const ownerPlanSha256s = new Set([
    plan.planSha256,
    ...plan.actions.flatMap((action) =>
      action.expectedOwnerPlanSha256 && /^[a-f0-9]{64}$/.test(action.expectedOwnerPlanSha256)
        ? [action.expectedOwnerPlanSha256]
        : [],
    ),
  ]);
  const owned = (item) => {
    if (!item || typeof item !== 'object') return false;
    const tags = item.tags;
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
      resources: Array.isArray(resources) ? 'available' : 'unavailable',
      vms: Array.isArray(vms) ? 'available' : 'unavailable',
      routeServerPeers: Array.isArray(peers) ? 'available' : 'unavailable',
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
function createAzureCeStatusTool2(pi, makeApi = makeExecApi) {
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
    async execute(_id, params, signal, _update, ctx) {
      try {
        if ('f5Evidence' in params)
          throw new Error('Caller-supplied F5 health evidence is unsupported; status collects live observations');
        const { plan } = await loadPlanArtifact(ctx.sessionManager, params.planId, params.planSha256);
        const api = withAzureCeExecution(makeApi(ctx.cwd), signal, 120000);
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
          plan.engine === 'native' ? loadCheckpoint(ctx.sessionManager, plan) : Promise.resolve(undefined),
        ]);
        const azure = azureSummary(plan, resources, vms, peers);
        const routing = await collectAzureRouteServerHealth(plan, api, signal);
        let f5;
        let observedCheckpoint = checkpoint;
        if (plan.engine === 'terraform') {
          try {
            const service = await azurePlatformService(pi, signal);
            observedCheckpoint = await readAzureTerraformWorkflowStatus(
              plan,
              await service.storage(azureUpgradeBinding(plan).owner, { readOnly: true }),
            );
          } catch (error) {
            if (signal?.aborted) throw error;
            observedCheckpoint = { state: 'unknown', engine: 'terraform', reason: 'workflow-evidence-unavailable' };
          }
        }
        try {
          const service = await azurePlatformService(pi, signal);
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
          routingMode: plan.routing.mode,
          checkpoint: observedCheckpoint ?? {
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
              type: 'text',
              text: `Azure CE ${plan.deploymentName}: ${azure.vms.length}/${plan.topology.nodeCount} VM records, ${azure.routeServerPeers.length} Route Server peers, checkpoint ${evidence.checkpoint.state}. Coverage: resources ${azure.coverage.resources}, VMs ${azure.coverage.vms}, Route Server peers ${azure.coverage.routeServerPeers}.`,
            },
          ],
          details: { tool: 'azure_ce_status', evidence },
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
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

export { createAzureCeStatusTool2 };
