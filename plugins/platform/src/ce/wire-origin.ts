import { isIP } from 'node:net';
import { projectReplaceSnapshot } from './wire-replace';

type Json = Record<string, unknown>;

/** Project the v6.1.2 GET shape, excluding read-only reference tenancy and exact implicit empty defaults. */
export function projectSiteLocalHttpOrigin(spec: unknown, schemas: Json, validate: (spec: unknown) => void): Json {
  const result = projectReplaceSnapshot(spec, schemas, 'viewsorigin_poolCreateSpecType');
  for (const key of ['advanced_options', 'upstream_conn_pool_reuse_type']) {
    const value = result[key];
    if (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0)
      delete result[key];
  }
  if (Array.isArray(result.healthcheck) && result.healthcheck.length === 0) delete result.healthcheck;
  if (Array.isArray(result.origin_servers))
    for (const server of result.origin_servers) {
      if (!server || typeof server !== 'object' || Array.isArray(server)) continue;
      const privateIp = (server as Json).private_ip;
      if (!privateIp || typeof privateIp !== 'object' || Array.isArray(privateIp)) continue;
      const snat = (privateIp as Json).snat_pool;
      if (snat && typeof snat === 'object' && !Array.isArray(snat) && Object.keys(snat).length === 0)
        delete (privateIp as Json).snat_pool;
    }
  validate(result);
  return result;
}

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
    // Bind the routed endpoint to every selected CE site's inside network.
    // TGW routes are installed on the SLI subnets after BGP converges.
    origin_servers: input.siteNames.map((siteName) => ({
      labels: {},
      private_ip: {
        ip: input.originAddress,
        inside_network: {},
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
