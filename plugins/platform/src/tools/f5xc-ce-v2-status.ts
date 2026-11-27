import { type CeV2Driver, type CeV2SiteRequest, createDefaultCeV2Driver } from '../ce/driver';
import type { PlatformToolApi, PlatformToolContext } from '../types';

export function createF5xcCeV2StatusTool(
  pi: PlatformToolApi,
  makeDriver: (context?: PlatformToolContext) => CeV2Driver = createDefaultCeV2Driver,
) {
  const { Type } = pi.typebox;
  return {
    name: 'f5xc_ce_v2_status',
    label: 'F5 CE v2 Status',
    description: 'Return the explicit availability result for Secure Mesh Site v2 runtime telemetry.',
    parameters: Type.Object({
      namespace: Type.String(),
      siteName: Type.String(),
      provider: Type.Optional(Type.Literal('azure')),
      expectedNode: Type.Optional(
        Type.Object({ hostname: Type.String(), instanceId: Type.String(), mac: Type.String() }),
      ),
    }),
    async execute(
      _id: string,
      params: CeV2SiteRequest,
      _signal: AbortSignal | undefined,
      _update: unknown,
      ctx: PlatformToolContext,
    ) {
      if (params.provider === 'azure') {
        try {
          const status = await makeDriver(ctx).status(params);
          return {
            content: [
              {
                type: 'text' as const,
                text: 'Azure registration observation captured. Operational health and workload acceptance remain separate.',
              },
            ],
            details: { tool: 'f5xc_ce_v2_status', status },
          };
        } catch {
          return {
            content: [{ type: 'text' as const, text: 'Azure registration observation is unavailable.' }],
            isError: true,
            details: { tool: 'f5xc_ce_v2_status', capability: 'unknown' },
          };
        }
      }
      return {
        content: [
          {
            type: 'text' as const,
            text: 'Secure Mesh Site v2 runtime status is unavailable until the separate F5 telemetry contract is published.',
          },
        ],
        details: { tool: 'f5xc_ce_v2_status', capability: 'unavailable', reason: 'runtime_status' },
      };
    },
  };
}
