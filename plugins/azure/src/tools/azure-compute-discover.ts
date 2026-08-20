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
      'Mandatory live research gate for F5 Customer Edge. Retrieves and hashes the canonical MCN contract plus current F5 and Microsoft guidance, then enumerates Azure Marketplace identifiers, exact image version, subscription-aware VM SKU/NIC/zones, quota, policy, Route Server support, brownfield proximity, and terms status.',
    parameters: Type.Object({
      subscriptionId: Type.String(),
      publisher: Type.Optional(Type.String()),
      offer: Type.Optional(Type.String()),
      plan: Type.Optional(Type.String()),
      version: Type.Optional(Type.String()),
      vmSize: Type.Optional(Type.String()),
      requiredNics: Type.Number({ minimum: 1, maximum: 8 }),
      nodeCount: Type.Number({ minimum: 1, maximum: 3, description: 'Node count; only 1 or 3 is valid.' }),
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
        const leadingRegion = observation.regions.find((region) => region.eligible);
        const compatibleSizes = (leadingRegion?.vmSizes ?? [])
          .slice(0, 12)
          .map(
            (size) =>
              `${size.name} (${size.vCpus} vCPU, ${size.memoryGb} GB, ${size.maxNics} NICs, zones ${size.zones.join('/') || 'regional'})`,
          )
          .join('; ');
        return {
          content: [
            {
              type: 'text' as const,
              text: `Research: live Azure CLI catalog and subscription observations (${observation.research.catalogRegion})\nShared contract: ${observation.research.sharedContract.contractId}/${observation.research.sharedContract.contractVersion} (${observation.research.sharedContract.normalizedSha256})\nOfficial sources: retrieved live from F5 and Microsoft with normalized digests\nPinned image: ${observation.image.urn}\nMarketplace terms: ${observation.image.termsAccepted ? 'accepted' : 'not accepted'}\nLeading eligible region: ${leadingRegion?.name ?? 'none'}\nCompatible VM sizes: ${compatibleSizes || 'none'}\n${ranked}\nDiscovery artifact: ${artifactId ? `artifact://${artifactId}` : 'session memory only'}`,
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
