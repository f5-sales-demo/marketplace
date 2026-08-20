import type { PlatformToolApi } from '../types';

export function createF5xcCeV2StatusTool(pi: PlatformToolApi) {
  const { Type } = pi.typebox;
  return {
    name: 'f5xc_ce_v2_status',
    label: 'F5 CE v2 Status',
    description: 'Return the explicit availability result for Secure Mesh Site v2 runtime telemetry.',
    parameters: Type.Object({ namespace: Type.String(), siteName: Type.String() }),
    async execute(
      _id: string,
      _params: { namespace: string; siteName: string },
      _signal: AbortSignal | undefined,
      _update: unknown,
      _ctx: unknown,
    ) {
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
