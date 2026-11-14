import { isIP } from 'node:net';
import { sha256Hex } from './canonical';
import { type AzureRelayPlan, verifyAzureRelayPlan } from './relay-plan';
import { azureRelayResourceSource } from './relay-replacement-plan';
import type { observeAzureRelayRouteServerIdentity } from './relay-route-server';
import type { AzureCePlan } from './types';

type RouteServerIdentity = Awaited<ReturnType<typeof observeAzureRelayRouteServerIdentity>>;
const require = (condition: unknown, message: string): void => {
  if (!condition) throw Error(`Azure relay FRR config: ${message}`);
};
const ipv4 = (address: string) => address.split('.').reduce((sum, octet) => sum * 256 + Number(octet), 0);
const canonicalPrefix = (value: string) => {
  if (typeof value !== 'string') return false;
  const [address, prefix, extra] = value.split('/');
  if (extra !== undefined || isIP(address) !== 4 || !/^(?:[1-9]|[12][0-9]|3[0-2])$/.test(prefix)) return false;
  const first = Number(address.split('.')[0]);
  return first !== 0 && first !== 127 && first < 224 && ipv4(address) % 2 ** (32 - Number(prefix)) === 0;
};

/** Compile from already joined cloud identity and authoritative CE SLO addresses; the caller owns CE evidence qualification. */
export function compileAzureRelayFrrConfig(
  source: AzureCePlan,
  plan: AzureRelayPlan,
  relayName: string,
  server: RouteServerIdentity,
  ceEndpoints: Array<{ node: number; address: string }>,
  returnPrefixes: string[],
) {
  verifyAzureRelayPlan(source, plan);
  const selected = plan.relays.filter((relay) => relay.name === relayName);
  require(selected.length === 1, 'selected relay is not in saved plan');
  const relay = selected[0];
  require(server.status === 'observed' &&
    server.planSha256 === plan.planSha256 &&
    server.sourcePlanSha256 === source.planSha256 &&
    server.routeServerId === plan.routeServerId, 'current joined Route Server identity required');
  require(server.relays.length === 2 &&
    plan.relays.every(
      (expected) =>
        server.relays.filter(
          (current) =>
            current.name === expected.name &&
            current.vmId === expected.vmId &&
            current.nicId === expected.nicId &&
            current.address === expected.privateAddress &&
            current.asn === expected.asn,
        ).length === 1,
    ), 'current relay identities differ');
  const [network, prefix] = plan.sloCidr.split('/');
  const start = ipv4(network),
    end = start + 2 ** (32 - Number(prefix)) - 1;
  require(Array.isArray(ceEndpoints) &&
    ceEndpoints.length === source.topology.nodeCount &&
    new Set(ceEndpoints.map((endpoint) => endpoint.node)).size === source.topology.nodeCount &&
    new Set(ceEndpoints.map((endpoint) => endpoint.address)).size === source.topology.nodeCount &&
    ceEndpoints.every(
      (endpoint) =>
        Number.isInteger(endpoint.node) &&
        endpoint.node >= 1 &&
        endpoint.node <= source.topology.nodeCount &&
        isIP(endpoint.address) === 4 &&
        ipv4(endpoint.address) > start + 3 &&
        ipv4(endpoint.address) < end &&
        !plan.relays.some((current) => current.privateAddress === endpoint.address),
    ), 'one distinct usable CE SLO address per planned node required');
  require(Array.isArray(returnPrefixes) &&
    returnPrefixes.length > 0 &&
    returnPrefixes.length <= 32 &&
    new Set(returnPrefixes).size === returnPrefixes.length &&
    returnPrefixes.every(canonicalPrefix), 'explicit distinct canonical return prefix policy required');
  require(server.serviceAddresses.length === 2 &&
    new Set(server.serviceAddresses).size === 2 &&
    server.serviceAddresses.every(
      (address) =>
        isIP(address) === 4 &&
        !ceEndpoints.some((endpoint) => endpoint.address === address) &&
        !plan.relays.some((current) => current.privateAddress === address),
    ), 'two resolved Route Server service addresses required');
  require(JSON.stringify(returnPrefixes.toSorted()) ===
    JSON.stringify(plan.returnPrefixes), 'return policy differs from saved plan');
  // Route Server exchanges BGP; it never forwards payload packets. Keep its control
  // subnet reachable independently of learned routes, and rewrite only return FIB
  // next hops at the BGP-to-Zebra boundary (the BGP RIB remains unchanged).
  const gatewayNumber = start + 1;
  const azureGateway = [24, 16, 8, 0].map((shift) => Math.floor(gatewayNumber / 2 ** shift) % 256).join('.');
  const controlSubnets = azureRelayResourceSource(source).actions.filter(
    (action) => action.kind === 'subnet-create' && action.resourceId === `${plan.vnetId}/subnets/RouteServerSubnet`,
  );
  require(controlSubnets.length === 1, 'one saved Route Server control subnet required');
  const controlArgs = controlSubnets[0].args;
  require(controlArgs?.filter((arg) => arg === '--address-prefixes').length ===
    1, 'resolved control subnet prefix required');
  const controlCidr = controlArgs?.[(controlArgs?.indexOf('--address-prefixes') ?? -1) + 1] ?? '';
  const [controlNetwork, controlPrefix] = controlCidr.split('/');
  require(canonicalPrefix(controlCidr) &&
    controlPrefix === '26' &&
    server.serviceAddresses.every(
      (address) => ipv4(address) > ipv4(controlNetwork) + 3 && ipv4(address) < ipv4(controlNetwork) + 63,
    ), 'joined service addresses must belong to the saved control subnet');
  const lines = [
    `frr version ${plan.frr.version}`,
    'frr defaults traditional',
    `hostname ${relay.name}`,
    'log stdout',
    'service integrated-vtysh-config',
    '!',
    `ip route ${controlCidr} ${azureGateway}`,
    '!',
    ...plan.vipPrefixes.map((value, index) => `ip prefix-list XCSH-VIP seq ${(index + 1) * 10} permit ${value}`),
    ...returnPrefixes
      .toSorted()
      .map((value, index) => `ip prefix-list XCSH-RETURN seq ${(index + 1) * 10} permit ${value}`),
    '!',
    'route-map XCSH-VIP permit 10',
    ' match ip address prefix-list XCSH-VIP',
    '!',
    'route-map XCSH-RETURN permit 10',
    ' match ip address prefix-list XCSH-RETURN',
    '!',
    'route-map XCSH-FIB permit 10',
    ' match ip address prefix-list XCSH-VIP',
    '!',
    'route-map XCSH-FIB permit 20',
    ' match ip address prefix-list XCSH-RETURN',
    ` set ip next-hop ${azureGateway}`,
    '!',
    `router bgp ${relay.asn}`,
    ` bgp router-id ${relay.privateAddress}`,
    ' bgp ebgp-requires-policy',
    ' neighbor XCSH-CE peer-group',
    ` neighbor XCSH-CE remote-as ${plan.localAsn}`,
    ...ceEndpoints
      .toSorted((a, b) => a.node - b.node)
      .map((endpoint) => ` neighbor ${endpoint.address} peer-group XCSH-CE`),
    ' neighbor XCSH-RS peer-group',
    ' neighbor XCSH-RS remote-as 65515',
    ' neighbor XCSH-RS ebgp-multihop 2',
    ` neighbor XCSH-RS update-source ${relay.privateAddress}`,
    ...server.serviceAddresses.toSorted().map((address) => ` neighbor ${address} peer-group XCSH-RS`),
    ' !',
    ' address-family ipv4 unicast',
    '  table-map XCSH-FIB',
    '  neighbor XCSH-CE activate',
    '  neighbor XCSH-CE route-map XCSH-VIP in',
    '  neighbor XCSH-CE route-map XCSH-RETURN out',
    '  neighbor XCSH-RS activate',
    '  neighbor XCSH-RS route-map XCSH-RETURN in',
    '  neighbor XCSH-RS route-map XCSH-VIP out',
    ' exit-address-family',
    '!',
  ];
  const config = `${lines.join('\n')}\n`;
  return {
    relayName,
    sourcePlanSha256: source.planSha256,
    relayPlanSha256: plan.planSha256,
    config,
    configSha256: sha256Hex(config),
    ceEndpoints: structuredClone(ceEndpoints),
    forwarding: { azureGateway, controlCidr, policy: 'bgp-to-zebra-table-map' as const, qualified: false as const },
    returnPrefixes: returnPrefixes.toSorted(),
    sessions: 'unknown' as const,
    traffic: 'unknown' as const,
  };
}
