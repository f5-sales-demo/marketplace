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
      if (!tables.length) throw new Error('Incomplete BGP route table evidence');
      if (new Set(tables.map((table) => table.name)).size !== tables.length)
        throw new Error('Duplicate BGP route table evidence');
      return { name: instance.routing_instance, tables };
    });
    if (!routingInstances.length) throw new Error('Incomplete BGP routing instance evidence');
    if (new Set(routingInstances.map((instance) => instance.name)).size !== routingInstances.length)
      throw new Error('Duplicate BGP routing instance evidence');
    return { node, routingInstances };
  });
  return { status: 'observed' as const, nodes };
}

export interface ObservedBgpPath {
  peer: string;
  nh: string[];
  as_path?: string;
  local_pref?: number;
  med?: number;
}
export interface ObservedBgpRoutePath {
  subnet: string;
  path: ObservedBgpPath[];
}
interface ObservedBgpPathNode {
  node: string;
  routingInstances: Array<{
    name: string;
    tables: Array<{ name: string; imported: ObservedBgpRoutePath[]; exported: ObservedBgpRoutePath[] }>;
  }>;
}
const qualifiers = { scope: 'unqualified', freshness: 'unqualified', traffic: 'unknown' } as const;
type BgpPathObservation = typeof qualifiers &
  ({ status: 'observed'; nodes: ObservedBgpPathNode[] } | { status: 'unknown'; reason: string });

/** Preserve exact route path fields for later authoritative joins. Inventory parsing alone proves no routing scope or freshness. */
export function parseBgpRoutePaths(response: unknown, expectedNodes: string[]): BgpPathObservation {
  try {
    const inventory = parseBgpRoutes(response, expectedNodes);
    const rows = array(object(response).ver).map(object);
    const text = (value: unknown, empty = false): string => {
      if (
        typeof value !== 'string' ||
        (!empty && !value.length) ||
        value.length > 1024 ||
        [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) ||
        value.includes('__')
      )
        throw Error('Malformed BGP route path text');
      return value;
    };
    const nodes = inventory.nodes.map(({ node }) => {
      const row = rows.find((candidate) => matchesNode(node, candidate.name));
      if (!row) throw Error('BGP route path node identity differs');
      const routingInstances = array(row.ri_table).map((value) => {
        const instance = object(value);
        return {
          name: instance.routing_instance as string,
          tables: array(instance.rt_table).map((value) => {
            const table = object(value);
            const routes = (kind: 'imported' | 'exported'): ObservedBgpRoutePath[] =>
              array(table[kind]).map((value) => {
                const route = object(value);
                const rawPaths = array(route.path);
                if (!rawPaths.length) throw Error('Incomplete BGP route path evidence');
                const seen = new Set<string>();
                const path = rawPaths.map((value) => {
                  const raw = object(value);
                  if (Object.keys(raw).some((key) => !['peer', 'nh', 'as_path', 'local_pref', 'med'].includes(key)))
                    throw Error('Unqualified BGP route path fields');
                  const peer = text(raw.peer);
                  const nh = array(raw.nh).map((value) => text(value));
                  if (!nh.length || new Set(nh).size !== nh.length) throw Error('Incomplete or duplicate BGP nexthops');
                  const identity = JSON.stringify([peer, nh.toSorted()]);
                  if (seen.has(identity)) throw Error('Duplicate BGP route path identity');
                  seen.add(identity);
                  const parsed: ObservedBgpPath = { peer, nh };
                  if (raw.as_path !== undefined) parsed.as_path = text(raw.as_path, true);
                  for (const key of ['local_pref', 'med'] as const) {
                    if (raw[key] === undefined) continue;
                    if (!Number.isSafeInteger(raw[key]) || (raw[key] as number) < 0)
                      throw Error('Malformed or imprecise BGP path attribute');
                    parsed[key] = raw[key] as number;
                  }
                  return parsed;
                });
                return { subnet: route.subnet as string, path };
              });
            return { name: table.name as string, imported: routes('imported'), exported: routes('exported') };
          }),
        };
      });
      return { node, routingInstances };
    });
    return { ...qualifiers, status: 'observed', nodes };
  } catch (error) {
    return {
      ...qualifiers,
      status: 'unknown',
      reason: error instanceof Error ? error.message : 'BGP route paths unavailable',
    };
  }
}
