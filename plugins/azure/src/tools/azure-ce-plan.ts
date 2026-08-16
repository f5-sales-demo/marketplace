import type { PluginInterface } from '../az/types';
import { loadDiscoveryArtifact, savePlanArtifact } from '../ce/artifacts';
import { compileAzureCePlan } from '../ce/planner';
import type { AzureCeIntent } from '../ce/types';

export function createAzureCePlanTool(pi: PluginInterface) {
  const { Type } = pi.typebox;
  const subnet = Type.Object({
    mode: Type.Union([Type.Literal('greenfield'), Type.Literal('brownfield')]),
    name: Type.Optional(Type.String()),
    cidr: Type.Optional(Type.String()),
    resourceId: Type.Optional(Type.String()),
    vnetResourceId: Type.Optional(Type.String()),
  });
  const nic = Type.Object({
    name: Type.String(),
    role: Type.Union(['slo', 'sli', 'management', 'data', 'cluster', 'other'].map((value) => Type.Literal(value))),
    vrf: Type.Optional(Type.String()),
    subnet,
  });
  return {
    name: 'azure_ce_plan',
    label: 'Plan Azure Customer Edge',
    description:
      'Compile normalized natural-language intent and a live discovery artifact into a canonical, immutable, secret-free Azure Customer Edge plan. Users never need to author YAML.',
    parameters: Type.Object({
      discoveryArtifactId: Type.String(),
      intent: Type.Object({
        schemaVersion: Type.Number({ minimum: 1, maximum: 1 }),
        operation: Type.Union(
          [
            'deploy',
            'reconcile',
            'start',
            'stop',
            'resize',
            'update-network',
            'replace-node',
            'repair',
            'teardown',
          ].map((value) => Type.Literal(value)),
        ),
        subscriptionId: Type.String(),
        deploymentName: Type.String(),
        siteName: Type.String(),
        namespace: Type.String(),
        resourceGroup: Type.String(),
        region: Type.Optional(Type.String()),
        topology: Type.Object({ ha: Type.Boolean() }),
        nics: Type.Array(nic, { minItems: 1, maxItems: 8 }),
        egress: Type.Object({
          mode: Type.Union(['public-ip', 'nat-gateway', 'firewall', 'proxy'].map((value) => Type.Literal(value))),
          resourceId: Type.Optional(Type.String()),
        }),
        routing: Type.Object({
          mode: Type.Union(['auto', 'udr', 'route-server'].map((value) => Type.Literal(value))),
          destinationCidrs: Type.Array(Type.String()),
          localAsn: Type.Optional(Type.Number()),
          peerAsn: Type.Optional(Type.Number()),
        }),
        securityRules: Type.Array(
          Type.Object({
            name: Type.String(),
            purpose: Type.Union(
              ['application-vip', 'management', 'intra-cluster', 'platform-connectivity'].map((value) =>
                Type.Literal(value),
              ),
            ),
            direction: Type.Union([Type.Literal('Inbound'), Type.Literal('Outbound')]),
            protocol: Type.Union([Type.Literal('Tcp'), Type.Literal('Udp'), Type.Literal('*')]),
            sourceCidrs: Type.Array(Type.String()),
            destinationCidrs: Type.Array(Type.String()),
            destinationPorts: Type.Array(Type.String()),
          }),
        ),
        image: Type.Object({ publisher: Type.String(), offer: Type.String(), plan: Type.String() }),
        vm: Type.Object({ size: Type.String(), zones: Type.Optional(Type.Array(Type.String())) }),
        brownfield: Type.Object({
          resourceIds: Type.Array(Type.String()),
          routeChanges: Type.Array(
            Type.Object({
              routeTableId: Type.String(),
              subnetId: Type.String(),
              routeName: Type.String(),
              destinationCidr: Type.String(),
            }),
          ),
        }),
        replacementNode: Type.Optional(Type.Number()),
      }),
    }),
    async execute(
      _id: string,
      params: { discoveryArtifactId: string; intent: AzureCeIntent },
      _signal: AbortSignal | undefined,
      _update: unknown,
      ctx: { sessionManager: Parameters<typeof loadDiscoveryArtifact>[0] },
    ) {
      try {
        const observation = await loadDiscoveryArtifact(ctx.sessionManager, params.discoveryArtifactId);
        const plan = compileAzureCePlan(params.intent, observation);
        const artifactId = await savePlanArtifact(ctx.sessionManager, plan, observation);
        const warnings = plan.warnings.length
          ? `\nWarnings:\n${plan.warnings.map((warning) => `- ${warning}`).join('\n')}`
          : '';
        const costs = plan.billableResources.map((item) => `${item.count} ${item.type}`).join(', ');
        return {
          content: [
            {
              type: 'text' as const,
              text: `Plan ID: ${plan.planId}\nSHA-256: ${plan.planSha256}\nRegion: ${plan.region}\nTopology: ${plan.topology.nodeCount} node(s), ${plan.nics.length} NIC(s) each\nPinned image: ${plan.image.urn}\nBillable resources: ${costs}\nOrdered actions: ${plan.actions.length}${warnings}\nPlan artifact: ${artifactId ? `artifact://${artifactId}` : 'session memory only'}`,
            },
          ],
          details: { tool: 'azure_ce_plan', artifactId, plan },
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Azure CE planning failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
          details: { tool: 'azure_ce_plan' },
        };
      }
    },
  };
}
