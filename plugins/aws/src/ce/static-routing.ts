import { isIP } from 'node:net';
import type { AwsCeIntent } from './types';

/** Shared native/Terraform appliance routing, with one explicit target in each AZ. */
export function staticAzRoutes(intent: AwsCeIntent) {
  const routes = intent.routing.staticAzRoutes;
  if (routes === undefined) return [];
  if (intent.routing.profile !== 'tgw-static' || !Array.isArray(routes) || routes.length !== intent.topology.nodeCount)
    throw new Error('Static TGW routing requires one appliance route set per node/AZ');
  const nodes = new Set<number>();
  return routes
    .map((route) => {
      if (
        !Number.isInteger(route.node) ||
        route.node < 1 ||
        route.node > intent.topology.nodeCount ||
        nodes.has(route.node)
      )
        throw new Error('Static TGW appliance node identity is missing or ambiguous');
      nodes.add(route.node);
      if (route.availabilityZone !== intent.interfaces[1]?.subnets[route.node - 1]?.availabilityZone)
        throw new Error('Static TGW appliance target differs from the approved SLI AZ');
      const normalize = (values: string[]) => {
        if (!Array.isArray(values) || !values.length || new Set(values).size !== values.length)
          throw new Error('Static TGW requires explicit unique forward and return prefixes');
        return values
          .map((value) => {
            const [ip, prefix, extra] = value.split('/');
            if (isIP(ip) !== 4 || !/^\d{1,2}$/.test(prefix ?? '') || Number(prefix) > 32 || extra !== undefined)
              throw new Error('Static TGW route prefix is invalid');
            const octets = ip.split('.').map(Number);
            const address = octets.reduce((acc, octet) => (acc * 256 + octet) >>> 0, 0);
            const mask = Number(prefix) === 0 ? 0 : (0xffffffff << (32 - Number(prefix))) >>> 0;
            if ((address & mask) >>> 0 !== address) throw new Error('Static TGW route must use a network boundary');
            return { cidr: value, address, mask, prefix: Number(prefix) };
          })
          .sort((a, b) => a.cidr.localeCompare(b.cidr));
      };
      const forward = normalize(route.forwardCidrs);
      const backward = normalize(route.returnCidrs);
      if (
        forward.some((a) =>
          backward.some((b) => {
            const mask = a.prefix < b.prefix ? a.mask : b.mask;
            return (a.address & mask) >>> 0 === (b.address & mask) >>> 0;
          }),
        )
      )
        throw new Error('Static TGW forward and return prefixes overlap');
      return { ...route, forwardCidrs: forward.map((row) => row.cidr), returnCidrs: backward.map((row) => row.cidr) };
    })
    .sort((a, b) => a.node - b.node);
}

export function routeNode(intent: AwsCeIntent, route: AwsCeIntent['routes'][number]): number {
  const node = route.node ?? (intent.topology.nodeCount === 1 ? 1 : undefined);
  if (!node || !Number.isInteger(node) || node > intent.topology.nodeCount || node < 1)
    throw new Error('Each multi-node VPC route requires an explicit appliance node');
  if (
    intent.topology.nodeCount > 1 &&
    route.availabilityZone !== intent.interfaces[1]?.subnets[node - 1]?.availabilityZone
  )
    throw new Error('VPC route AZ differs from its approved appliance target');
  return node;
}
