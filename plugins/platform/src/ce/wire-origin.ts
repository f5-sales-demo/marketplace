import { isIP } from 'node:net';

export interface SiteLocalHttpOrigin {
  name: string;
  namespace: string;
  originAddress: string;
  port: number;
  siteNames: string[];
}

/** Schema mapping only; the lifecycle adapter must collect site ownership and origin reachability. */
export function buildSiteLocalHttpOrigin(input: SiteLocalHttpOrigin, validate: (spec: unknown) => void) {
  const name = /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
  if (
    !input ||
    Object.keys(input).sort().join(',') !== 'name,namespace,originAddress,port,siteNames' ||
    ![input.name, input.namespace].every((value) => typeof value === 'string' && name.test(value)) ||
    typeof input.originAddress !== 'string' ||
    isIP(input.originAddress) !== 4 ||
    !Number.isInteger(input.port) ||
    input.port < 1 ||
    input.port > 65535 ||
    !Array.isArray(input.siteNames) ||
    input.siteNames.length < 1 ||
    input.siteNames.length > 32 ||
    new Set(input.siteNames).size !== input.siteNames.length ||
    input.siteNames.some((value) => typeof value !== 'string' || !name.test(value))
  )
    throw new Error('Explicit HTTP origin and distinct site identities are required');
  const spec = {
    port: input.port,
    origin_servers: input.siteNames.map((siteName) => ({
      labels: {},
      // The API's private_ip variant binds an address to a CE; the address may be public.
      private_ip: {
        ip: input.originAddress,
        outside_network: {},
        site_locator: { site: { name: siteName, namespace: 'system' } },
      },
    })),
    no_tls: {},
    loadbalancer_algorithm: 'ROUND_ROBIN',
    endpoint_selection: 'LOCAL_PREFERRED',
  };
  validate(spec);
  return {
    metadata: { name: input.name, namespace: input.namespace },
    spec,
    evidence: { origin: 'unknown' as const, traffic: 'unknown' as const },
  };
}
