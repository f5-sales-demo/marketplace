import type { CeV2Driver } from '../ce/driver';
import { createDefaultCeV2Driver } from '../ce/driver';
import { publicFailure } from '../ce/security';
import type { PlatformToolApi } from '../types';

export function createF5xcCeV2CapabilitiesTool(
  pi: PlatformToolApi,
  makeDriver: () => CeV2Driver = createDefaultCeV2Driver,
) {
  const { Type } = pi.typebox;
  return {
    name: 'f5xc_ce_v2_capabilities',
    label: 'F5 CE v2 Capabilities',
    description:
      'Return non-secret Secure Mesh Site v2 contract, provider, bootstrap-driver, networking-profile, and AWS TGW Connect schema evidence.',
    parameters: Type.Object({}),
    async execute(
      _id: string,
      _params: Record<string, never>,
      _signal?: AbortSignal,
      _update?: unknown,
      _ctx?: unknown,
    ) {
      try {
        const capabilities = await makeDriver().capabilities();
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
        return {
          content: [
            {
              type: 'text' as const,
              text: `Secure Mesh Site v2 capabilities failed: ${publicFailure(error, 'the authenticated tenant capability request was rejected')}`,
            },
          ],
          isError: true,
          details: { tool: 'f5xc_ce_v2_capabilities' },
        };
      }
    },
  };
}
