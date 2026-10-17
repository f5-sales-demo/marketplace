import { CeCapabilityFailure, type CeV2Driver, createDefaultCeV2Driver } from '../ce/driver';
import { ReleaseContractFailure } from '../ce/release-contract';
import { type CeEventBus, requestCePlatformService } from '../ce/service';
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
    parameters: Type.Object({ platformContext: Type.Optional(Type.String()) }),
    async execute(
      _id: string,
      _params: { platformContext?: string },
      _signal?: AbortSignal,
      _update?: unknown,
      ctx?: PlatformToolContext,
    ) {
      try {
        const bus = (pi as PlatformToolApi & { events?: CeEventBus }).events;
        const capabilities = bus
          ? await (await requestCePlatformService(bus, _signal)).capabilities(_params.platformContext)
          : await makeDriver(ctx).capabilities();
        const kvm = 'kvmImageResolution' in capabilities ? capabilities.kvmImageResolution : undefined;
        return {
          content: [
            {
              type: 'text' as const,
              text: `Secure Mesh Site v2 ${capabilities.smsv2ContractVersion}; providers: ${capabilities.supportedProviders.join(', ')}; AWS TGW Connect: ${capabilities.awsSmsv2TgwConnect.supported ? capabilities.awsSmsv2TgwConnect.schemaVersion : 'unsupported'}; KVM image resolution: ${kvm ? `${kvm.id} (${kvm.endpoint})` : 'not collected by AWS CE service'}.`,
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
