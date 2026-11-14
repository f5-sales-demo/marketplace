import { canonicalSha256 } from './canonical';
import { compileAzureRelayGuestSessions, parseAzureRelayGuestSessions } from './relay-guest-sessions';
import type { AzureRelayPlan } from './relay-plan';
import type { observeAzureRelayRouteServerIdentity } from './relay-route-server';
import type { AzureCePlan } from './types';

type Json = Record<string, unknown>;
const require = (value: unknown, message: string): void => {
  if (!value) throw Error(`Azure relay guest routes: ${message}`);
};
const object = (value: unknown): Json => {
  require(value && typeof value === 'object' && !Array.isArray(value), 'malformed route evidence');
  return value as Json;
};

/** One prefix per command keeps the bounded RunCommand stdout independent of return-policy size. */
export function compileAzureRelayGuestRoute(
  source: AzureCePlan,
  plan: AzureRelayPlan,
  relayName: string,
  identity: Awaited<ReturnType<typeof observeAzureRelayRouteServerIdentity>>,
  ceEndpoints: Array<{ node: number; address: string }>,
  nonce: string,
  direction: 'received' | 'advertised',
  prefix: string,
  peerAddress?: string,
  outage?: { nodeIndex: number },
) {
  const sessionRequest = compileAzureRelayGuestSessions(source, plan, relayName, identity, ceEndpoints, nonce, outage);
  require(['received', 'advertised'].includes(direction), 'explicit route direction required');
  const target = sessionRequest.sessionBinding.peers.find((peer) => peer.address === peerAddress);
  const vip = plan.vipPrefixes.includes(prefix);
  const returning = plan.returnPrefixes.includes(prefix);
  require(vip !== returning &&
    (direction === 'received'
      ? peerAddress === undefined
      : target &&
        target.address !== sessionRequest.sessionBinding.unavailablePeer?.address &&
        (target.asn === 65515 ? vip : returning)), 'planned prefix and exact advertised peer policy required');
  const sourcePeers = sessionRequest.sessionBinding.peers.filter(
    (peer) =>
      (vip ? peer.asn !== 65515 : peer.asn === 65515) &&
      peer.address !== sessionRequest.sessionBinding.unavailablePeer?.address,
  );
  const command =
    direction === 'received'
      ? 'show bgp ipv4 unicast json'
      : `show bgp ipv4 unicast neighbors ${peerAddress} advertised-routes json`;
  const routeBinding = {
    direction,
    prefix,
    peerAddress: peerAddress ?? null,
    sourcePeers,
    command,
    localAsn: sessionRequest.sessionBinding.localAsn,
    localAddress: sessionRequest.sessionBinding.localAddress,
  };
  const encoded = Buffer.from(JSON.stringify(routeBinding)).toString('base64');
  const original =
    "print('XCSH_RELAY_SESSIONS:' + expected['nonce'] + ':' + json.dumps(dict(guest=receipt,sessions=sessions), separators=(',',':')))";
  require(sessionRequest.python.split(original).length === 2, 'session program mapping differs');
  const readback = `route_binding = json.loads(base64.b64decode('${encoded}'))
table = json.loads(run([docker,'exec',container_id,'/usr/bin/vtysh','-c',route_binding['command']]))
if not isinstance(table, dict) or any(table.get(key) for key in ['error','errors','nextLink','next_page_token']):
    raise RuntimeError('Route read unavailable or partial')
if table.get('localAS') != route_binding['localAsn']:
    raise RuntimeError('Route table ASN differs')
source_asns = {peer['asn'] for peer in route_binding['sourcePeers']}
if len(source_asns) != 1:
    raise RuntimeError('Route source policy is ambiguous')
source_asn = next(iter(source_asns))
def path_matches(value):
    return isinstance(value,str) and re.fullmatch(str(source_asn) + r'(?: ' + str(source_asn) + r')*', value) is not None
if route_binding['direction'] == 'received':
    routes = table.get('routes')
    if table.get('routerId') != route_binding['localAddress'] or table.get('vrfName') != 'default' or not isinstance(routes,dict) or type(table.get('totalRoutes')) is not int or table['totalRoutes'] != len(routes) or any(not isinstance(paths,list) for paths in routes.values()) or type(table.get('totalPaths')) is not int or table['totalPaths'] != sum(len(paths) for paths in routes.values()):
        raise RuntimeError('Received route table scope differs')
    paths = routes.get(route_binding['prefix'])
    if not isinstance(paths,list) or not paths or any(not isinstance(path,dict) for path in paths) or len({json.dumps({key:path.get(key) for key in ['peerId','path','nexthops']},sort_keys=True) for path in paths}) != len(paths):
        raise RuntimeError('Received prefix is missing, malformed or duplicate')
    best = [path for path in paths if path.get('bestpath') is True]
    if len(best) != 1:
        raise RuntimeError('One selected received path required')
    path = best[0]
    peers = [peer for peer in route_binding['sourcePeers'] if peer['address'] == path.get('peerId')]
    nexthops = path.get('nexthops')
    if len(peers) != 1 or path.get('network') != route_binding['prefix'] or path.get('valid') is not True or any(path.get(key,False) is not False for key in ['stale','removed','suppressed','history','damped','unsorted']) or not path_matches(path.get('path')) or not isinstance(nexthops,list) or len(nexthops) != 1 or not isinstance(nexthops[0],dict) or nexthops[0].get('ip') != peers[0]['address'] or nexthops[0].get('afi') != 'ipv4' or nexthops[0].get('used') is not True:
        raise RuntimeError('Selected received path source or next hop differs')
    route = dict(direction='received',prefix=route_binding['prefix'],peerAddress=peers[0]['address'],asn=source_asn,path=path['path'],nextHop=nexthops[0]['ip'],nextHopEncoding='explicit',selected=True)
else:
    routes = table.get('advertisedRoutes')
    if table.get('bgpLocalRouterId') != route_binding['localAddress'] or not isinstance(routes,dict) or type(table.get('totalPrefixCounter')) is not int or table['totalPrefixCounter'] != len(routes):
        raise RuntimeError('Advertised route scope differs')
    path = routes.get(route_binding['prefix'])
    if not isinstance(path,dict) or path.get('network') != route_binding['prefix'] or path.get('valid') is not True or path.get('best') is not True or not path_matches(path.get('path')) or path.get('nextHop') not in ['0.0.0.0',route_binding['localAddress']]:
        raise RuntimeError('Advertised prefix policy or next-hop encoding differs')
    route = dict(direction='advertised',prefix=route_binding['prefix'],peerAddress=route_binding['peerAddress'],asn=source_asn,path=path['path'],nextHop=path['nextHop'],nextHopEncoding='implicit-self' if path['nextHop']=='0.0.0.0' else 'explicit-self',selected=True)
final = json.loads(run([docker,'container','inspect','xcsh-relay-frr']))
if len(final) != 1 or final[0].get('Id') != container_id or final[0].get('Image') != image_id or final[0].get('State',{}).get('Running') is not True:
    raise RuntimeError('FRR container changed during route collection')
print('XCSH_RELAY_ROUTE:' + expected['nonce'] + ':' + json.dumps(dict(session=dict(guest=receipt,sessions=sessions),route=route), separators=(',',':')))
`;
  const python = sessionRequest.python.replace(original, readback.trimEnd());
  const script = `python3 - <<'XCSH_RELAY_GUEST'\n${python}XCSH_RELAY_GUEST`;
  const body = { commandId: 'RunShellScript', script: [script] };
  const args = [...sessionRequest.args];
  args[args.indexOf('--scripts') + 1] = script;
  const draft = { sessionRequest, routeBinding, python, body, args };
  return { ...draft, requestSha256: canonicalSha256(draft) };
}
export type AzureRelayGuestRouteRequest = ReturnType<typeof compileAzureRelayGuestRoute>;

/** FRR RIB/Adj-RIB-Out membership only. Does not assert Linux FIB installation, CE freshness or traffic. */
export function parseAzureRelayGuestRoute(request: AzureRelayGuestRouteRequest, raw: unknown) {
  const { requestSha256, ...draft } = request;
  require(requestSha256 === canonicalSha256(draft), 'request integrity differs');
  const value = object(raw);
  require(!value.error &&
    !value.nextLink &&
    Array.isArray(value.value) &&
    value.value.length === 2, 'complete public command result required');
  const entries = (value.value as unknown[]).map(object);
  const stdout = entries.filter((row) => row.code === 'ComponentStatus/StdOut/succeeded' && row.level === 'Info');
  const stderr = entries.filter((row) => row.code === 'ComponentStatus/StdErr/succeeded' && row.level === 'Info');
  require(stdout.length === 1 &&
    stderr.length === 1 &&
    typeof stdout[0].message === 'string' &&
    typeof stderr[0].message === 'string' &&
    !stderr[0].message.trim(), 'route command unavailable or has diagnostics');
  const nonce = request.sessionRequest.expected.nonce;
  const prefix = `XCSH_RELAY_ROUTE:${nonce}:`;
  const lines = (stdout[0].message as string).trim().split('\n');
  require(lines.length === 1 && lines[0].startsWith(prefix), 'one nonce-bound route receipt required');
  const payload = object(JSON.parse(lines[0].slice(prefix.length)));
  require(Object.keys(payload).sort().join(',') === 'route,session', 'unexpected route receipt fields');
  const session = parseAzureRelayGuestSessions(request.sessionRequest, {
    value: [
      {
        code: 'ComponentStatus/StdOut/succeeded',
        level: 'Info',
        message: `XCSH_RELAY_SESSIONS:${nonce}:${JSON.stringify(payload.session)}`,
      },
      { code: 'ComponentStatus/StdErr/succeeded', level: 'Info', message: '' },
    ],
  });
  const route = object(payload.route);
  const binding = request.routeBinding;
  const asn = binding.sourcePeers[0].asn;
  require(Object.keys(route).sort().join(',') ===
    'asn,direction,nextHop,nextHopEncoding,path,peerAddress,prefix,selected' &&
    route.direction === binding.direction &&
    route.prefix === binding.prefix &&
    route.asn === asn &&
    typeof route.path === 'string' &&
    new RegExp(`^${asn}(?: ${asn})*$`).test(route.path) &&
    route.selected === true, 'route identity or source path differs');
  if (binding.direction === 'received')
    require(binding.sourcePeers.some((peer) => peer.address === route.peerAddress) &&
      route.nextHop === route.peerAddress &&
      route.nextHopEncoding === 'explicit', 'received source/next hop differs');
  else
    require(route.peerAddress === binding.peerAddress &&
      ((route.nextHop === '0.0.0.0' && route.nextHopEncoding === 'implicit-self') ||
        (route.nextHop === binding.localAddress &&
          route.nextHopEncoding === 'explicit-self')), 'advertised peer/encoding differs');
  return {
    status: 'observed' as const,
    source: 'current-frr-route-membership' as const,
    session,
    route,
    requestSha256,
    collectedAt: new Date().toISOString(),
    fib: 'unknown' as const,
    traffic: 'unknown' as const,
    freshness: 'unqualified' as const,
    ceSampleFreshnessQualified: false as const,
  };
}
