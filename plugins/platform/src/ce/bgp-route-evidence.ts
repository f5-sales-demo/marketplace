import { isIP } from 'node:net';

type Json = Record<string, unknown>;

const object = (value: unknown): Json => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed BGP route evidence');
  return value as Json;
};
const array = (value: unknown): unknown[] => {
  if (!Array.isArray(value)) throw new Error('Incomplete BGP route evidence');
  return value;
};
const matchesNode = (expected: string, actual: unknown) =>
  actual === expected || (typeof actual === 'string' && actual.startsWith(`${expected}.`));
const cidr = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  const parts = value.split('/');
  if (parts.length !== 2) return false;
  const family = isIP(parts[0]);
  const prefix = Number(parts[1]);
  return Number.isInteger(prefix) && prefix >= 0 && ((family === 4 && prefix <= 32) || (family === 6 && prefix <= 128));
};

/** Parse a complete BGP route inventory without inferring convergence semantics. */
export function parseBgpRoutes(response: unknown, expectedNodes: string[]) {
  if (
    ![1, 2, 3].includes(expectedNodes.length) ||
    new Set(expectedNodes).size !== expectedNodes.length ||
    expectedNodes.some((node) => !/^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(node))
  )
    throw new Error('Invalid expected BGP route node identity');
  const value = object(response);
  if (
    value.next_page_token ||
    value.next_token ||
    value.continuation_token ||
    value.NextToken ||
    (value.errors !== undefined && array(value.errors).length)
  )
    throw new Error('Partial BGP route evidence');
  const rows = array(value.ver).map(object);
  if (
    rows.length !== expectedNodes.length ||
    expectedNodes.some((node) => rows.filter((candidate) => matchesNode(node, candidate.name)).length !== 1)
  )
    throw new Error('BGP route node identity differs');
  const nodes = expectedNodes.map((node) => {
    const row = rows.find((candidate) => matchesNode(node, candidate.name));
    if (!row) throw new Error('BGP route node identity differs');
    const routingInstances = array(row.ri_table).map((entry) => {
      const instance = object(entry);
      if (typeof instance.routing_instance !== 'string' || !instance.routing_instance)
        throw new Error('Malformed BGP routing instance evidence');
      const tables = array(instance.rt_table).map((entry) => {
        const table = object(entry);
        if (typeof table.name !== 'string' || !table.name) throw new Error('Malformed BGP route table evidence');
        const routes = (kind: 'imported' | 'exported') => {
          const seen = new Set<string>();
          return array(table[kind]).map((entry) => {
            const route = object(entry);
            if (!cidr(route.subnet) || seen.has(route.subnet)) throw new Error('Malformed BGP route prefix evidence');
            seen.add(route.subnet);
            return route.subnet;
          });
        };
        return { name: table.name, imported: routes('imported'), exported: routes('exported') };
      });
      if (new Set(tables.map((table) => table.name)).size !== tables.length)
        throw new Error('Duplicate BGP route table evidence');
      return { name: instance.routing_instance, tables };
    });
    if (new Set(routingInstances.map((instance) => instance.name)).size !== routingInstances.length)
      throw new Error('Duplicate BGP routing instance evidence');
    return { node, routingInstances };
  });
  return { status: 'observed' as const, nodes };
}
