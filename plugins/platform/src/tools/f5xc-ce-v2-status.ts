import type { CeV2Driver } from '../ce/driver';
import { createDefaultCeV2Driver } from '../ce/driver';
import { assertSafeName, publicFailure } from '../ce/security';
import type { PlatformToolApi } from '../types';

function evidence(raw: Record<string, unknown>) {
  const nodes = Array.isArray(raw.nodes) ? (raw.nodes as Array<Record<string, unknown>>) : [];
  const bgp = (raw.bgp as Record<string, unknown> | undefined) ?? {};
  return {
    siteState: String(raw.siteState ?? raw.state ?? 'UNKNOWN'),
    nodes: nodes.map((node) => ({
      name: String(node.name ?? ''),
      registration: String(node.registration ?? 'UNKNOWN'),
      provisioning: String(node.provisioning ?? 'UNKNOWN'),
      health: String(node.health ?? 'UNKNOWN'),
      interfaces: Array.isArray(node.interfaces)
        ? (node.interfaces as Array<Record<string, unknown>>).map((item) => ({
            name: item.name,
            role: item.role,
            address: item.address,
            state: item.state,
          }))
        : [],
      routes: Array.isArray(node.routes)
        ? (node.routes as Array<Record<string, unknown>>).map((item) => ({
            prefix: item.prefix,
            nextHop: item.nextHop,
            protocol: item.protocol,
          }))
        : [],
    })),
    bgp: {
      established: Boolean(bgp.established),
      peers: Number(bgp.peers ?? 0),
      learnedRoutes: Number(bgp.learnedRoutes ?? 0),
    },
  };
}

export function createF5xcCeV2StatusTool(pi: PlatformToolApi, makeDriver: () => CeV2Driver = createDefaultCeV2Driver) {
  const { Type } = pi.typebox;
  return {
    name: 'f5xc_ce_v2_status',
    label: 'F5 CE v2 Status',
    description:
      'Return non-secret Secure Mesh Site v2 registration, provisioning, health, ordered interfaces, BGP peers, and routing evidence for Azure correlation.',
    parameters: Type.Object({ namespace: Type.String(), siteName: Type.String() }),
    async execute(
      _id: string,
      params: { namespace: string; siteName: string },
      _signal: AbortSignal | undefined,
      _update: unknown,
      _ctx: unknown,
    ) {
      try {
        assertSafeName(params.namespace, 'namespace');
        assertSafeName(params.siteName, 'siteName');
        const driver = makeDriver();
        const capabilities = await driver.capabilities();
        if (capabilities.version !== 'v2') throw new Error('Secure Mesh Site v2 capability is unavailable');
        const result = evidence(await driver.status(params));
        const healthy = result.nodes.filter(
          (node) => node.registration === 'REGISTERED' && node.health === 'HEALTHY',
        ).length;
        return {
          content: [
            {
              type: 'text' as const,
              text: `Secure Mesh Site v2 ${params.namespace}/${params.siteName}: ${result.siteState}; ${healthy}/${result.nodes.length} nodes healthy; BGP ${result.bgp.established ? 'established' : 'not established'}.`,
            },
          ],
          details: { tool: 'f5xc_ce_v2_status', evidence: result },
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Secure Mesh Site v2 status failed: ${publicFailure(error, 'the authenticated tenant status request was rejected')}`,
            },
          ],
          isError: true,
          details: { tool: 'f5xc_ce_v2_status' },
        };
      }
    },
  };
}
