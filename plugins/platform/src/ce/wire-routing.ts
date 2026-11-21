import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { createWireValidator } from './wire-schema';

type Json = Record<string, unknown>;
export interface AwsGreBinding {
  name: string;
  node: string;
  interfaceName: string;
  interfaceMtu: number;
  awsGreAddress: string;
  ceInsideAddress: string;
  awsBgpAddresses: [string, string];
}
export interface AzureSloBinding {
  node: string;
  interfaceName: string;
}
export interface AzureRelaySloBinding extends AzureSloBinding {
  role: 'slo';
}
export interface AzureRelayPeer {
  name: string;
  address: string;
  asn: number;
}

/** Translate observer-supplied SLO/relay identities into ordinary external BGP.
 * Cloud ownership, current link evidence and FRR transit require separate runtime gates.
 */
export function buildAzureRelayRouting(
  siteName: string,
  localAsn: number,
  bindings: AzureRelaySloBinding[],
  relays: AzureRelayPeer[],
  validate: (kind: 'external_connector' | 'bgp_routing_policy' | 'bgp', spec: Json) => void,
) {
  const name = /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
  const interfaceName = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/;
  const reserved = new Set([8074, 8075, 12076, 23456, 65515, 65517, 65518, 65519, 65520]);
  const validAsn = (asn: number) =>
    Number.isInteger(asn) && asn > 0 && asn < 65535 && !reserved.has(asn) && !(asn >= 64496 && asn <= 64511);
  if (
    typeof siteName !== 'string' ||
    !name.test(siteName) ||
    !validAsn(localAsn) ||
    !Array.isArray(bindings) ||
    ![1, 3].includes(bindings.length) ||
    !Array.isArray(relays) ||
    relays.length !== 2
  )
    throw new Error('Unsupported Azure CE-to-relay site or peer topology');
  const nodes = new Set<string>();
  const interfaces = new Set<string>();
  for (const binding of bindings) {
    if (
      !binding ||
      typeof binding.node !== 'string' ||
      !name.test(binding.node) ||
      nodes.has(binding.node) ||
      binding.role !== 'slo' ||
      typeof binding.interfaceName !== 'string' ||
      !interfaceName.test(binding.interfaceName) ||
      binding.interfaceName.includes('__') ||
      interfaces.has(binding.interfaceName)
    )
      throw new Error('Explicit unique Azure SLO interface bindings are required');
    nodes.add(binding.node);
    interfaces.add(binding.interfaceName);
  }
  const relayNames = new Set<string>();
  const addresses = new Set<string>();
  for (const relay of relays) {
    if (
      !relay ||
      typeof relay.name !== 'string' ||
      !name.test(relay.name) ||
      relayNames.has(relay.name) ||
      typeof relay.address !== 'string' ||
      isIP(relay.address) !== 4 ||
      addresses.has(relay.address) ||
      !validAsn(relay.asn) ||
      relay.asn === localAsn
    )
      throw new Error('Two explicit distinct Azure relay peers and external ASNs are required');
    const octets = relay.address.split('.').map(Number);
    if (octets[0] === 0 || octets[0] === 127 || octets[0] >= 224 || (octets[0] === 169 && octets[1] === 254))
      throw new Error('Azure relay peers require unicast NIC IPv4 addresses');
    relayNames.add(relay.name);
    addresses.add(relay.address);
  }
  const orderedBindings = bindings.toSorted((a, b) => (a.node < b.node ? -1 : a.node > b.node ? 1 : 0));
  const orderedRelays = relays.toSorted((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const expectedPeers = orderedBindings.flatMap((binding) =>
    orderedRelays.map((relay) => ({
      node: binding.node,
      interfaceName: binding.interfaceName,
      peerAddress: relay.address,
      peerAsn: relay.asn,
      relayName: relay.name,
    })),
  );
  const spec = {
    where: {
      site: {
        network_type: 'VIRTUAL_NETWORK_SITE_LOCAL',
        ref: [{ name: siteName, namespace: 'system' }],
        disable_internet_vip: {},
      },
    },
    bgp_parameters: { asn: localAsn, local_address: {} },
    peers: orderedBindings.flatMap((binding, nodeIndex) =>
      orderedRelays.map((relay, relayIndex) => ({
        metadata: { name: `peer-${nodeIndex + 1}-${relayIndex + 1}` },
        external: {
          asn: relay.asn,
          address: relay.address,
          port: 179,
          interface: { name: binding.interfaceName, namespace: 'system' },
          disable_v6: {},
        },
        passive_mode_disabled: {},
        bfd_disabled: {},
      })),
    ),
  };
  validate('bgp', spec);
  const suffix = '-relay-bgp';
  const resourceName =
    siteName.length + suffix.length <= 63
      ? siteName + suffix
      : `${siteName.slice(0, 44)}-${createHash('sha256').update(siteName).digest('hex').slice(0, 8)}${suffix}`;
  return {
    bgp: { name: resourceName, spec },
    expectedPeers,
    expectedSessions: expectedPeers.length,
    payloadNetwork: 'slo' as const,
  };
}

/** Build one site-scoped BGP object from observed SLO objects and both Azure Route Server addresses. */
export function buildAzureRouting(
  siteName: string,
  localAsn: number,
  remoteAsn: number,
  bindings: AzureSloBinding[],
  routeServerAddresses: string[],
  validate: (kind: 'external_connector' | 'bgp_routing_policy' | 'bgp', spec: Json) => void,
) {
  const name = /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
  const interfaceName = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/;
  const reserved = new Set([8074, 8075, 12076, 23456, 65515, 65517, 65518, 65519, 65520]);
  if (
    !name.test(siteName) ||
    ![1, 3].includes(bindings.length) ||
    !Number.isInteger(localAsn) ||
    localAsn < 1 ||
    localAsn > 65534 ||
    reserved.has(localAsn) ||
    (localAsn >= 64496 && localAsn <= 64511) ||
    remoteAsn !== 65515 ||
    routeServerAddresses.length !== 2 ||
    new Set(routeServerAddresses).size !== 2 ||
    routeServerAddresses.some((address) => isIP(address) !== 4)
  )
    throw new Error('Unsupported Azure Route Server site or peer topology');
  const nodes = new Set<string>();
  const interfaces = new Set<string>();
  for (const binding of bindings) {
    if (
      !name.test(binding.node) ||
      nodes.has(binding.node) ||
      !interfaceName.test(binding.interfaceName) ||
      binding.interfaceName.includes('__') ||
      interfaces.has(binding.interfaceName)
    )
      throw new Error('Invalid observed Azure SLO interface binding');
    nodes.add(binding.node);
    interfaces.add(binding.interfaceName);
  }
  const spec = {
    where: {
      site: {
        network_type: 'VIRTUAL_NETWORK_SITE_LOCAL',
        ref: [{ name: siteName, namespace: 'system' }],
        disable_internet_vip: {},
      },
    },
    bgp_parameters: { asn: localAsn, local_address: {} },
    peers: bindings.flatMap((binding, bindingIndex) =>
      routeServerAddresses.map((address, addressIndex) => ({
        metadata: { name: `peer-${bindingIndex + 1}-${addressIndex + 1}` },
        external: {
          asn: remoteAsn,
          address,
          port: 179,
          interface: { name: binding.interfaceName, namespace: 'system' },
          disable_v6: {},
        },
        passive_mode_disabled: {},
        bfd_disabled: {},
      })),
    ),
  };
  validate('bgp', spec);
  return {
    bgp: { name: `${siteName.slice(0, 45)}-route-server-bgp`, spec },
    expectedSessions: bindings.length * routeServerAddresses.length,
    payloadNetwork: 'slo' as const,
  };
}

export function buildAwsRouting(
  siteName: string,
  localAsn: number,
  remoteAsn: number,
  bindings: AwsGreBinding[],
  deniedExportPrefixes: string[],
  validate: (kind: 'external_connector' | 'bgp_routing_policy' | 'bgp', spec: Json) => void,
) {
  const name = /^[a-z][a-z0-9-]{0,62}$/;
  if (
    !name.test(siteName) ||
    !bindings.length ||
    bindings.length > 4 ||
    ![localAsn, remoteAsn].every((asn) => Number.isInteger(asn) && asn > 0 && asn < 4294967295) ||
    localAsn === remoteAsn ||
    !Array.isArray(deniedExportPrefixes) ||
    deniedExportPrefixes.length < 1 ||
    deniedExportPrefixes.length > 8 ||
    new Set(deniedExportPrefixes).size !== deniedExportPrefixes.length ||
    deniedExportPrefixes.some((prefix) => {
      const [address, length, extra] = prefix.split('/');
      return extra !== undefined || isIP(address) !== 4 || !/^\d+$/.test(length ?? '') || Number(length) > 32;
    })
  )
    throw new Error('Unsupported AWS routing site or peer topology');
  const names = new Set<string>();
  const endpoints = new Set<string>();
  const connectors = bindings.map((binding) => {
    if (
      !name.test(binding.name) ||
      names.has(binding.name) ||
      !name.test(binding.node) ||
      !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(binding.interfaceName) ||
      !Number.isInteger(binding.interfaceMtu) ||
      binding.interfaceMtu < 600 ||
      binding.interfaceMtu > 9000 ||
      !Array.isArray(binding.awsBgpAddresses) ||
      binding.awsBgpAddresses.length !== 2
    )
      throw new Error('Invalid observed GRE interface binding');
    names.add(binding.name);
    if (
      [binding.awsGreAddress, binding.ceInsideAddress, ...binding.awsBgpAddresses].some(
        (address) => isIP(address) !== 4,
      ) ||
      binding.awsBgpAddresses[0] === binding.awsBgpAddresses[1] ||
      binding.awsBgpAddresses.includes(binding.ceInsideAddress)
    )
      throw new Error('Invalid AWS GRE or BGP endpoint evidence');
    const numeric = (address: string) => address.split('.').reduce((value, octet) => value * 256 + Number(octet), 0);
    const local = numeric(binding.ceInsideAddress);
    const network = Math.floor(local / 8) * 8;
    if (
      !binding.ceInsideAddress.startsWith('169.254.') ||
      local - network !== 1 ||
      binding.awsBgpAddresses.some(
        (address) =>
          Math.floor(numeric(address) / 8) * 8 !== network ||
          numeric(address) - network < 2 ||
          numeric(address) - network > 6,
      )
    )
      throw new Error('AWS BGP endpoints do not share the observed inside network');
    for (const address of binding.awsBgpAddresses) {
      if (endpoints.has(address)) throw new Error('Duplicate AWS BGP endpoint');
      endpoints.add(address);
    }
    const spec = {
      ce_site_reference: { name: siteName, namespace: 'system' },
      gre: {
        gre_parameters: {
          // XC requires the TGW payload in SLI even when the observed GRE transport interface is SLO.
          site_local_inside_network: {},
          tunnel_mtu: Math.min(binding.interfaceMtu - 24, 1370),
          peer_ip_address: { addr: binding.awsGreAddress },
          tunnel_eps: [
            {
              node: binding.node,
              interface: binding.interfaceName,
              local_tunnel_ip: `${binding.ceInsideAddress}/29`,
              remote_tunnel_ip: `${binding.awsBgpAddresses[0]}/29`,
            },
          ],
        },
      },
    };
    validate('external_connector', spec);
    return { name: binding.name, spec };
  });
  const exportPolicy = {
    name: `${siteName.slice(0, 43)}-tgw-export-policy`,
    spec: {
      rules: [
        {
          match: {
            ip_prefixes: {
              // Drop only the prefixes learned from the workload side. Local
              // service VIPs must remain eligible for TGW advertisement.
              prefixes: deniedExportPrefixes.map((ip_prefixes) => ({ ip_prefixes, equal_or_longer_than: {} })),
            },
          },
          action: { deny: {} },
        },
      ],
    },
  };
  validate('bgp_routing_policy', exportPolicy.spec);
  const bgpSpec = {
    where: {
      site: { network_type: 'VIRTUAL_NETWORK_SITE_LOCAL_INSIDE', ref: [{ name: siteName, namespace: 'system' }] },
    },
    bgp_parameters: { asn: localAsn, local_address: {} },
    peers: bindings.flatMap((binding, bindingIndex) =>
      binding.awsBgpAddresses.map((address, index) => ({
        metadata: { name: `peer-${bindingIndex + 1}-${index + 1}` },
        external: {
          asn: remoteAsn,
          address,
          port: 179,
          family_inet: { enable: {} },
          interface: { name: `ves-io-external-connector-${binding.name}`, namespace: 'system' },
          disable_v6: {},
        },
        passive_mode_disabled: {},
        bfd_disabled: {},
      })),
    ),
  };
  validate('bgp', bgpSpec);
  return {
    connectors,
    exportPolicy,
    bgp: { name: `${siteName.slice(0, 55)}-tgw-bgp`, spec: bgpSpec },
    payloadNetwork: 'sli',
    expectedSessions: bindings.length * 2,
    ebgpMultihopTtlEvidence: 'unknown',
  };
}
export function routingValidators(
  network: Json,
  marketplace: Json,
): (kind: 'external_connector' | 'bgp_routing_policy' | 'bgp', spec: Json) => void {
  const validators = {
    bgp: createWireValidator(network, 'bgpCreateSpecType'),
    bgp_routing_policy: createWireValidator(network, 'schemabgp_routing_policyCreateSpecType'),
    external_connector: createWireValidator(marketplace, 'external_connectorCreateSpecType'),
  };
  return (kind, spec) => validators[kind](spec);
}
