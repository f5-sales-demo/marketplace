import { canonicalSha256 } from './canonical';
import {
  compileAzureRelayGuestActivation,
  compileAzureRelayGuestObservation,
  parseAzureRelayGuestReceipt,
} from './relay-guest';
import type { AzureRelayPlan } from './relay-plan';
import type { observeAzureRelayRouteServerIdentity } from './relay-route-server';
import type { AzureCePlan } from './types';

type Json = Record<string, unknown>;
const require = (value: unknown, message: string): void => {
  if (!value) throw Error(`Azure relay guest sessions: ${message}`);
};
const object = (value: unknown): Json => {
  require(value && typeof value === 'object' && !Array.isArray(value), 'malformed session evidence');
  return value as Json;
};

/** FRR 10.4.1 bgp_vty.c neighbor readback; no prefix-count or session-uptime freshness inference. */
export function compileAzureRelayGuestSessions(
  source: AzureCePlan,
  plan: AzureRelayPlan,
  relayName: string,
  identity: Awaited<ReturnType<typeof observeAzureRelayRouteServerIdentity>>,
  ceEndpoints: Array<{ node: number; address: string }>,
  nonce: string,
  outage?: { nodeIndex: number },
) {
  if (outage !== undefined)
    require(outage &&
      Object.keys(outage).join(',') === 'nodeIndex' &&
      source.topology.ha &&
      source.topology.nodeCount === 3 &&
      ceEndpoints.length === 3 &&
      Number.isInteger(outage.nodeIndex) &&
      outage.nodeIndex >= 1 &&
      outage.nodeIndex <= 3 &&
      ceEndpoints.filter((row) => row.node === outage.nodeIndex).length ===
        1, 'one selected node of a complete three-node HA peer scope required');
  require(plan.frr.version === '10.4.1', 'FRR neighbor mapping requires the qualified 10.4.1 version');
  const activation = compileAzureRelayGuestActivation(source, plan, relayName, identity, ceEndpoints, nonce);
  const observation = compileAzureRelayGuestObservation(activation);
  const relay = plan.relays.find((row) => row.name === relayName);
  if (!relay) throw Error('Azure relay guest sessions: relay is absent');
  const peers = [
    ...ceEndpoints.toSorted((a, b) => a.node - b.node).map((row) => ({ address: row.address, asn: plan.localAsn })),
    ...identity.serviceAddresses.toSorted().map((address) => ({ address, asn: 65515 })),
  ];
  // Public FRR 10.4.1 bgp_debug.c states, not an inferred absence or administrative shutdown.
  const unavailablePeer =
    outage === undefined
      ? undefined
      : {
          nodeIndex: outage.nodeIndex,
          address: ceEndpoints.find((row) => row.node === outage.nodeIndex)?.address as string,
          states: ['Idle', 'Connect', 'Active'] as const,
        };
  const sessionBinding = {
    localAsn: relay.asn,
    localAddress: relay.privateAddress,
    peers,
    ...(unavailablePeer ? { unavailablePeer } : {}),
  };

  const encoded = Buffer.from(JSON.stringify(sessionBinding)).toString('base64');
  const original = "print('XCSH_RELAY_RECEIPT:' + expected['nonce'] + ':' + json.dumps(receipt, separators=(',',':')))";
  require(observation.python.split(original).length === 2, 'guest base program mapping differs');
  const readback = `binding = json.loads(base64.b64decode('${encoded}'))
neighbors = json.loads(run([docker,'exec',container_id,'/usr/bin/vtysh','-c','show bgp ipv4 neighbors json']))
if not isinstance(neighbors, dict) or sorted(neighbors) != sorted(peer['address'] for peer in binding['peers']):
    raise RuntimeError('FRR neighbor scope is missing or foreign')
sessions = []
for peer in binding['peers']:
    current = neighbors[peer['address']]
    wanted_states = binding['unavailablePeer']['states'] if peer['address'] == binding.get('unavailablePeer',{}).get('address') else ['Established']
    if not isinstance(current, dict) or current.get('localAs') != binding['localAsn'] or current.get('remoteAs') != peer['asn'] or current.get('localRouterId') != binding['localAddress'] or current.get('hostLocal') != binding['localAddress'] or current.get('hostForeign') != peer['address'] or current.get('bgpVersion') != 4 or current.get('adminShutDown', False) is not False or current.get('bgpState') not in wanted_states:
        raise RuntimeError('FRR current neighbor identity or establishment differs')
    session = dict(address=peer['address'],localAs=current['localAs'],remoteAs=current['remoteAs'],localRouterId=current['localRouterId'],hostLocal=current['hostLocal'],hostForeign=current['hostForeign'],bgpVersion=current['bgpVersion'],state=current['bgpState'])
    if 'unavailablePeer' in binding:
        session['adminShutDown'] = current.get('adminShutDown', False)
    sessions.append(session)
final = json.loads(run([docker,'container','inspect','xcsh-relay-frr']))
if len(final) != 1 or final[0].get('Id') != container_id or final[0].get('Image') != image_id or final[0].get('State',{}).get('Running') is not True:
    raise RuntimeError('FRR container changed during session collection')
print('XCSH_RELAY_SESSIONS:' + expected['nonce'] + ':' + json.dumps(dict(guest=receipt,sessions=sessions), separators=(',',':')))
`;
  const python = observation.python.replace(original, readback.trimEnd());
  const script = `python3 - <<'XCSH_RELAY_GUEST'\n${python}XCSH_RELAY_GUEST`;
  const body = { commandId: 'RunShellScript', script: [script] };
  const args = [...observation.args];
  args[args.indexOf('--scripts') + 1] = script;
  const draft = { expected: observation.expected, sessionBinding, body, args, python, observation };
  return { ...draft, requestSha256: canonicalSha256(draft) };
}
export type AzureRelayGuestSessionsRequest = ReturnType<typeof compileAzureRelayGuestSessions>;

/** Nonce- and identity-bound current FRR sessions; separate from route exchange and traffic. */
export function parseAzureRelayGuestSessions(request: AzureRelayGuestSessionsRequest, raw: unknown) {
  const { requestSha256, ...draft } = request;
  require(requestSha256 === canonicalSha256(draft), 'request integrity differs');
  const result = object(raw);
  require(Object.keys(result).every((key) => ['value', 'name', 'startTime', 'endTime'].includes(key)) &&
    Array.isArray(result.value) &&
    result.value.length === 2, 'complete public command result required');
  const values = (result.value as unknown[]).map(object);
  const stdout = values.filter((row) => row.code === 'ComponentStatus/StdOut/succeeded' && row.level === 'Info');
  const stderr = values.filter((row) => row.code === 'ComponentStatus/StdErr/succeeded' && row.level === 'Info');
  require(stdout.length === 1 &&
    stderr.length === 1 &&
    typeof stdout[0].message === 'string' &&
    typeof stderr[0].message === 'string' &&
    !stderr[0].message.trim(), 'session command evidence unavailable');
  const prefix = `XCSH_RELAY_SESSIONS:${request.expected.nonce}:`;
  const lines = (stdout[0].message as string).trim().split('\n');
  require(lines.length === 1 && lines[0].startsWith(prefix), 'one nonce-bound session receipt required');
  const payload = object(JSON.parse(lines[0].slice(prefix.length)));
  require(Object.keys(payload).sort().join(',') === 'guest,sessions', 'unexpected session receipt fields');
  const guest = parseAzureRelayGuestReceipt(request.observation, {
    value: [
      {
        code: 'ComponentStatus/StdOut/succeeded',
        level: 'Info',
        message: `XCSH_RELAY_RECEIPT:${request.expected.nonce}:${JSON.stringify(payload.guest)}`,
      },
      { code: 'ComponentStatus/StdErr/succeeded', level: 'Info', message: '' },
    ],
  });
  require(Array.isArray(payload.sessions) &&
    payload.sessions.length === request.sessionBinding.peers.length, 'complete FRR session scope required');
  const sessions = (payload.sessions as unknown[]).map(object);
  const unavailable = request.sessionBinding.unavailablePeer;
  if (unavailable)
    require(Object.keys(unavailable).sort().join(',') === 'address,nodeIndex,states' &&
      Number.isInteger(unavailable.nodeIndex) &&
      unavailable.nodeIndex >= 1 &&
      unavailable.nodeIndex <= 3 &&
      request.sessionBinding.peers.length === 5 &&
      request.sessionBinding.peers[unavailable.nodeIndex - 1].address === unavailable.address &&
      canonicalSha256(unavailable.states) ===
        canonicalSha256(['Idle', 'Connect', 'Active']), 'selected outage peer expectation differs');

  for (const peer of request.sessionBinding.peers) {
    const rows = sessions.filter((row) => row.address === peer.address);
    require(rows.length === 1, 'missing or duplicate FRR neighbor');
    const row = rows[0];
    require(Object.keys(row).sort().join(',') ===
      (unavailable
        ? 'address,adminShutDown,bgpVersion,hostForeign,hostLocal,localAs,localRouterId,remoteAs,state'
        : 'address,bgpVersion,hostForeign,hostLocal,localAs,localRouterId,remoteAs,state') &&
      row.localAs === request.sessionBinding.localAsn &&
      row.remoteAs === peer.asn &&
      row.localRouterId === request.sessionBinding.localAddress &&
      row.hostLocal === request.sessionBinding.localAddress &&
      row.hostForeign === peer.address &&
      row.bgpVersion === 4 &&
      (unavailable?.address === peer.address
        ? unavailable.states.includes(row.state as 'Idle' | 'Connect' | 'Active')
        : row.state === 'Established') &&
      (!unavailable || row.adminShutDown === false), 'current FRR session identity or establishment differs');
  }
  return {
    status: 'observed' as const,
    ...(unavailable
      ? {
          outage: {
            nodeIndex: unavailable.nodeIndex,
            address: unavailable.address,
            state: sessions.find((row) => row.address === unavailable.address)?.state,
            ceEstablishedSessions: 2 as const,
            routeServerEstablishedSessions: 2 as const,
          },
        }
      : {}),
    source: 'current-frr-neighbor-readback' as const,
    guest,
    sessions,
    requestSha256,
    collectedAt: new Date().toISOString(),
    routeExchange: 'unknown' as const,
    traffic: 'unknown' as const,
    freshness: 'unqualified' as const,
    ceSampleFreshnessQualified: false as const,
  };
}
