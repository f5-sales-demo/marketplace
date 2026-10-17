import { createHash } from 'node:crypto';
import { fingerprint } from './discovery';

export const GCP_CE_API_RELEASE = {
  repository: 'f5-sales-demo/api-specs-enriched',
  tag: 'v12.0.10',
  contractDigest: 'sha256:2dd4d33693c9e228bfb304d7558a2f50ca9cc0146407f8fb9b5f0ca7d7c56f3c',
} as const;
export interface GcpCeContractBoundary {
  release: typeof GCP_CE_API_RELEASE;
  fingerprint: string;
  availability: 'unavailable';
  reason: 'gcp_provider_not_published' | 'gcp_provider_requires_consumer_qualification';
}
export async function resolveGcpContract(fetcher: typeof fetch = fetch): Promise<GcpCeContractBoundary> {
  const base = `https://api.github.com/repos/${GCP_CE_API_RELEASE.repository}`;
  const response = await fetcher(`${base}/releases/tags/${GCP_CE_API_RELEASE.tag}`, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!response.ok) throw new Error(`Contract release unavailable: HTTP ${response.status}`);
  const release = await response.json();
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
  const asset = await fetcher(expectedUrl);
  if (!asset.ok) throw new Error(`Contract asset unavailable: HTTP ${asset.status}`);
  const bytes = new Uint8Array(await asset.arrayBuffer());
  if (`sha256:${createHash('sha256').update(bytes).digest('hex')}` !== GCP_CE_API_RELEASE.contractDigest)
    throw new Error('Contract asset digest mismatch');
  const contract = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (
    contract.contract_id !== 'f5xc-smsv2-api/v1' ||
    !contract.providers ||
    typeof contract.providers !== 'object' ||
    Array.isArray(contract.providers)
  )
    throw new Error('Malformed executable CE contract');
  // A newly declared provider is insufficient: explicit wire/bootstrap/runtime
  // mappings must be qualified by the consumer before any mutation is enabled.
  return {
    release: GCP_CE_API_RELEASE,
    fingerprint: fingerprint(contract),
    availability: 'unavailable',
    reason: Object.hasOwn(contract.providers, 'gcp')
      ? 'gcp_provider_requires_consumer_qualification'
      : 'gcp_provider_not_published',
  };
}
