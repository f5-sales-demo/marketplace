import { CeCapabilityFailure, type CeV2Driver, createDefaultCeV2Driver } from '../ce/driver';
import { ReleaseContractFailure } from '../ce/release-contract';
import type { PlatformToolApi, PlatformToolContext } from '../types';

export function createF5xcCeV2CapabilitiesTool(
  pi: PlatformToolApi,
  makeDriver: (context?: PlatformToolContext) => CeV2Driver = createDefaultCeV2Driver,
) {
  const { Type } = pi.typebox;
  return {
    name: 'f5xc_ce_v2_capabilities',
    label: 'F5 CE v2 Capabilities',
    description:
      'Return non-secret Secure Mesh Site v2 contract, provider, bootstrap-driver, networking-profile, AWS TGW Connect, and KVM Site UID image resolution evidence.',
    parameters: Type.Object({}),
    async execute(
      _id: string,
      _params: Record<string, never>,
      _signal?: AbortSignal,
      _update?: unknown,
      ctx?: PlatformToolContext,
    ) {
      try {
        const capabilities = await makeDriver(ctx).capabilities();
        return {
          content: [
            {
              type: 'text' as const,
              text: `Secure Mesh Site v2 ${capabilities.smsv2ContractVersion}; providers: ${capabilities.supportedProviders.join(', ')}; AWS TGW Connect: ${capabilities.awsSmsv2TgwConnect.supported ? capabilities.awsSmsv2TgwConnect.schemaVersion : 'unsupported'}; KVM image resolution: ${capabilities.kvmImageResolution.id} (${capabilities.kvmImageResolution.endpoint}).`,
            },
          ],
          details: { tool: 'f5xc_ce_v2_capabilities', capabilities },
        };
      } catch (error) {
        const category =
          error instanceof ReleaseContractFailure || error instanceof CeCapabilityFailure
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
