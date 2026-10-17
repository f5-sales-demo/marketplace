import type { ExpectedCeInterface } from './interface-evidence';

type Json = Record<string, unknown>;
const object = (value: unknown): Json => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed registration inventory');
  return value as Json;
};
const array = (value: unknown): unknown[] => {
  if (!Array.isArray(value)) throw new Error('Missing registration inventory');
  return value;
};
const mac = (value: unknown): string => {
  if (typeof value !== 'string' || !/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(value))
    throw new Error('Malformed registration MAC');
  return value.toLowerCase();
};

/** Registration-time hardware identity only. This does not establish current link or traffic health. */
export function correlateRegistrationDevices(
  response: Json,
  siteName: string,
  instances: Record<string, string>,
  expected: ExpectedCeInterface[],
  provider: 'aws' | 'azure' = 'aws',
): Array<ExpectedCeInterface & { device: string }> {
  if (
    response.next_page_token ||
    response.next_token ||
    response.continue ||
    response.continuation_token ||
    (response.errors !== undefined && array(response.errors).length)
  )
    throw new Error('Incomplete registration inventory');
  const nodes = Object.keys(instances);
  if (
    ![1, 3].includes(nodes.length) ||
    !expected.length ||
    nodes.some((node) => !expected.some((i) => i.node === node))
  )
    throw new Error('Incomplete expected node inventory');
  const items = array(response.items).map(object);
  const inventory = new Map<string, Json[]>();
  for (const node of nodes) {
    const matches = items.filter((item) => {
      const spec = object(item.get_spec);
      return object(spec.passport).cluster_name === siteName && object(spec.infra).hostname === node;
    });
    if (matches.length !== 1) throw new Error('Ambiguous registration inventory');
    const registration = matches[0];
    const spec = object(registration.get_spec);
    const infra = object(spec.infra);
    const state = object(object(registration.object).status).current_state;
    if (
      !(provider === 'aws'
        ? /^i-[0-9a-f]{8,17}$/.test(instances[node])
        : /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(instances[node])) ||
      infra.instance_id !== instances[node] ||
      object(spec.passport).cluster_size !== nodes.length ||
      !['ADMITTED', 'ONLINE'].includes(String(state))
    )
      throw new Error('Registration instance binding is unavailable');
    inventory.set(node, array(object(infra.hw_info).network).map(object));
  }
  const seenMacs = new Set<string>();
  const seenRoles = new Set<string>();
  const seenDevices = new Set<string>();
  return expected.map((binding) => {
    const normalized = mac(binding.mac);
    const role = `${binding.node}/${binding.role}`;
    if (!['slo', 'data', 'sli'].includes(binding.role) || seenMacs.has(normalized) || seenRoles.has(role))
      throw new Error('Duplicate or unsupported expected interface');
    seenMacs.add(normalized);
    seenRoles.add(role);
    const matches = inventory.get(binding.node)?.filter((item) => mac(item.mac_address) === normalized);
    if (matches?.length !== 1) throw new Error('Guest MAC identity is unavailable or duplicated');
    const device = matches[0].name;
    if (typeof device !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,63}$/.test(device))
      throw new Error('Guest device identity is unavailable');
    const key = `${binding.node}/${device}`;
    if (seenDevices.has(key)) throw new Error('Duplicate guest device identity');
    seenDevices.add(key);
    return { ...binding, mac: normalized, device };
  });
}

/** Reconcile server-populated SMSv2 interfaces without overwriting their configuration. */
export function verifyRegisteredInterfaceConfiguration(
  spec: Json,
  devices: Array<ExpectedCeInterface & { device: string }>,
  provider: 'aws' | 'azure' = 'aws',
): void {
  const nodes = array(object(object(spec[provider]).not_managed).node_list).map(object);
  const expectedNodes = new Set(devices.map((item) => item.node));
  if (!devices.length || nodes.length !== expectedNodes.size) throw new Error('Configured node count differs');
  for (const nodeName of expectedNodes) {
    const matches = nodes.filter((node) => node.hostname === nodeName);
    if (matches.length !== 1) throw new Error('Configured node identity differs');
    const interfaces = array(matches[0].interface_list).map(object);
    const expected = devices.filter((item) => item.node === nodeName);
    if (interfaces.length !== expected.length) throw new Error('Configured interface count differs');
    for (const device of expected) {
      const matches = interfaces.filter((item) => mac(object(item.ethernet_interface).mac) === device.mac);
      if (matches.length !== 1) throw new Error('Configured interface MAC differs');
      const item = matches[0];
      const network = object(item.network_option);
      const choice = device.role === 'slo' ? 'site_local_network' : 'site_local_inside_network';
      if (
        object(item.ethernet_interface).device !== device.device ||
        Object.keys(network).length !== 1 ||
        !Object.hasOwn(network, choice) ||
        !Object.hasOwn(item, 'dhcp_client') ||
        Object.hasOwn(item, 'static_ip') ||
        Object.hasOwn(item, 'no_ipv4_address')
      )
        throw new Error('Configured guest device, role or addressing differs');
    }
  }
}
