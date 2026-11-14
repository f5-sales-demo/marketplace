import { renderProviderResource } from './resource-renderer';

type Json = Record<string, unknown>;
function object(value: unknown): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Replacement interface evidence is malformed');
  return value as Json;
}
function rows(value: unknown): Json[] {
  if (!Array.isArray(value) || !value.length) throw Error('Replacement interface inventory is incomplete');
  return value.map(object);
}
function child(schema: Json, key: string): Json {
  const attributes = schema.attributes === undefined ? {} : object(schema.attributes);
  const blocks = schema.block_types === undefined ? {} : object(schema.block_types);
  if (attributes[key]) return object(object(attributes[key]).nested_type);
  return object(object(blocks[key]).block);
}
function role(iface: Json): string {
  const network = object(iface.network_option);
  const selected = Object.keys(network).filter((key) => network[key] !== null && network[key] !== undefined);
  if (selected.length !== 1 || !['site_local_network', 'site_local_inside_network'].includes(selected[0]))
    throw Error('Replacement interface role is ambiguous');
  return selected[0];
}

/** Project only computed flags rejoined from an exact owned observation.
 * Callers must verify tenant ownership and UID against their durable state.
 * The input remains intact for API validation, request hashing and post-apply checks.
 */
export function verifiedReplacementProjection(request: Json, observed: Json, schema: unknown, type: string): Json {
  if (type !== 'xcsh_securemesh_site_v2') return request;
  const spec = object(request.spec);
  const providers = ['aws', 'azure'].filter((provider) => spec[provider] !== undefined && spec[provider] !== null);
  if (providers.length !== 1) return request;
  const provider = providers[0];
  const wantedNodes = rows(object(object(spec[provider]).not_managed).node_list);
  const flags = ['is_primary', 'is_management'];
  if (
    !wantedNodes.some((node) =>
      rows(node.interface_list).some((iface) => flags.some((flag) => Object.hasOwn(iface, flag))),
    )
  )
    return request;
  const metadata = object(request.metadata),
    beforeMeta = object(observed.metadata);
  if (
    metadata.name !== beforeMeta.name ||
    metadata.namespace !== beforeMeta.namespace ||
    typeof object(observed.system_metadata).uid !== 'string' ||
    !object(observed.system_metadata).uid
  )
    throw Error('Replacement site identity differs');
  const actualNodes = rows(object(object(object(observed.spec)[provider]).not_managed).node_list);
  if (actualNodes.length !== wantedNodes.length) throw Error('Replacement node inventory differs');
  const result = structuredClone(request);
  const copiedNodes = rows(object(object(object(result.spec)[provider]).not_managed).node_list);
  const ifaceSchema = child(
    child(child(child(object(object(schema).block), provider), 'not_managed'), 'node_list'),
    'interface_list',
  );
  const attributes = object(ifaceSchema.attributes);
  const nodeNames = new Set<unknown>(),
    allMacs = new Set<unknown>();
  for (const node of copiedNodes) {
    if (typeof node.hostname !== 'string' || !node.hostname || nodeNames.has(node.hostname))
      throw Error('Replacement node identity is ambiguous');
    nodeNames.add(node.hostname);
    const matches = actualNodes.filter((actual) => actual.hostname === node.hostname);
    if (matches.length !== 1) throw Error('Replacement node identity differs');
    const actualInterfaces = rows(matches[0].interface_list),
      wantedInterfaces = rows(node.interface_list);
    if (actualInterfaces.length !== wantedInterfaces.length) throw Error('Replacement interface inventory differs');
    const devices = new Set<unknown>(),
      names = new Set<unknown>();
    for (const iface of wantedInterfaces) {
      const ethernet = object(iface.ethernet_interface);
      if (
        typeof ethernet.mac !== 'string' ||
        !/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(ethernet.mac) ||
        allMacs.has(ethernet.mac) ||
        typeof ethernet.device !== 'string' ||
        !ethernet.device ||
        devices.has(ethernet.device) ||
        typeof iface.name !== 'string' ||
        !iface.name ||
        names.has(iface.name)
      )
        throw Error('Replacement interface identity is ambiguous');
      allMacs.add(ethernet.mac);
      devices.add(ethernet.device);
      names.add(iface.name);
      const matched = actualInterfaces.filter((actual) => {
        const physical = object(actual.ethernet_interface);
        return physical.mac === ethernet.mac && physical.device === ethernet.device;
      });
      if (matched.length !== 1 || matched[0].name !== iface.name || role(matched[0]) !== role(iface))
        throw Error('Replacement interface identity or role differs');
      for (const flag of flags) {
        if (!Object.hasOwn(iface, flag)) continue;
        const attribute = attributes[flag] === undefined ? undefined : object(attributes[flag]);
        if (attribute?.computed !== true || attribute.optional === true || attribute.required === true) continue;
        if (
          typeof iface[flag] !== 'boolean' ||
          typeof matched[0][flag] !== 'boolean' ||
          iface[flag] !== matched[0][flag]
        )
          throw Error('Replacement interface state differs');
        delete iface[flag];
      }
    }
  }
  return result;
}

export function renderVerifiedReplacementResource(request: Json, observed: Json, schema: unknown, type: string): Json {
  return renderProviderResource(verifiedReplacementProjection(request, observed, schema, type), schema, type);
}
