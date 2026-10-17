import { type CeEventBus, requestCePlatformService } from '../ce/service';
import type { PlatformToolApi } from '../types';

export function createF5xcCeV2StatusTool(pi: PlatformToolApi) {
  const { Type } = pi.typebox;
  return {
    name: 'f5xc_ce_v2_status',
    label: 'F5 CE v2 Status',
    description: 'Return the explicit availability result for Secure Mesh Site v2 runtime telemetry.',
    parameters: Type.Object({
      namespace: Type.String(),
      siteName: Type.String(),
      platformContext: Type.Optional(Type.String()),
    }),
    async execute(
      _id: string,
      _params: { namespace: string; siteName: string; platformContext?: string },
      _signal: AbortSignal | undefined,
      _update: unknown,
      _ctx: unknown,
    ) {
      const bus = (pi as PlatformToolApi & { events?: CeEventBus }).events;
      if (bus && _params.namespace === 'system') {
        try {
          const runtime = await (await requestCePlatformService(bus, _signal)).runtime(
            'native',
            _params.platformContext,
          );
          const status = await runtime.observeReadOnlySite(_params.siteName, [], _signal);
          return {
            content: [
              {
                type: 'text' as const,
                text: `F5 AWS CE ${_params.siteName}: ${status.status}. Resource-bound read-only observations are included; registration requires a measured cloud identity join.`,
              },
            ],
            details: { tool: 'f5xc_ce_v2_status', capability: 'available', status },
          };
        } catch {
          _signal?.throwIfAborted();
        }
      }
      return {
        content: [
          {
            type: 'text' as const,
            text: 'Secure Mesh Site v2 runtime observations are unknown; verify the selected context, system namespace, site identity and shared platform service.',
          },
        ],
        details: { tool: 'f5xc_ce_v2_status', capability: 'unavailable', reason: 'runtime_status' },
      };
    },
  };
}
