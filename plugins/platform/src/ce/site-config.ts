import { isIP } from 'node:net';
import type { CeV2Capabilities, CeV2SiteConfig } from './driver';
import { assertSafeName, PublicCeError } from './security';

const PROFILES = {
  aws: new Set(['direct-eni', 'nlb-ingress', 'tgw-static', 'tgw-connect']),
  azure: new Set(['direct-nic', 'load-balancer-ingress', 'route-server-bgp']),
} as const;

function assertOrdered(items: Array<{ index: number }>, label: string): void {
  if (items.some((item, index) => !Number.isInteger(item.index) || item.index !== index))
    throw new PublicCeError(`${label} must be ordered with contiguous zero-based indexes`);
}

function assertIp(value: string, label: string): void {
  if (!isIP(value)) throw new PublicCeError(`${label} must be an IPv4 or IPv6 address`);
}

function assertCidr(value: string, label: string): void {
  const separator = value.lastIndexOf('/');
  const address = separator > 0 ? value.slice(0, separator) : '';
  const prefix = separator > 0 ? Number(value.slice(separator + 1)) : Number.NaN;
  const family = isIP(address);
  if (!family || !Number.isInteger(prefix) || prefix < 0 || prefix > (family === 4 ? 32 : 128))
    throw new PublicCeError(`${label} must be an IPv4 or IPv6 CIDR`);
}

export function assertCeV2SiteConfig(value: unknown): asserts value is CeV2SiteConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new PublicCeError('config must use the typed provider-neutral CE configuration');
  const config = value as Partial<CeV2SiteConfig>;
  if (config.provider !== 'aws' && config.provider !== 'azure')
    throw new PublicCeError('config must use the typed provider-neutral CE configuration with provider aws or azure');
  if (config.haMode !== 'one-node' && config.haMode !== 'three-node')
    throw new PublicCeError('config.haMode must be one-node or three-node');
  if (!Array.isArray(config.vrfs) || config.vrfs.length < 1 || config.vrfs.length > 8)
    throw new PublicCeError('config.vrfs must contain between 1 and 8 ordered VRFs');
  assertOrdered(config.vrfs, 'config.vrfs');
  const vrfNames = new Set<string>();
  for (const vrf of config.vrfs) {
    assertSafeName(vrf.name, 'config.vrfs.name');
    if (vrfNames.has(vrf.name)) throw new PublicCeError('config.vrfs names must be unique');
    vrfNames.add(vrf.name);
  }
  if (!Array.isArray(config.interfaces) || config.interfaces.length < 1 || config.interfaces.length > 8)
    throw new PublicCeError('config.interfaces must contain between 1 and 8 ordered interfaces');
  assertOrdered(config.interfaces, 'config.interfaces');
  for (const item of config.interfaces) {
    if (!['slo', 'sli', 'management', 'service', 'workload'].includes(item.role))
      throw new PublicCeError('config.interfaces.role is invalid');
    if (!vrfNames.has(item.vrf)) throw new PublicCeError('config.interfaces.vrf must reference an ordered VRF');
    if (!item.addressing || !['dhcp', 'static'].includes(item.addressing.mode))
      throw new PublicCeError('config.interfaces.addressing.mode must be dhcp or static');
    if (!Array.isArray(item.addressing.addresses))
      throw new PublicCeError('config.interfaces.addressing.addresses must be an ordered array');
    item.addressing.addresses.forEach((address, index) => {
      assertCidr(address, `config.interfaces[${item.index}].addressing.addresses[${index}]`);
    });
    if (item.addressing.mode === 'static' && item.addressing.addresses.length < 1)
      throw new PublicCeError('static interfaces require at least one address');
    if (item.addressing.gateway) assertIp(item.addressing.gateway, 'config.interfaces.addressing.gateway');
  }
  if (!Array.isArray(config.bgpPeers)) throw new PublicCeError('config.bgpPeers must be an ordered array');
  assertOrdered(config.bgpPeers, 'config.bgpPeers');
  for (const peer of config.bgpPeers) {
    if (!vrfNames.has(peer.vrf)) throw new PublicCeError('config.bgpPeers.vrf must reference an ordered VRF');
    if (!config.interfaces[peer.interfaceIndex])
      throw new PublicCeError('config.bgpPeers.interfaceIndex must reference an ordered interface');
    assertIp(peer.peerAddress, 'config.bgpPeers.peerAddress');
    for (const [label, asn] of [
      ['localAsn', peer.localAsn],
      ['peerAsn', peer.peerAsn],
    ] as const)
      if (!Number.isInteger(asn) || asn < 1 || asn > 4_294_967_294)
        throw new PublicCeError(`config.bgpPeers.${label} must be a valid ASN`);
  }
  if (!config.providerNetwork || !PROFILES[config.provider].has(config.providerNetwork.profile as never))
    throw new PublicCeError(`config.providerNetwork.profile is not valid for ${config.provider}`);
  if (
    !config.providerNetwork.metadata ||
    typeof config.providerNetwork.metadata !== 'object' ||
    Array.isArray(config.providerNetwork.metadata)
  )
    throw new PublicCeError('config.providerNetwork.metadata must be a provider metadata object');
  for (const item of Object.values(config.providerNetwork.metadata))
    if (
      !['string', 'number', 'boolean'].includes(typeof item) &&
      !(Array.isArray(item) && item.every((entry) => typeof entry === 'string'))
    )
      throw new PublicCeError('config.providerNetwork.metadata values must be scalar or string arrays');
}

export function assertCapabilitiesSupportConfig(capabilities: CeV2Capabilities, config: CeV2SiteConfig): void {
  if (!capabilities.supportedProviders.includes(config.provider))
    throw new PublicCeError(`Tenant does not advertise Secure Mesh Site v2 support for ${config.provider}`);
  if (!capabilities.providerNetworkingProfiles[config.provider]?.includes(config.providerNetwork.profile))
    throw new PublicCeError(
      `Tenant does not advertise ${config.providerNetwork.profile} for Secure Mesh Site v2 on ${config.provider}`,
    );
  if (
    config.provider === 'aws' &&
    config.providerNetwork.profile === 'tgw-connect' &&
    (!capabilities.awsSmsv2TgwConnect.supported || !capabilities.awsSmsv2TgwConnect.schemaVersion)
  )
    throw new PublicCeError('Tenant does not advertise a supported aws-smsv2-tgw-connect schema');
}
