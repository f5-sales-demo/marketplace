import { isIP } from 'node:net';
import { projectReplaceSnapshot } from './wire-replace';

type Json = Record<string, unknown>;

/** Project the v6.1.2 GET shape and remove only the exact observed implicit empty defaults. */
export function projectInsideHttpListener(spec: unknown, schemas: Json, validate: (spec: unknown) => void): Json {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) throw new Error('Malformed HTTP listener response');
  const source = structuredClone(spec) as Json;
  // The live API emits these unset legacy/GET slots outside the create schema.
  // Nonempty values remain unsupported and must not silently pass comparison.
  for (const key of ['api_rate_limit_legacy', 'malicious_user_mitigation'])
    if (source[key] === null) delete source[key];
  for (const key of [
    'downstream_tls_certificate_expiration_timestamps',
    'waf_exclusion_rules',
    'dns_info',
    'internet_vip_info',
  ])
    if (Array.isArray(source[key]) && (source[key] as unknown[]).length === 0) delete source[key];
  if (source.host_name === '') delete source.host_name;
  const placements = (source.advertise_custom as Json | undefined)?.advertise_where;
  if (Array.isArray(placements))
    for (const placement of placements) {
      const site = (placement as Json)?.site as Json | undefined;
      if (site?.ipv6 === '') delete site.ipv6;
    }
  const result = projectReplaceSnapshot(source, schemas, 'viewshttp_loadbalancerCreateSpecType', [
    // These three GET-only fields are absent from the create contract.
    'state',
    'auto_cert_info',
    'cert_state',
  ]);
  validate(result);
  const omitEmpty = (value: Json, keys: string[]) => {
    for (const key of keys) {
      const item = value[key];
      if (item && typeof item === 'object' && !Array.isArray(item) && Object.keys(item).length === 0) delete value[key];
    }
  };
  omitEmpty(result, [
    'service_policies_from_namespace',
    'disable_trust_client_ip_headers',
    'disable_malicious_user_detection',
    'default_sensitive_data_policy',
    'disable_threat_mesh',
    'disable_malware_protection',
  ]);
  if (result.l7_ddos_protection)
    omitEmpty(result.l7_ddos_protection as Json, [
      'mitigation_block',
      'default_rps_threshold',
      'clientside_action_none',
      'ddos_policy_none',
    ]);
  if (Array.isArray(result.default_route_pools))
    for (const pool of result.default_route_pools) omitEmpty(pool as Json, ['endpoint_subsets']);
  return result;
}

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
        // Let XC bind its automatic site-local listener address. The observed
        // SLI address remains identity evidence and the cloud NLB target.
        network: 'SITE_NETWORK_INSIDE',
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
