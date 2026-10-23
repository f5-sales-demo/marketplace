import { type CePlatformService, createCePlatformService } from '../ce/service';
import type { PlatformToolApi, PlatformToolContext } from '../types';

export function createF5xcCeV2StatusTool(
  pi: PlatformToolApi,
  makeService: (ctx?: PlatformToolContext) => CePlatformService = () => createCePlatformService(),
) {
  const { Type } = pi.typebox;
  return {
    name: 'f5xc_ce_v2_status',
    label: 'F5 CE v2 Status',
    description:
      'Observe interfaces using the active tenant and trusted deployment/MAC bindings. Explicit down differs from unavailable evidence. Fetch time is not a CE heartbeat timestamp.',
    parameters: Type.Object({
      namespace: Type.String(),
      siteName: Type.String(),
      platformContext: Type.Optional(Type.String()),
    }),
    async execute(
      _id: string,
      params: { namespace: string; siteName: string; platformContext?: string },
      signal: AbortSignal | undefined,
      _update: unknown,
      ctx: PlatformToolContext,
    ) {
      const reason = 'binding-or-evidence-unavailable';
      try {
        if (params.namespace !== 'system') throw new Error('namespace');
        const service = makeService(ctx);
        const known = await service.siteBinding?.(params.siteName, params.platformContext);
        if (!known || !known.expectedInterfaces.length) throw new Error('missing binding');
        const runtime = await service.runtime(known.binding.owner.engine, params.platformContext);
        if (runtime.contract.fingerprint !== known.contractFingerprint) throw new Error('stale binding');
        const site = await runtime.observeOwnedSite(known.binding, signal);
        if ((site.system_metadata as Record<string, unknown>).uid !== known.siteUid) throw new Error('rebuilt site');
        const spec = site.spec as Record<
          string,
          { not_managed: { node_list: Array<{ hostname: string; interface_list: unknown[] }> } }
        >;
        const nodes = spec[known.binding.owner.provider].not_managed.node_list;
        if (
          !Array.isArray(nodes) ||
          nodes.length !== known.binding.nodes.length ||
          nodes.some((node) => !known.binding.nodes.includes(node.hostname) || !Array.isArray(node.interface_list)) ||
          nodes.reduce((count, node) => count + node.interface_list.length, 0) !== known.expectedInterfaces.length
        )
          throw new Error('incomplete interface bindings');

        const evidence =
          known.binding.owner.provider === 'aws'
            ? await runtime.observeAwsInterfaces(known.binding, known.expectedInterfaces, signal)
            : await runtime.observeAzureInterfaces(known.binding, known.expectedInterfaces, signal);
        return {
          content: [
            {
              type: 'text' as const,
              text: `CE ${params.siteName} interfaces: ${evidence.status}. CE sample age remains unqualified.`,
            },
          ],
          details: {
            tool: 'f5xc_ce_v2_status',
            status: evidence.status,
            siteUid: known.siteUid,
            interfaces: evidence.interfaces,
            fetchedAt: evidence.observedAt,
            ceSampleAge: 'unknown',
            freshnessQualification: 'pending-1930',
            canSatisfyMutationGate: false,
          },
        };
      } catch {
        signal?.throwIfAborted();
      }
      return {
        content: [
          {
            type: 'text' as const,
            text: `CE ${params.siteName} interface observations are unknown; verify context and deployment bindings.`,
          },
        ],
        details: {
          tool: 'f5xc_ce_v2_status',
          status: 'unknown',
          reason,
          interfaces: [],
          canSatisfyMutationGate: false,
        },
      };
    },
  };
}
