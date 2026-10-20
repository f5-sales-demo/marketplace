import { fingerprint } from '../../../gcloud/src/ce/discovery';
export const GCP_SITE_STATUS_PARSER_VERSION = 'site-status-ver-and-interfaces/v1';
const object = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
/** Exact runtime-object, node status identity and physical-device joins; tunnel interfaces are outside this projection. */
export function projectGcpOperationalSiteStatus(
  value: unknown,
  expected: {
    siteName: string;
    runtimeIdentitySha256: string;
    nodeName: string;
    role: string;
    devices: [string, string];
    addresses: [string, string];
  },
) {
  const site = object(value);
  const metadata = object(site?.metadata);
  const system = object(site?.system_metadata);
  if (
    metadata?.name !== expected.siteName ||
    typeof system?.uid !== 'string' ||
    fingerprint({ uid: system.uid }) !== expected.runtimeIdentitySha256 ||
    !Array.isArray(site?.status)
  )
    throw new Error('Original runtime site identity differs');
  const rows = site.status.map(object);
  const nodeRows = rows.filter((r) => object(r?.node_info)?.hostname === expected.nodeName);
  const verRows = rows.filter((r) => object(r?.metadata)?.status_id === `${expected.nodeName}_SiteStatusMgr`);
  if (nodeRows.length !== 1 || verRows.length !== 1) throw new Error('Runtime node status identity ambiguous');
  const node = nodeRows[0]!;
  const nodeInfo = object(node.node_info);
  if (!Array.isArray(nodeInfo?.role) || nodeInfo.role.length !== 1 || nodeInfo.role[0] !== 'k8s-master-primary')
    throw new Error('Runtime node role requires requalification');
  const row = verRows[0]!;
  const statusMetadata = object(row.metadata);
  const ver = object(row.ver_status);
  if (
    statusMetadata?.vtrp_stale !== false ||
    statusMetadata?.creator_class !== 'ver' ||
    statusMetadata.creator_id !== expected.siteName ||
    ver?.ver_instance_name !== `${expected.nodeName}-${expected.siteName}`
  )
    throw new Error('Runtime VER node join unavailable');
  const state = object(ver.running_state_status)?.state;
  if (typeof state !== 'string') throw new Error('Runtime VER state unavailable');
  const interfaces = Array.isArray(ver.intf_status) ? ver.intf_status.map(object) : [];
  const interfacesUp = expected.devices.map((device, index) => {
    const matches = interfaces.filter((r) => r?.name === device);
    if (matches.length !== 1) throw new Error('Physical interface status ambiguous');
    const intf = matches[0]!;
    const expectedNetwork = index === 0 ? 'VIRTUAL_NETWORK_SITE_LOCAL' : 'VIRTUAL_NETWORK_SITE_LOCAL_INSIDE';
    const ip = object(intf.ip);
    if (
      intf.network_type !== expectedNetwork ||
      typeof intf.link_state !== 'boolean' ||
      !['STATE_ACTIVE', 'STATE_INACTIVE'].includes(String(intf.active_state))
    )
      throw new Error('Physical interface state malformed');
    const address = object(ip?.ipv4)?.prefix;
    if (address !== expected.addresses[index]) throw new Error('Physical interface address join differs');
    return intf.link_state && intf.active_state === 'STATE_ACTIVE';
  });
  return { role: expected.role, runtimeIdentitySha256: expected.runtimeIdentitySha256, verState: state, interfacesUp };
}
