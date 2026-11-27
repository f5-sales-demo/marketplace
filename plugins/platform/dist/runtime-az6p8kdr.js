// biome-ignore-all lint: Generated Bun bundle; lint the source modules instead.
// @bun
import {
  CeContextFailure,
  CeContractFailure,
  createCePlatformService,
  ReleaseContractFailure,
} from './runtime-nfbzkfn9.js';

// plugins/platform/src/tools/f5xc-ce-v2-capabilities.ts
function createF5xcCeV2CapabilitiesTool(pi, makeService = () => createCePlatformService()) {
  const { Type } = pi.typebox;
  return {
    name: 'f5xc_ce_v2_capabilities',
    label: 'F5 CE v2 Capabilities',
    description:
      'Return non-secret Secure Mesh Site v2 contract, provider, bootstrap-driver, networking-profile, AWS TGW Connect, and KVM Site UID image resolution evidence.',
    parameters: Type.Object({ platformContext: Type.Optional(Type.String()) }),
    async execute(_id, _params, _signal, _update, ctx) {
      try {
        const capabilities = await makeService(ctx).capabilities(_params.platformContext);
        return {
          content: [
            {
              type: 'text',
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
              type: 'text',
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

export { createF5xcCeV2CapabilitiesTool };
