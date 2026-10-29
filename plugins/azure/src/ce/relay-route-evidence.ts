import { isIP } from 'node:net';
import type { AzExecApi } from '../az/exec';
import { canonicalSha256 } from './canonical';
import { type AzureRelayPlan, verifyAzureRelayPlan } from './relay-plan';
import { observeAzureRelayRouteServerIdentity } from './relay-route-server';
import type { AzureCePlan } from './types';

type Json = Record<string, unknown>;
type Identity = Awaited<ReturnType<typeof observeAzureRelayRouteServerIdentity>>;
const require = (value: unknown, message: string): void => {
  if (!value) throw Error(`Azure relay route evidence: ${message}`);
};
const object = (value: unknown): Json => {
  require(value && typeof value === 'object' && !Array.isArray(value), 'malformed route map');
  return value as Json;
};
const prefix = (value: unknown) => {
  if (typeof value !== 'string') return false;
  const [address, bits, extra] = value.split('/');
  if (extra !== undefined || isIP(address) !== 4 || !/^(?:[0-9]|[12][0-9]|3[0-2])$/.test(bits)) return false;
  const integer = address.split('.').reduce((sum, octet) => sum * 256 + Number(octet), 0);
  return integer % 2 ** (32 - Number(bits)) === 0;
};

/** Public PeerRouteList mapping. Collection time is not a Route Server or CE heartbeat. */
export function parseAzureRelayRouteExchange(
  source: AzureCePlan,
  plan: AzureRelayPlan,
  relayName: string,
  identity: Identity,
  learned: unknown,
  advertised: unknown,
) {
  verifyAzureRelayPlan(source, plan);
  const relay = plan.relays.find((row) => row.name === relayName);
  require(relay &&
    identity.status === 'observed' &&
    identity.sourcePlanSha256 === source.planSha256 &&
    identity.planSha256 === plan.planSha256 &&
    identity.routeServerId === plan.routeServerId &&
    identity.serviceAddresses.length === 2 &&
    new Set(identity.serviceAddresses).size === 2 &&
    identity.serviceAddresses.every((ip) => isIP(ip) === 4), 'current joined Route Server identity required');
  if (!relay) throw Error('Azure relay route evidence: relay is absent');
  require(identity.peers.filter(
    (peer) =>
      peer.name === relayName &&
      peer.peerIp === relay.privateAddress &&
      peer.peerAsn === relay.asn &&
      peer.id === `${plan.routeServerId}/bgpConnections/${relayName}`,
  ).length === 1, 'selected relay peer identity differs');
  const roles = (raw: unknown, direction: 'learned' | 'advertised') => {
    const map = object(raw);
    require(Object.keys(map).sort().join(',') ===
      'RouteServiceRole_IN_0,RouteServiceRole_IN_1', 'two complete service-role route lists required');
    return Object.entries(map)
      .toSorted(([a], [b]) => a.localeCompare(b))
      .map(([role, values]) => {
        require(Array.isArray(values), 'malformed service-role routes');
        const seen = new Set<string>();
        const routes = (values as unknown[]).map((entry) => {
          const route = object(entry);
          require(prefix(route.network) &&
            typeof route.localAddress === 'string' &&
            identity.serviceAddresses.includes(route.localAddress) &&
            typeof route.nextHop === 'string' &&
            isIP(route.nextHop) === 4 &&
            typeof route.sourcePeer === 'string' &&
            isIP(route.sourcePeer) === 4 &&
            typeof route.origin === 'string' &&
            route.origin.trim() &&
            typeof route.asPath === 'string' &&
            /^(?:[1-9][0-9]*)(?:-[1-9][0-9]*)*$/.test(route.asPath) &&
            route.asPath.split('-').every((asn) => Number(asn) < 4294967295) &&
            Number.isInteger(route.weight) &&
            Number(route.weight) >= 0 &&
            Number(route.weight) <= 2147483647, 'malformed route identity or path');
          const key = canonicalSha256({
            network: route.network,
            localAddress: route.localAddress,
            nextHop: route.nextHop,
            sourcePeer: route.sourcePeer,
            asPath: route.asPath,
          });
          require(!seen.has(key), 'duplicate route observation');
          seen.add(key);
          return route;
        });
        const wanted = direction === 'learned' ? plan.vipPrefixes : plan.returnPrefixes;
        const matches = wanted.map((network) => {
          const rows = routes.filter((row) => row.network === network);
          require(rows.length > 0, 'expected prefix exchange has not converged');
          for (const row of rows) {
            if (direction === 'learned') {
              const path = (row.asPath as string).split('-').map(Number);
              require(row.nextHop === relay.privateAddress &&
                row.sourcePeer === relay.privateAddress &&
                row.origin === 'EBgp' &&
                path[0] === relay.asn &&
                path.at(-1) === plan.localAsn &&
                new RegExp(`^${relay.asn}(?:-${relay.asn})*-${plan.localAsn}(?:-${plan.localAsn})*$`).test(
                  row.asPath as string,
                ), 'VIP source/next-hop/AS path differs');
            } else {
              require(row.nextHop === row.localAddress &&
                row.sourcePeer === row.localAddress &&
                row.origin === 'Igp' &&
                row.asPath === '65515', 'Azure return source/next-hop/AS path differs');
            }
          }
          return {
            prefix: network,
            paths: rows.map((row) => ({
              localAddress: row.localAddress,
              nextHop: row.nextHop,
              sourcePeer: row.sourcePeer,
              asPath: row.asPath,
            })),
          };
        });
        return { role, routeCount: routes.length, matches };
      });
  };
  return {
    relayName,
    peerId: `${plan.routeServerId}/bgpConnections/${relayName}`,
    learned: roles(learned, 'learned'),
    advertised: roles(advertised, 'advertised'),
  };
}

/** Read-only cloud exchange gate; separate from FRR/CE sessions, freshness and packet traffic. */
export async function observeAzureRelayRouteExchange(
  source: AzureCePlan,
  plan: AzureRelayPlan,
  api: AzExecApi,
  signal?: AbortSignal,
) {
  source = structuredClone(source);
  plan = structuredClone(plan);
  verifyAzureRelayPlan(source, plan);
  signal?.throwIfAborted();
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const bounded = async <T>(task: () => Promise<T>): Promise<T> => {
    deadline.throwIfAborted();
    const abort = Promise.withResolvers<never>();
    const onAbort = () => abort.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([task(), abort.promise]);
      deadline.throwIfAborted();
      return result;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  const identity = await bounded(() => observeAzureRelayRouteServerIdentity(source, plan, api, deadline));
  const stable = (row: Identity) =>
    canonicalSha256({
      sourcePlanSha256: row.sourcePlanSha256,
      planSha256: row.planSha256,
      routeServerId: row.routeServerId,
      hostedSubnetId: row.hostedSubnetId,
      serviceAddresses: row.serviceAddresses,
      relays: row.relays,
      peers: row.peers,
    });
  const identitySha256 = stable(identity);
  const reads: string[][] = [];
  const read = async (relayName: string, direction: 'learned' | 'advertised') => {
    const args = [
      'network',
      'routeserver',
      'peering',
      `list-${direction}-routes`,
      '--resource-group',
      source.intent.resourceGroup,
      '--routeserver',
      `${source.deploymentName}-rs`,
      '--name',
      relayName,
      '--subscription',
      source.subscription.id,
      '--output',
      'json',
    ];
    reads.push(args);
    const raw = await bounded(() => api.exec('az', args, { signal: deadline }));
    require(raw.exitCode === 0, 'route read unavailable');
    return JSON.parse(raw.stdout) as unknown;
  };
  const revalidate = async () =>
    require(stable(await bounded(() => observeAzureRelayRouteServerIdentity(source, plan, api, deadline))) ===
      identitySha256, 'current cloud identity changed during route collection');
  const peers = [];
  for (const relay of plan.relays) {
    await revalidate();
    const learned = await read(relay.name, 'learned');
    const advertised = await read(relay.name, 'advertised');
    peers.push(parseAzureRelayRouteExchange(source, plan, relay.name, identity, learned, advertised));
    await revalidate();
  }
  deadline.throwIfAborted();
  return {
    status: 'observed' as const,
    source: 'azure-cli-current-route-exchange' as const,
    sourcePlanSha256: source.planSha256,
    relayPlanSha256: plan.planSha256,
    routeServerId: plan.routeServerId,
    identitySha256,
    peers,
    reads,
    collectedAt: new Date().toISOString(),
    sessions: 'unknown' as const,
    traffic: 'unknown' as const,
    freshness: 'unqualified' as const,
    ceSampleFreshnessQualified: false as const,
  };
}
