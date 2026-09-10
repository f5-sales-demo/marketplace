import { isIP } from 'node:net';
import type { AzExecApi } from '../az/exec';
import { verifyAzureCePlan } from './artifacts';
import { resolveInterfaceAddress } from './interface-address';
import type { AzureCePlan } from './types';

type Json = Record<string, unknown>;
const object = (value: unknown): Json => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed Route Server evidence');
  return value as Json;
};
const lower = (value: unknown) => (typeof value === 'string' ? value.toLowerCase() : '');

async function read(api: AzExecApi, plan: AzureCePlan, args: string[], signal?: AbortSignal): Promise<unknown> {
  signal?.throwIfAborted();
  const result = await api.exec(
    'az',
    [...args, '--subscription', plan.subscription.id, '--output', 'json'],
    signal ? { signal } : undefined,
  );
  signal?.throwIfAborted();
  if (result.exitCode !== 0) throw new Error('Azure Route Server observation unavailable');
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error('Malformed Azure Route Server observation');
  }
}

function routeRoles(value: unknown): Array<{ role: string; routes: Json[] }> {
  const response = object(value);
  if (response.nextLink || response.nextPageToken || response.error) throw new Error('Incomplete Route Server routes');
  const roles = Object.entries(response)
    .filter(([name]) => /^RouteServiceRole_IN_[01]$/.test(name))
    .map(([role, routes]) => {
      if (!Array.isArray(routes)) throw new Error('Malformed Route Server role routes');
      return { role, routes: routes.map(object) };
    });
  if (roles.length !== 2 || new Set(roles.map((entry) => entry.role)).size !== 2)
    throw new Error('Both Route Server service-role observations are required');
  return roles.sort((a, b) => a.role.localeCompare(b.role));
}

/** Azure control-plane route exchange. Per-session establishment still requires platform BGP evidence. */
export async function collectAzureRouteServerHealth(plan: AzureCePlan, api: AzExecApi, signal?: AbortSignal) {
  verifyAzureCePlan(plan);
  const base = {
    planId: plan.planId,
    planSha256: plan.planSha256,
    engine: plan.engine,
    subscriptionId: plan.subscription.id,
    region: plan.region,
    siteName: plan.siteName,
    source: 'azure-cli-live' as const,
    observedAt: new Date().toISOString(),
    sessions: 'unknown' as const,
    sessionReason: 'platform-bgp-session-evidence-required' as const,
    effectiveRoutes: 'unknown' as const,
    traffic: 'unknown' as const,
  };
  if (plan.routing.mode !== 'route-server') return { ...base, status: 'not-applicable' as const };
  try {
    const serverAction = plan.actions.filter((action) => action.kind === 'route-server-create');
    if (serverAction.length !== 1 || !serverAction[0].resourceId)
      throw new Error('Planned Route Server identity is unavailable');
    const server = object(
      await read(
        api,
        plan,
        [
          'network',
          'routeserver',
          'show',
          '--resource-group',
          plan.intent.resourceGroup,
          '--name',
          `${plan.deploymentName}-rs`,
        ],
        signal,
      ),
    );
    const tags = object(server.tags);
    const routerIps = server.virtualRouterIps;
    if (
      lower(server.id) !== lower(serverAction[0].resourceId) ||
      lower(server.location) !== lower(plan.region) ||
      server.provisioningState !== 'Succeeded' ||
      server.virtualRouterAsn !== 65515 ||
      !Array.isArray(routerIps) ||
      routerIps.length !== 2 ||
      new Set(routerIps).size !== 2 ||
      routerIps.some((ip) => typeof ip !== 'string' || isIP(ip) !== 4) ||
      tags['xcsh-managed-by'] !== 'azure-ce' ||
      tags['xcsh-deployment-id'] !== plan.deploymentName ||
      tags['xcsh-execution-engine'] !== plan.engine ||
      tags['xcsh-plan-sha256'] !== plan.planSha256
    )
      throw new Error('Azure Route Server identity or service addresses differ');

    const peers = [];
    for (let node = 1; node <= plan.topology.nodeCount; node++) {
      const action = plan.actions.filter(
        (candidate) => candidate.kind === 'route-server-peer-create' && candidate.node === node,
      );
      if (action.length !== 1 || !action[0].resourceId) throw new Error('Planned Route Server peer is unavailable');
      const peerIp = await resolveInterfaceAddress(api, plan, node, 'slo');
      const name = `${plan.deploymentName}-${node}`;
      const common = [
        '--resource-group',
        plan.intent.resourceGroup,
        '--routeserver',
        `${plan.deploymentName}-rs`,
        '--name',
        name,
      ];
      const peer = object(await read(api, plan, ['network', 'routeserver', 'peering', 'show', ...common], signal));
      if (
        lower(peer.id) !== lower(action[0].resourceId) ||
        peer.name !== name ||
        peer.provisioningState !== 'Succeeded' ||
        peer.peerAsn !== plan.routing.localAsn ||
        peer.peerIp !== peerIp
      )
        throw new Error('Azure Route Server peer identity or SLO binding differs');
      const learned = routeRoles(
        await read(api, plan, ['network', 'routeserver', 'peering', 'list-learned-routes', ...common], signal),
      );
      const expected = plan.routing.destinationCidrs;
      const roles = learned.map(({ role, routes }) => {
        const matching = expected.map((prefix) => {
          const matches = routes.filter((route) => route.network === prefix && route.nextHop === peerIp);
          if (matches.length !== 1) throw new Error('Expected Route Server route exchange has not converged');
          return prefix;
        });
        return { role, learnedRouteCount: routes.length, matchedPrefixes: matching };
      });
      peers.push({ node, name, peerIp, peerAsn: peer.peerAsn, provisioningState: peer.provisioningState, roles });
    }
    return {
      ...base,
      status: plan.routing.destinationCidrs.length ? ('healthy' as const) : ('unknown' as const),
      reason: plan.routing.destinationCidrs.length ? undefined : 'expected-learned-prefixes-unavailable',
      routeServerId: serverAction[0].resourceId,
      serviceAddresses: [...routerIps].sort(),
      peers,
      routeExchange: plan.routing.destinationCidrs.length ? ('healthy' as const) : ('unknown' as const),
    };
  } catch (error) {
    if (signal?.aborted) throw error;
    return { ...base, status: 'unknown' as const, reason: 'route-server-evidence-unavailable' as const };
  }
}
