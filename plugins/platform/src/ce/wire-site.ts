import { createWireValidator } from './wire-schema';

type Json = Record<string, unknown>;
export interface WireSiteIntent {
  schemaVersion: 2;
  provider: 'aws' | 'azure';
  haMode: 'one-node' | 'three-node';
  nodes: Array<{ hostname: string; interfaces: Json[] }>;
  settings: Json;
}
const names = /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const macs = /^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/;
const defaults = {
  block_all_services: {},
  no_network_policy: {},
  no_forward_proxy: {},
  f5_proxy: {},
  no_proxy_bypass: {},
  logs_streaming_disabled: {},
  no_s2s_connectivity_sli: {},
  no_s2s_connectivity_slo: {},
  disable_url_categorization: {},
  local_vrf: { default_config: {}, default_sli_config: {} },
};
function object(value: unknown): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid SMSv2 site identity');
  return value as Json;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return JSON.stringify(
      Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, item]) => [key, canonical(item)]),
      ),
    );
  return JSON.stringify(value);
}

/** One invocation describes one site. Independent sites must be translated separately. */
export function buildWireSite(intent: WireSiteIntent, schemas: Json): Json {
  if (
    intent.schemaVersion !== 2 ||
    !['aws', 'azure'].includes(intent.provider) ||
    !['one-node', 'three-node'].includes(intent.haMode)
  )
    throw new Error('Obsolete or unsupported SMSv2 site intent');
  if (!Array.isArray(intent.nodes) || intent.nodes.length !== (intent.haMode === 'three-node' ? 3 : 1))
    throw new Error('SMSv2 site node count does not match HA selection');
  const hostnames = new Set<string>();
  const identities = new Set<string>();
  let layout: string | undefined;
  for (const node of intent.nodes) {
    if (!names.test(node.hostname) || hostnames.has(node.hostname))
      throw new Error('SMSv2 hostnames must be unique DNS names');
    hostnames.add(node.hostname);
    if (!Array.isArray(node.interfaces) || node.interfaces.length < 1 || node.interfaces.length > 8)
      throw new Error('Unsupported SMSv2 interface count');
    const interfaceNames = new Set<string>();
    const roles = node.interfaces.map((item) => {
      const ethernet = object(item.ethernet_interface);
      if (typeof ethernet.mac !== 'string' || !macs.test(ethernet.mac) || identities.has(ethernet.mac))
        throw new Error('SMSv2 MAC identity is missing, malformed or duplicated');
      identities.add(ethernet.mac);
      if (
        intent.provider === 'aws' &&
        (typeof ethernet.device !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,63}$/.test(ethernet.device))
      )
        throw new Error('An observed AWS guest device is required before configuring an interface');
      if (typeof item.name !== 'string' || !names.test(item.name) || interfaceNames.has(item.name))
        throw new Error('SMSv2 interface names must be unique');
      interfaceNames.add(item.name);
      const network = object(item.network_option);
      const addressing = ['dhcp_client', 'static_ip', 'no_ipv4_address'].filter((key) => Object.hasOwn(item, key));
      if (addressing.length !== 1) throw new Error('SMSv2 interface addressing must be explicit');
      return { name: item.name, network, addressing: addressing[0], mtu: item.mtu ?? null };
    });
    if (
      !Object.hasOwn(roles[0].network, 'site_local_network') ||
      roles.filter((role) => Object.hasOwn(role.network, 'site_local_network')).length !== 1
    )
      throw new Error('SMSv2 requires one explicit first SLO interface');
    const current = canonical(roles);
    if (layout !== undefined && layout !== current)
      throw new Error('HA interfaces must have homogeneous order, roles and addressing');
    layout = current;
  }
  const settings = object(intent.settings);
  const protectedFields = [
    'aws',
    'azure',
    'baremetal',
    'gcp',
    'kvm',
    'oci',
    'openstack',
    'vmware',
    'nutanix',
    'equinix',
    'openshift_virtualization',
    'enable_ha',
    'disable_ha',
    'enable_management_network',
    'disable_management_network',
  ];
  if (protectedFields.some((field) => Object.hasOwn(settings, field)))
    throw new Error('Site settings cannot replace provider, HA or management identity');
  const spec: Json = { ...structuredClone(defaults), ...structuredClone(settings) };
  // Explicit choices supersede their deliberately selected defaults, without allowing two explicit choices.
  const root = object(schemas.viewssecuremesh_site_v2CreateSpecType);
  for (const [key, value] of Object.entries(root)) {
    if (!key.startsWith('x-ves-oneof-field-')) continue;
    const group: string[] = typeof value === 'string' ? JSON.parse(value) : (value as string[]);
    if (group.some((field) => Object.hasOwn(settings, field)))
      for (const field of group) if (!Object.hasOwn(settings, field)) delete spec[field];
  }
  spec[intent.provider] = {
    not_managed: {
      node_list: intent.nodes.map((node) => ({
        hostname: node.hostname,
        type: 'Control',
        interface_list: structuredClone(node.interfaces),
      })),
    },
  };
  spec[intent.haMode === 'three-node' ? 'enable_ha' : 'disable_ha'] = {};
  spec.disable_management_network = {};
  createWireValidator(schemas)(spec);
  return spec;
}
