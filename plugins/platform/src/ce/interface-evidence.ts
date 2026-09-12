import { isIP } from 'node:net';

export interface ExpectedCeInterface {
  node: string;
  role: 'slo' | 'data' | 'sli';
  mac: string;
}
export interface ObservedCeInterface extends ExpectedCeInterface {
  device: string;
  interfaceName: string;
  mtu: number;
  linkUp: true;
  ipv4: { address: string; prefixLength: number } | null;
}
type Json = Record<string, unknown>;
const object = (value: unknown): Json => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed interface evidence');
  return value as Json;
};
const array = (value: unknown): unknown[] => {
  if (!Array.isArray(value)) throw new Error('Missing interface evidence collection');
  return value;
};
const mac = (value: unknown) => {
  if (typeof value !== 'string' || !/^(?:[0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/.test(value))
    throw new Error('Malformed interface MAC');
  return value.toLowerCase();
};
const identity = (value: unknown) => {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(value))
    throw new Error('Missing interface identity');
  return value;
};
const matchesNode = (expected: string, actual: unknown) =>
  actual === expected || (typeof actual === 'string' && actual.startsWith(`${expected}.`));

function observedIpv4(link: Json): ObservedCeInterface['ipv4'] {
  if (link.active_state !== 'STATE_ACTIVE') return null;
  try {
    const ipv4 = object(object(link.ip).ipv4);
    if (
      typeof ipv4.prefix !== 'string' ||
      isIP(ipv4.prefix) !== 4 ||
      !Number.isInteger(ipv4.plen) ||
      Number(ipv4.plen) < 0 ||
      Number(ipv4.plen) > 32
    )
      return null;
    return { address: ipv4.prefix, prefixLength: Number(ipv4.plen) };
  } catch {
    return null;
  }
}

/** Join configuration, generated-object ownership and current physical link publication. Names are never constructed. */
export function correlateCeInterfaces(
  configuration: Json,
  objects: Json,
  physical: Json,
  expected: ExpectedCeInterface[],
  provider: 'aws' | 'azure' = 'aws',
): ObservedCeInterface[] {
  const metadata = object(configuration.metadata);
  const uid = identity(object(configuration.system_metadata).uid);
  const statusMetadata = object(physical.metadata);
  if (statusMetadata.name !== metadata.name || metadata.namespace !== 'system' || statusMetadata.namespace !== 'system')
    throw new Error('Foreign physical site evidence');
  if (
    objects.next_page_token ||
    objects.next_token ||
    objects.continuation_token ||
    objects.NextToken ||
    (objects.errors !== undefined && array(objects.errors).length)
  )
    throw new Error('Partial interface discovery');
  const realized = array(objects.items).map(object);
  const configured = array(object(object(object(configuration.spec)[provider]).not_managed).node_list).flatMap(
    (item) => {
      const node = object(item);
      const hostname = identity(node.hostname);
      return array(node.interface_list).map((item) => {
        const iface = object(item);
        const ethernet = object(iface.ethernet_interface);
        const network = object(iface.network_option);
        const slo = Object.hasOwn(network, 'site_local_network');
        const sli = Object.hasOwn(network, 'site_local_inside_network');
        if (slo === sli || !Number.isInteger(iface.mtu) || Number(iface.mtu) < 576 || Number(iface.mtu) > 9000)
          throw new Error('Ambiguous interface role or MTU');
        return {
          node: hostname,
          mac: mac(ethernet.mac),
          device: identity(ethernet.device),
          outside: slo,
          mtu: Number(iface.mtu),
        };
      });
    },
  );
  const statuses = array(physical.status).map(object);
  const seen = new Set<string>();
  if (!expected.length) throw new Error('Expected interface bindings required');
  return expected.map((binding) => {
    const normalized = mac(binding.mac);
    const key = `${binding.node}/${normalized}`;
    if (seen.has(key)) throw new Error('Duplicate expected interface identity');
    seen.add(key);
    const candidates = configured.filter((item) => item.node === binding.node && item.mac === normalized);
    if (candidates.length !== 1 || candidates[0].outside !== (binding.role === 'slo'))
      throw new Error('Configured MAC binding differs');
    const { outside: _outside, ...configuredInterface } = candidates[0];
    const iface = { ...configuredInterface, role: binding.role };
    const matches = realized.filter((item) => {
      const owner = object(item.owner_view ?? {});
      if (
        owner.kind !== 'securemesh_site_v2' ||
        owner.name !== metadata.name ||
        owner.namespace !== 'system' ||
        owner.uid !== uid
      )
        return false;
      const ethernet = object(object(item.get_spec).ethernet_interface);
      if (ethernet.node !== iface.node || ethernet.device !== iface.device) return false;
      const slo = Object.hasOwn(ethernet, 'site_local_network');
      const sli = Object.hasOwn(ethernet, 'site_local_inside_network');
      if (item.namespace !== 'system' || slo === sli || slo !== (iface.role === 'slo') || ethernet.mtu !== iface.mtu)
        throw new Error('Realized interface disagrees with configured identity');
      return true;
    });
    if (matches.length !== 1) throw new Error('Ambiguous realized interface identity');
    const publications = statuses.filter((item) => {
      if (item.ver_status === undefined || item.ver_status === null) return false;
      const publisher = object(item.metadata);
      return (
        publisher.creator_class === 'ver' &&
        publisher.publish === 'STATUS_PUBLISH' &&
        publisher.vtrp_stale === false &&
        (matchesNode(iface.node, publisher.creator_id) ||
          // Current SMSv2 publications use the site as publisher. Require both
          // observed node identifiers and the exact physical-site reference.
          (publisher.creator_id === metadata.name &&
            publisher.status_id === `${iface.node}_SiteStatusMgr` &&
            object(item.ver_status).ver_instance_name === `${iface.node}-${metadata.name}` &&
            typeof object(physical.system_metadata ?? {}).uid === 'string' &&
            object(physical.system_metadata).uid !== '' &&
            array(item.object_refs).filter((ref) => {
              const value = object(ref);
              return value.kind === 'ves.io.vega.cfg.site.Object' && value.uid === object(physical.system_metadata).uid;
            }).length === 1))
      );
    });
    if (publications.length !== 1) throw new Error('Physical interface publication is missing, stale or duplicated');
    const links = array(object(publications[0].ver_status).intf_status)
      .map(object)
      .filter((item) => item.name === iface.device);
    if (
      links.length !== 1 ||
      mac(links[0].mac) !== normalized ||
      links[0].link_type !== 'LINK_TYPE_ETHERNET' ||
      links[0].network_type !==
        (iface.role === 'slo' ? 'VIRTUAL_NETWORK_SITE_LOCAL' : 'VIRTUAL_NETWORK_SITE_LOCAL_INSIDE') ||
      links[0].link_state !== true
    )
      throw new Error('Physical interface link is not verified up');
    return { ...iface, interfaceName: identity(matches[0].name), linkUp: true, ipv4: observedIpv4(links[0]) };
  });
}
