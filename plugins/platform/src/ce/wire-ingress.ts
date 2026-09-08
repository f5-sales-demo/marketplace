import { isIP } from 'node:net';

export interface InsideHttpListener {
  name: string;
  namespace: string;
  domain: string;
  port: number;
  originPool: { name: string; namespace: string };
  sites: Array<{ name: string; insideAddress: string }>;
}

/** Serialization only. Callers must independently establish ownership, addresses and runtime health. */
export function buildInsideHttpListener(input: InsideHttpListener, validate: (spec: Record<string, unknown>) => void) {
  const name = /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
  const domain = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
  if (
    !input ||
    ![input.name, input.namespace, input.originPool?.name, input.originPool?.namespace].every(
      (value) => typeof value === 'string' && name.test(value),
    ) ||
    typeof input.domain !== 'string' ||
    input.domain.length > 253 ||
    !domain.test(input.domain) ||
    !Number.isInteger(input.port) ||
    input.port < 1 ||
    input.port > 65535 ||
    !Array.isArray(input.sites) ||
    input.sites.length < 1 ||
    input.sites.length > 32
  )
    throw new Error('Invalid inside HTTP listener identity or topology');

  const names = new Set<string>();
  const addresses = new Set<string>();
  const advertiseWhere = input.sites.map((site) => {
    if (
      !site ||
      typeof site.name !== 'string' ||
      !name.test(site.name) ||
      typeof site.insideAddress !== 'string' ||
      isIP(site.insideAddress) !== 4 ||
      names.has(site.name) ||
      addresses.has(site.insideAddress)
    )
      throw new Error('Invalid or ambiguous inside HTTP listener placement');
    names.add(site.name);
    addresses.add(site.insideAddress);
    return {
      site: {
        site: { name: site.name, namespace: 'system' },
        network: 'SITE_NETWORK_INSIDE',
        ip: site.insideAddress,
      },
      use_default_port: {},
    };
  });
  const spec = {
    domains: [input.domain],
    http: { port: input.port },
    advertise_custom: { advertise_where: advertiseWhere },
    default_route_pools: [
      {
        pool: { name: input.originPool.name, namespace: input.originPool.namespace },
        weight: 1,
        priority: 1,
      },
    ],
    round_robin: {},
    no_challenge: {},
    user_id_client_ip: {},
    disable_waf: {},
    disable_rate_limit: {},
    disable_api_discovery: {},
    disable_api_testing: {},
    disable_api_definition: {},
    l7_ddos_protection: {},
  };
  validate(spec);
  return {
    metadata: { name: input.name, namespace: input.namespace },
    spec,
    evidence: { listener: 'unknown', routes: 'unknown', traffic: 'unknown' } as const,
  };
}
