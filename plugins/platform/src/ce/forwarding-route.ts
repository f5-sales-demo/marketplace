import { isIP } from 'node:net';

type Json = Record<string, unknown>;
export type ForwardingRouteType = 'REMOTE_SITE_ROUTE' | 'LOCAL_ROUTE' | 'STATIC_ROUTE' | 'BGP_ROUTE';
export interface ExpectedCeForwardingRoutes {
  siteUid: string;
  interfaces: { node: string; role: 'slo' | 'sli'; mac: string; device: string; interfaceName: string }[];
  routes: { node: string; role: 'slo' | 'sli'; prefix: string; routeType: ForwardingRouteType }[];
}
export const forwardingRoutePath = '/api/operate/namespaces/{namespace}/sites/{site}/ver/simplified_routes';
export const forwardingRouteSchemas = [
  'routeSimplifiedRouteRequest',
  'routeSimplifiedRouteResponse',
  'routeSimplifiedRoutes',
  'routeSimplifiedRouteInfo',
  'routeSimplifiedNexthopType',
  'routeSimplifiedEcmpNH',
  'routeLocalNH',
  'routeSubnetNH',
  'routeRouteFamily',
] as const;
function require(value: unknown): asserts value {
  if (!value) throw Error('Forwarding route schema, identity or evidence is unqualified');
}
function object(value: unknown): Json {
  require(value && typeof value === 'object' && !Array.isArray(value));
  return value as Json;
}
function ref(value: unknown) {
  const v = object(value);
  return Array.isArray(v.allOf) && v.allOf.length === 1 ? object(v.allOf[0]).$ref : v.$ref;
}
const name = /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const label = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(v) && !v.includes('__');
const types = ['REMOTE_SITE_ROUTE', 'LOCAL_ROUTE', 'STATIC_ROUTE', 'BGP_ROUTE'];
function prefix(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const [ip, bits, extra] = value.split('/');
  if (isIP(ip) !== 4 || !/^(?:[0-9]|[12][0-9]|3[0-2])$/.test(bits ?? '') || extra !== undefined) return false;
  const address = ip.split('.').reduce((v, o) => v * 256 + Number(o), 0);
  return address % 2 ** (32 - Number(bits)) === 0;
}
/** Exact public observational POST; inferred resource-creation annotations do not describe this operation. */
export function forwardingRouteRequest(document: unknown, site: string, node: string, role: 'slo' | 'sli') {
  require(name.test(site) && name.test(node) && ['slo', 'sli'].includes(role));
  const api = object(document),
    operation = object(object(object(api.paths)[forwardingRoutePath]).post);
  require(operation.operationId === 'ves.io.schema.operate.route.CustomPublicAPI.ShowSimplifiedRoutes');
  require(Array.isArray(operation.parameters) && operation.parameters.length === 2);
  for (const name of ['namespace', 'site']) {
    const matches = operation.parameters.map(object).filter((p) => p.name === name);
    require(
      matches.length === 1 &&
        matches[0].in === 'path' &&
        matches[0].required === true &&
        object(matches[0].schema).type === 'string',
    );
  }
  require(
    ref(object(object(object(operation.requestBody).content)['application/json']).schema) ===
      '#/components/schemas/routeSimplifiedRouteRequest',
  );
  const result = object(object(object(object(operation.responses)['200']).content)['application/json']);
  require(ref(result.schema) === '#/components/schemas/routeSimplifiedRouteResponse');
  const schemas = object(object(api.components).schemas),
    request = object(schemas.routeSimplifiedRouteRequest),
    properties = object(request.properties);
  require(
    request.type === 'object' &&
      object(properties.node).type === 'string' &&
      object(properties.namespace).type === 'string' &&
      object(properties.site).type === 'string' &&
      ref(properties[role]) === '#/components/schemas/schemaEmpty' &&
      ref(properties.family) === '#/components/schemas/routeRouteFamily',
  );
  require(
    Array.isArray(object(schemas.routeRouteFamily).enum) &&
      (object(schemas.routeRouteFamily).enum as unknown[]).includes('INET4'),
  );
  const rows = object(object(object(schemas.routeSimplifiedRouteResponse).properties).ver_routes);
  require(rows.type === 'array' && ref(rows.items) === '#/components/schemas/routeSimplifiedRoutes');
  const nodeRows = object(object(schemas.routeSimplifiedRoutes).properties);
  require(
    object(nodeRows.node).type === 'string' &&
      object(nodeRows.route).type === 'array' &&
      ref(object(nodeRows.route).items) === '#/components/schemas/routeSimplifiedRouteInfo',
  );
  const route = object(object(schemas.routeSimplifiedRouteInfo).properties);
  require(
    object(route.prefix).type === 'string' &&
      ref(route.nexthop) === '#/components/schemas/routeSimplifiedNexthopType' &&
      ref(route.ecmp) === '#/components/schemas/routeSimplifiedEcmpNH' &&
      object(object(object(schemas.routeLocalNH).properties).interface).type === 'string' &&
      object(object(object(schemas.routeSubnetNH).properties).intf_name).type === 'string',
  );
  return {
    method: 'POST' as const,
    path: `/api/operate/namespaces/system/sites/${site}/ver/simplified_routes`,
    body: { namespace: 'system', site, node, family: 'INET4', [role]: {} },
  };
}
export function validateExpectedForwardingRoutes(expected: ExpectedCeForwardingRoutes, nodes: string[]) {
  require(
    typeof expected.siteUid === 'string' &&
      expected.siteUid.trim() === expected.siteUid &&
      expected.siteUid.length > 0 &&
      expected.siteUid.length <= 1024 &&
      Array.isArray(expected.interfaces) &&
      expected.interfaces.length === nodes.length * 2 &&
      Array.isArray(expected.routes) &&
      expected.routes.length >= nodes.length * 2 &&
      expected.routes.length <= 1024,
  );
  const macs = new Set<string>(),
    devices = new Set<string>(),
    names = new Set<string>(),
    roles = new Set<string>();
  for (const v of expected.interfaces) {
    require(
      nodes.includes(v.node) &&
        ['slo', 'sli'].includes(v.role) &&
        label(v.device) &&
        label(v.interfaceName) &&
        /^(?:[a-f0-9]{2}:){5}[a-f0-9]{2}$/.test(v.mac) &&
        v.mac !== '00:00:00:00:00:00' &&
        (Number.parseInt(v.mac.slice(0, 2), 16) & 1) === 0 &&
        !macs.has(v.mac) &&
        !devices.has(`${v.node}/${v.device}`) &&
        !names.has(v.interfaceName) &&
        !roles.has(`${v.node}/${v.role}`),
    );
    macs.add(v.mac);
    devices.add(`${v.node}/${v.device}`);
    names.add(v.interfaceName);
    roles.add(`${v.node}/${v.role}`);
  }
  const routes = new Set<string>();
  for (const v of expected.routes) {
    const key = JSON.stringify([v.node, v.role, v.prefix]);
    require(roles.has(`${v.node}/${v.role}`) && prefix(v.prefix) && types.includes(v.routeType) && !routes.has(key));
    routes.add(key);
  }
  require(expected.interfaces.every((v) => expected.routes.some((r) => r.node === v.node && r.role === v.role)));
}
/** Literal identity joins are retained separately from vendor qualification of the interface-name namespace. */
export function parseForwardingRoutes(
  response: unknown,
  expected: ExpectedCeForwardingRoutes,
  node: string,
  role: 'slo' | 'sli',
) {
  const value = object(response);
  require(Object.keys(value).length === 1 && Array.isArray(value.ver_routes) && value.ver_routes.length === 1);
  const entry = object(value.ver_routes[0]);
  require(Object.keys(entry).length === 2 && entry.node === node && Array.isArray(entry.route));
  const rows = entry.route.map(object),
    seen = new Set<string>();
  for (const r of rows) {
    require(
      prefix(r.prefix) &&
        !seen.has(r.prefix) &&
        types.includes(String(r.route_type)) &&
        Array.isArray(r.flags) &&
        r.flags.every(
          (v) =>
            typeof v === 'string' &&
            v.length > 0 &&
            v.length <= 1024 &&
            [...v].every((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127),
        ) &&
        new Set(r.flags).size === r.flags.length &&
        Object.keys(r).every((k) => ['prefix', 'route_type', 'flags', 'nexthop', 'ecmp'].includes(k)) &&
        Number(r.nexthop !== undefined) + Number(r.ecmp !== undefined) === 1,
    );
    seen.add(r.prefix);
  }
  return expected.routes
    .filter((v) => v.node === node && v.role === role)
    .map((wanted) => {
      const matches = rows.filter((v) => v.prefix === wanted.prefix && v.route_type === wanted.routeType);
      require(matches.length === 1);
      const r = matches[0],
        raw = r.ecmp === undefined ? [r.nexthop] : object(r.ecmp).members;
      require(Array.isArray(raw) && raw.length > 0 && raw.length <= expected.interfaces.length);
      const used = new Set<string>();
      const interfaces = raw.map((value) => {
        const hop = object(value);
        require(Object.keys(hop).length === 1);
        const kind = Object.keys(hop)[0];
        require(kind === 'local' || kind === 'subnet');
        const details = object(hop[kind]),
          field = kind === 'local' ? 'interface' : 'intf_name';
        require(Object.keys(details).length === 1 && label(details[field]));
        const reported = details[field];
        const candidates = expected.interfaces.filter(
          (v) => v.node === node && (v.interfaceName === reported || v.device === reported),
        );
        require(candidates.length === 1 && candidates[0].role === role && !used.has(candidates[0].mac));
        const v = candidates[0];
        used.add(v.mac);
        return {
          ...v,
          kind,
          reportedInterface: reported,
          matchedFields: ['device', 'interfaceName'].filter(
            (field) => v[field as 'device' | 'interfaceName'] === reported,
          ),
        };
      });
      return { ...wanted, flags: [...(r.flags as string[])], interfaces };
    });
}
