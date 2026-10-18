import { ReleaseContractFailure } from '../ce/release-contract';
import { CeContextFailure, type CePlatformService, createCePlatformService } from '../ce/service';
import { CeContractFailure } from '../ce/verified-api-release';
import type { PlatformToolApi, PlatformToolContext } from '../types';

export function createF5xcCeV2CapabilitiesTool(
  pi: PlatformToolApi,
  makeService: (ctx?: PlatformToolContext) => CePlatformService = () => createCePlatformService(),
) {
  const { Type } = pi.typebox;
  return {
    name: 'f5xc_ce_v2_capabilities',
    label: 'F5 CE v2 Capabilities',
    description:
      'Return non-secret Secure Mesh Site v2 contract, provider, bootstrap-driver, networking-profile, AWS TGW Connect, and KVM Site UID image resolution evidence.',
    parameters: Type.Object({ platformContext: Type.Optional(Type.String()) }),
    async execute(
      _id: string,
      _params: { platformContext?: string },
      _signal?: AbortSignal,
      _update?: unknown,
      ctx?: PlatformToolContext,
    ) {
      try {
        const capabilities = await makeService(ctx).capabilities(_params.platformContext);

        return {
          content: [
            {
              type: 'text' as const,
              text: `Secure Mesh Site v2 ${capabilities.smsv2ContractVersion}; providers: ${capabilities.supportedProviders.join(', ')}; AWS TGW Connect: ${capabilities.awsSmsv2TgwConnect.supported ? capabilities.awsSmsv2TgwConnect.schemaVersion : 'unsupported'}.`,
            },
          ],
          details: { tool: 'f5xc_ce_v2_capabilities', capabilities },
        };
      } catch (error) {
        const category =
          error instanceof ReleaseContractFailure ||
          error instanceof CeContextFailure ||
          error instanceof CeContractFailure
            ? error.category
            : 'unexpected';
        return {
          content: [
            {
              type: 'text' as const,
              text: `Secure Mesh Site v2 capabilities failed (${category}).`,
            },
          ],
          isError: true,
          details: { tool: 'f5xc_ce_v2_capabilities', failure: { category } },
        };
      }
    },
  };
}
