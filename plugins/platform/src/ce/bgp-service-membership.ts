import { isIP } from 'node:net';
import { type ExpectedBgpSession, parseBgpSessions } from './bgp-evidence';
import { parseBgpRoutes } from './bgp-route-evidence';

function subnet(value: string) {
  const [ip, bits] = value.split('/');
  return {
    family: isIP(ip),
    bits: Number(bits),
    address: ip.split('.').reduce((n, o) => (n * 256 + Number(o)) >>> 0, 0),
  };
}
function overlaps(left: string, right: string) {
  const a = subnet(left),
    b = subnet(right);
  if (a.family !== 4 || b.family !== 4) return false;
  const bits = Math.min(a.bits, b.bits),
    mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (a.address & mask) >>> 0 === (b.address & mask) >>> 0;
}
export interface ExpectedBgpServiceTable {
  node: string;
  routingInstance: string;
  table: string;
}
/** Parse membership, separately from publisher freshness, cloud routes and traffic. Never use this alone as a mutation gate. */
export function parseBgpServiceMembership(
  peerResponse: unknown,
  routeResponse: unknown,
  expected: ExpectedBgpSession[],
  bindings: ExpectedBgpServiceTable[],
  servicePrefixes: string[],
) {
  const nodes = [...new Set(expected.map((s) => s.node))];
  if (
    !Array.isArray(bindings) ||
    bindings.length !== nodes.length ||
    new Set(bindings.map((b) => b.node)).size !== nodes.length ||
    nodes.some((node) => !bindings.some((b) => b.node === node)) ||
    bindings.some(
      (b) =>
        typeof b.routingInstance !== 'string' ||
        !b.routingInstance ||
        b.routingInstance.includes('__') ||
        typeof b.table !== 'string' ||
        !b.table ||
        b.table.includes('__'),
    ) ||
    !Array.isArray(servicePrefixes) ||
    !servicePrefixes.length ||
    new Set(servicePrefixes).size !== servicePrefixes.length
  )
    throw Error('BGP service binding incomplete or ambiguous');
  for (const cidr of servicePrefixes) {
    const [ip, bits, extra] = cidr.split('/');
    if (isIP(ip) !== 4 || !/^\d{1,2}$/.test(bits ?? '') || Number(bits) < 1 || Number(bits) > 32 || extra !== undefined)
      throw Error('BGP service prefix unresolved');
    const address = ip.split('.').reduce((n, o) => (n * 256 + Number(o)) >>> 0, 0),
      mask = (0xffffffff << (32 - Number(bits))) >>> 0;
    if ((address & mask) >>> 0 !== address) throw Error('BGP service prefix is not network aligned');
  }
  const sessions = parseBgpSessions(peerResponse, expected);
  const routes = parseBgpRoutes(routeResponse, nodes);
  const membership = bindings.map((binding) => {
    const node = routes.nodes.find((n) => n.node === binding.node);
    const instance = node?.routingInstances.find((r) => r.name === binding.routingInstance);
    const table = instance?.tables.find((t) => t.name === binding.table);
    if (!table) throw Error('BGP service routing instance or table missing');
    return {
      ...binding,
      prefixes: servicePrefixes.map((prefix) => ({
        prefix,
        exported: table.exported.includes(prefix),
        overlappingExports: table.exported.filter((route) => overlaps(route, prefix)),
      })),
    };
  });
  const flags = membership.flatMap((m) => m.prefixes.map((p) => p.exported));
  return {
    status:
      sessions.status !== 'healthy'
        ? ('pending' as const)
        : flags.every(Boolean)
          ? ('active' as const)
          : flags.every((v) => !v) &&
              membership.every((row) => row.prefixes.every((prefix) => prefix.overlappingExports.length === 0))
            ? ('withdrawn' as const)
            : ('pending' as const),
    sessions: sessions.sessions,
    membership,
    freshness: 'unqualified' as const,
    traffic: 'unknown' as const,
  };
}
