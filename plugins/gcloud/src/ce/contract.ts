import { createHash } from 'node:crypto';
import { fingerprint } from './discovery';
import type { OperationalProfile, OperationalReleaseQualification } from './operational-health';
import { GCP_OPERATIONAL_RELEASE_PIN, resolveGcpOperationalRelease } from './operational-release';

export interface GcpOperationalContract {
  profile: OperationalProfile;
  contractFingerprint: string;
  qualification: OperationalReleaseQualification;
  qualificationFingerprint: string;
}

export const GCP_CE_API_RELEASE = {
  repository: 'f5-sales-demo/api-specs-enriched',
  tag: 'v12.1.3',
  contractDigest: 'sha256:ae71bf8f1d69bb248f21a664bfec974c322188b6e17755c245d20d24e1e0e6bc',
} as const;
export interface GcpCeContractBoundary {
  release: typeof GCP_CE_API_RELEASE;
  fingerprint: string;
  availability: 'unavailable';
  reason: 'gcp_provider_not_published' | 'gcp_provider_requires_consumer_qualification';
  observations?: {
    configuration: '/api/config/namespaces/system/securemesh_site_v2s/{site}';
    registrations: '/api/register/namespaces/system/registrations_by_site/{site}';
    health: '/api/operate/namespaces/system/sites/{site}/vpm/debug/global/health';
  };
  haObservations?: {
    componentStatus: '/api/operate/namespaces/system/sites/{site}/vpm/debug/global/ves-system/status?cached=false';
    serviceInventory: '/api/operate/namespaces/system/sites/{site}/vpm/debug/global/list-service';
  };
  haHealthContract?: Record<string, unknown>;
  operationalHealthContract?: GcpOperationalContract;
  operationalHealthExpected?: { contractFingerprint: string; qualificationFingerprint: string };
  singleNodeLifecycle?: Record<string, unknown>;
}
/** Bind read-only HA paths to the exact owning immutable schema asset. */
export function qualifiedGcpHaObservationMappings(assets: unknown): GcpCeContractBoundary['haObservations'] {
  if (!Array.isArray(assets)) return undefined;
  const matches = assets.filter((asset) => asset && asset.name === 'openapi.json');
  if (
    matches.length !== 1 ||
    matches[0].digest !== 'sha256:3738c3267be63ec2c82716bdf197f7633b8845692ea7fe72e5a11bf2b8d10b77' ||
    matches[0].browser_download_url !==
      `https://github.com/${GCP_CE_API_RELEASE.repository}/releases/download/${GCP_CE_API_RELEASE.tag}/openapi.json`
  )
    return undefined;
  return {
    componentStatus: '/api/operate/namespaces/system/sites/{site}/vpm/debug/global/ves-system/status?cached=false',
    serviceInventory: '/api/operate/namespaces/system/sites/{site}/vpm/debug/global/list-service',
  };
}
export async function resolveGcpContract(
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<GcpCeContractBoundary> {
  const combined = signal ? AbortSignal.any([signal, AbortSignal.timeout(60_000)]) : AbortSignal.timeout(60_000);
  const read = async (url: string, maximum = 1024 * 1024): Promise<Uint8Array> => {
    combined.throwIfAborted();
    const response = await fetcher(url, {
      signal: combined,
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!response.ok) throw new Error(`Contract release unavailable: HTTP ${response.status}`);
    if (!response.body) throw new Error('Contract response body unavailable');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        combined.throwIfAborted();
        const { done, value } = await reader.read();
        combined.throwIfAborted();
        if (done) break;
        size += value.length;
        if (size > maximum) throw new Error('Contract response exceeds size limit');
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
    return Buffer.concat(chunks);
  };
  const decode = (bytes: Uint8Array) => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  const base = `https://api.github.com/repos/${GCP_CE_API_RELEASE.repository}`;
  const release = decode(await read(`${base}/releases/tags/${GCP_CE_API_RELEASE.tag}`));
  if (
    release.tag_name !== GCP_CE_API_RELEASE.tag ||
    release.immutable !== true ||
    release.draft !== false ||
    release.prerelease !== false
  )
    throw new Error('Contract release is not final and immutable');
  const assets = release.assets;
  if (!Array.isArray(assets)) throw new Error('Malformed contract release assets');
  const matches = assets.filter((asset) => asset.name === 'smsv2-contract.json');
  const expectedUrl = `https://github.com/${GCP_CE_API_RELEASE.repository}/releases/download/${GCP_CE_API_RELEASE.tag}/smsv2-contract.json`;
  if (
    matches.length !== 1 ||
    matches[0].digest !== GCP_CE_API_RELEASE.contractDigest ||
    matches[0].browser_download_url !== expectedUrl
  )
    throw new Error('Contract asset identity mismatch');
  const bytes = await read(expectedUrl, 4 * 1024 * 1024);
  if (`sha256:${createHash('sha256').update(bytes).digest('hex')}` !== GCP_CE_API_RELEASE.contractDigest)
    throw new Error('Contract asset digest mismatch');
  const contract = decode(bytes);
  if (
    contract.contract_id !== 'f5xc-smsv2-api/v1' ||
    !contract.providers ||
    typeof contract.providers !== 'object' ||
    Array.isArray(contract.providers)
  )
    throw new Error('Malformed executable CE contract');
  // A newly declared provider is insufficient: explicit wire/bootstrap/runtime
  // mappings must be qualified by the consumer before any mutation is enabled.
  const gcp = contract.providers.gcp;
  const observations =
    gcp?.registration_observation?.availability === 'observational_read_only' &&
    gcp.registration_observation.path === '/api/register/namespaces/system/registrations_by_site/{site_name}' &&
    gcp.registration_observation.method === 'GET' &&
    gcp.registration_observation.required_provider === 'GOOGLE' &&
    gcp.physical_interface_observation?.availability === 'observational_read_only' &&
    gcp.global_health_observation?.availability === 'observational_read_only' &&
    gcp.global_health_observation.path === '/api/operate/namespaces/system/sites/{site}/vpm/debug/global/health' &&
    gcp.global_health_observation.method === 'GET' &&
    gcp.global_health_observation.healthy_state === 'PROVISIONED' &&
    gcp.global_health_observation.exact_node_join_required === true &&
    fingerprint(gcp.global_health_observation.state_values) ===
      fingerprint(['WAITING_FOR_CONFIG', 'WAITING_FOR_APPROVAL', 'PROVISIONING', 'PROVISIONED', 'FAILED', 'RESETTING'])
      ? {
          configuration: '/api/config/namespaces/system/securemesh_site_v2s/{site}' as const,
          registrations: '/api/register/namespaces/system/registrations_by_site/{site}' as const,
          health: '/api/operate/namespaces/system/sites/{site}/vpm/debug/global/health' as const,
        }
      : undefined;
  let operationalHealthContract: GcpOperationalContract | undefined;
  if (observations) {
    try {
      operationalHealthContract = await resolveGcpOperationalRelease(fetcher, combined);
    } catch {
      signal?.throwIfAborted();
    }
  }
  return {
    release: GCP_CE_API_RELEASE,
    fingerprint: fingerprint(contract),
    availability: 'unavailable',
    reason: Object.hasOwn(contract.providers, 'gcp')
      ? 'gcp_provider_requires_consumer_qualification'
      : 'gcp_provider_not_published',
    ...(observations ? { observations } : {}),
    ...(operationalHealthContract ? { operationalHealthContract } : {}),
    ...(GCP_OPERATIONAL_RELEASE_PIN
      ? {
          operationalHealthExpected: {
            contractFingerprint: GCP_OPERATIONAL_RELEASE_PIN.contractFingerprint,
            qualificationFingerprint: GCP_OPERATIONAL_RELEASE_PIN.qualificationFingerprint,
          },
        }
      : {}),
    // These read-only wire shapes were checked against this exact immutable schema.
    // This grants collection only; it cannot establish completeness or HA lifecycle admission.
    ...(observations && qualifiedGcpHaObservationMappings(assets)
      ? { haObservations: qualifiedGcpHaObservationMappings(assets) }
      : {}),
    ...(gcp?.single_node_lifecycle?.availability === 'evidence_backed_single_node' &&
    gcp.single_node_lifecycle.node_count === 1 &&
    gcp.single_node_lifecycle.interface_count === 2 &&
    gcp.single_node_lifecycle.consumer_runtime_qualification_required === true
      ? { singleNodeLifecycle: structuredClone(gcp.single_node_lifecycle) }
      : {}),
  };
}
