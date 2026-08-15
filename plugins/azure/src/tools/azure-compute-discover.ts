import type { AzExecApi } from '../az/exec';
import type { PluginInterface } from '../az/types';
import { saveDiscoveryArtifact } from '../ce/artifacts';
import { type AzureComputeDiscoveryInput, discoverAzureCompute } from '../ce/discovery';
import { makeExecApi } from './shared';

export function createAzureComputeDiscoverTool(pi: PluginInterface, makeApi: (cwd: string) => AzExecApi = makeExecApi) {
  const { Type } = pi.typebox;
  return {
    name: 'azure_compute_discover',
    label: 'Discover Azure CE Compute',
    description:
      'Discover and rank subscription-aware AzureCloud regions for F5 Customer Edge using exact Marketplace image versions, VM SKU/NIC/zones, quota, policy, Route Server support, brownfield proximity, and terms status.',
    parameters: Type.Object({
      subscriptionId: Type.String(),
      publisher: Type.String(),
      offer: Type.String(),
      plan: Type.String(),
      version: Type.Optional(Type.String()),
      vmSize: Type.String(),
      requiredNics: Type.Number({ minimum: 1, maximum: 8 }),
      nodeCount: Type.Union([Type.Literal(1), Type.Literal(3)]),
      requireRouteServer: Type.Optional(Type.Boolean()),
      deploymentName: Type.String(),
      resourceGroup: Type.String(),
      brownfieldResourceIds: Type.Array(Type.String()),
    }),
    async execute(
      _id: string,
      params: AzureComputeDiscoveryInput,
      _signal: AbortSignal | undefined,
      _update: unknown,
      ctx: { cwd: string; sessionManager: Parameters<typeof saveDiscoveryArtifact>[0] },
    ) {
      try {
        const observation = await discoverAzureCompute(params, makeApi(ctx.cwd));
        const artifactId = await saveDiscoveryArtifact(ctx.sessionManager, observation);
        const ranked = observation.regions
          .map(
            (region) =>
              `${region.rank}. ${region.name}: ${region.eligible ? 'eligible' : 'ineligible'}${region.reasons.length ? ` (${region.reasons.join(', ')})` : ''}`,
          )
          .join('\n');
        return {
          content: [
            {
              type: 'text' as const,
              text: `Pinned image: ${observation.image.urn}\nMarketplace terms: ${observation.image.termsAccepted ? 'accepted' : 'not accepted'}\n${ranked}\nDiscovery artifact: ${artifactId ? `artifact://${artifactId}` : 'session memory only'}`,
            },
          ],
          details: { tool: 'azure_compute_discover', artifactId, observation },
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Azure CE discovery failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
          details: { tool: 'azure_compute_discover' },
        };
      }
    },
  };
}
