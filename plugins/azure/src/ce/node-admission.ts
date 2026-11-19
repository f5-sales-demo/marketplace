import { createHash } from 'node:crypto';

type Json = Record<string, any>;
export interface NodeIdentity {
  siteName: string;
  hostname: string;
  instanceId: string;
  mac: string;
}
const normalizeMac = (value: unknown) =>
  String(value ?? '')
    .replaceAll('-', ':')
    .toLowerCase();
const complete = (value: Json) =>
  Array.isArray(value.items) &&
  !['next_page_token', 'next_token', 'continuation_token', 'continue', 'nextLink'].some((key) => value[key]) &&
  (!value.errors || (Array.isArray(value.errors) && value.errors.length === 0));

/** Probe admission measures original-node registration/provisioning; it does not assert service completeness. */
export function parseNodeAdmission(
  expected: NodeIdentity,
  configuration: Json,
  sites: Json,
  registrations: Json,
  vpm: Json,
): Json {
  const unknown = (reason: string) => ({ status: 'unknown', reason, operationalServices: 'unknown' });
  if (!complete(sites) || !complete(registrations)) return unknown('F5 observation inventory is incomplete');
  const configurationUid = configuration.system_metadata?.uid,
    nodes = configuration.spec?.azure?.not_managed?.node_list;
  if (
    typeof configurationUid !== 'string' ||
    !configurationUid ||
    !Array.isArray(nodes) ||
    nodes.length !== 1 ||
    nodes[0].hostname !== expected.hostname ||
    nodes[0].interface_list?.length !== 1 ||
    normalizeMac(nodes[0].interface_list[0].ethernet_interface?.mac) !== normalizeMac(expected.mac)
  )
    return unknown('F5 configuration/cloud NIC identity differs');
  const originalSites = sites.items.filter(
    (item: Json) =>
      item.name === expected.siteName &&
      item.owner_view?.kind === 'securemesh_site_v2' &&
      item.owner_view?.uid === configurationUid,
  );
  if (originalSites.length !== 1 || typeof originalSites[0].uid !== 'string' || !originalSites[0].uid)
    return unknown('Original site UID join is missing or ambiguous');
  const originalRegistrations = registrations.items.filter(
    (item: Json) =>
      item.get_spec?.passport?.cluster_name === expected.siteName &&
      item.get_spec?.infra?.hostname === expected.hostname &&
      !['RETIRED', 'FAILED_INACTIVE', 'DONE'].includes(item.object?.status?.current_state),
  );
  if (originalRegistrations.length !== 1) return unknown('Original registration is missing or ambiguous');
  const registration = originalRegistrations[0];
  if (
    registration.get_spec.infra.instance_id !== expected.instanceId ||
    registration.get_spec.passport.cluster_size !== 1
  )
    return unknown('Original cloud instance registration differs');
  if (
    typeof vpm.hostname !== 'string' ||
    !(vpm.hostname === expected.hostname || vpm.hostname.startsWith(`${expected.hostname}.`)) ||
    !['WAITING_FOR_CONFIG', 'WAITING_FOR_APPROVAL', 'PROVISIONING', 'PROVISIONED', 'FAILED', 'RESETTING'].includes(
      vpm.state,
    )
  )
    return unknown('VPM observation identity or state differs');
  const registrationState = registration.object?.status?.current_state;
  if (
    !['NOTSET', 'NEW', 'APPROVED', 'ADMITTED', 'PENDING', 'ONLINE', 'UPGRADING', 'MAINTENANCE', 'FAILED'].includes(
      registrationState,
    )
  )
    return unknown('Original registration state is missing or unsupported');
  return {
    status: registrationState === 'ONLINE' && vpm.state === 'PROVISIONED' ? 'ready-for-probe' : 'not-ready',
    semantics: 'original-node-registration-and-vpm-provisioning',
    operationalServices: 'unknown',
    siteUid: originalSites[0].uid,
    configurationUid,
    hostname: expected.hostname,
    instanceId: expected.instanceId,
    mac: normalizeMac(expected.mac),
    registrationState,
    vpmState: vpm.state,
    reason:
      registrationState === 'ONLINE' && vpm.state === 'PROVISIONED'
        ? 'Original node is registered and provisioned'
        : 'Original node registration or provisioning has not converged',
  };
}

const observationPin = {
  tag: 'v7.0.9',
  commit: '1c4f4eb8dd6cd9c440c241b995a6c0ef1bcd23ab',
  url: 'https://github.com/f5-sales-demo/api-specs-enriched/releases/download/v7.0.9/openapi.json',
  sha256: '31a1b5ede0a12dae48b2e93373565bd0717ac56cafff5800c595475c7030b327',
};
let verifiedObservation: Promise<void> | undefined;
async function verifyObservationContract(): Promise<void> {
  if (!verifiedObservation)
    verifiedObservation = (async () => {
      const response = await fetch(observationPin.url, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error('Published observation schema is unavailable');
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (createHash('sha256').update(bytes).digest('hex') !== observationPin.sha256)
        throw new Error('Published observation schema checksum differs');
      const api = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      const required = [
        [
          '/api/config/namespaces/{namespace}/securemesh_site_v2s/{name}',
          'ves.io.schema.views.securemesh_site_v2.API.Get',
        ],
        ['/api/config/namespaces/{namespace}/sites', 'ves.io.schema.site.API.List'],
        [
          '/api/register/namespaces/{namespace}/registrations_by_site/{site_name}',
          'ves.io.schema.registration.CustomAPI.ListRegistrationsBySite',
        ],
        [
          '/api/operate/namespaces/system/sites/{site}/vpm/debug/global/health',
          'ves.io.schema.operate.debug.CustomPublicAPI.HealthPublic',
        ],
      ];
      if (
        required.some(([path, operation]) => api.paths?.[path]?.get?.operationId !== operation) ||
        !api.components?.schemas?.debugVpmState?.enum?.includes('PROVISIONED')
      )
        throw new Error('Published observation mappings differ');
    })().catch((error) => {
      verifiedObservation = undefined;
      throw error;
    });
  await verifiedObservation;
}

export async function observeOriginalNode(
  expected: NodeIdentity,
  environment: Record<string, string | undefined>,
  signal?: AbortSignal,
): Promise<Json> {
  await verifyObservationContract();
  if (!environment.XCSH_API_URL || !environment.XCSH_API_TOKEN || !/^[a-z][a-z0-9-]{0,62}$/.test(expected.siteName))
    throw new Error('F5 context or site scope is unavailable');
  const base = new URL(environment.XCSH_API_URL);
  if (base.protocol !== 'https:') throw new Error('F5 observations require HTTPS');
  const get = async (path: string): Promise<Json> => {
    const response = await fetch(new URL(path, base), {
      signal,
      cache: 'no-store',
      headers: { Authorization: `APIToken ${environment.XCSH_API_TOKEN}`, Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`F5 observation failed with HTTP ${response.status}`);
    return response.json();
  };
  const source = `/api/config/namespaces/system/securemesh_site_v2s/${expected.siteName}`;
  const configuration = await get(source);
  const [sites, registrations, vpm] = await Promise.all([
    get('/api/config/namespaces/system/sites'),
    get(`/api/register/namespaces/system/registrations_by_site/${expected.siteName}`),
    get(`/api/operate/namespaces/system/sites/${expected.siteName}/vpm/debug/global/health`),
  ]);
  const recheck = await get(source);
  if (
    recheck.system_metadata?.uid !== configuration.system_metadata?.uid ||
    JSON.stringify(recheck.spec) !== JSON.stringify(configuration.spec)
  )
    throw new Error('Configuration drifted during node observation');
  return {
    ...parseNodeAdmission(expected, configuration, sites, registrations, vpm),
    observedAt: new Date().toISOString(),
    observationContract: observationPin,
  };
}
