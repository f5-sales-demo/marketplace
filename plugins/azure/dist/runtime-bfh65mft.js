// biome-ignore-all lint: Generated Bun bundle; lint the source modules instead.
// @bun

import { makeExecApi } from './runtime-2139fbqg.js';
import { saveDiscoveryArtifact } from './runtime-34064jyj.js';
import { discoverAzureCompute } from './runtime-fcqr1ksb.js';

// plugins/azure/src/tools/azure-compute-discover.ts
function createAzureComputeDiscoverTool(pi, makeApi = makeExecApi) {
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
    async execute(_id, params, _signal, _update, ctx) {
      try {
        const observation = await discoverAzureCompute(params, makeApi(ctx.cwd));
        const artifactId = await saveDiscoveryArtifact(ctx.sessionManager, observation);
        const ranked = observation.regions
          .map(
            (region) =>
              `${region.rank}. ${region.name}: ${region.eligible ? 'eligible' : 'ineligible'}${region.reasons.length ? ` (${region.reasons.join(', ')})` : ''}`,
          )
          .join(`
`);
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
              type: 'text',
              text: `Research: live Azure CLI catalog and subscription observations (${observation.research.catalogRegion})
Shared contract: ${observation.research.sharedContract.contractId}/${observation.research.sharedContract.contractVersion} (${observation.research.sharedContract.normalizedSha256})
Official sources: retrieved live from F5 and Microsoft with normalized digests
Pinned image: ${observation.image.urn}
Marketplace terms: ${observation.image.termsAccepted ? 'accepted' : 'not accepted'}
Leading eligible region: ${leadingRegion?.name ?? 'none'}
Compatible VM sizes: ${compatibleSizes || 'none'}
${ranked}
Discovery artifact: ${artifactId ? `artifact://${artifactId}` : 'session memory only'}`,
            },
          ],
          details: { tool: 'azure_compute_discover', artifactId, observation },
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
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

export { createAzureComputeDiscoverTool };
