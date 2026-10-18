import { createHash } from 'node:crypto';
import { fingerprint } from './discovery';

export const GCP_CE_API_RELEASE = {
  repository: 'f5-sales-demo/api-specs-enriched',
  tag: 'v12.1.1',
  contractDigest: 'sha256:93c430e884be34fb80de9e572e1aa6dddbb1e804df65867b9479cb77660c0f16',
} as const;
export interface GcpCeContractBoundary {
  release: typeof GCP_CE_API_RELEASE;
  fingerprint: string;
  availability: 'unavailable';
  reason: 'gcp_provider_not_published' | 'gcp_provider_requires_consumer_qualification';
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
  return {
    release: GCP_CE_API_RELEASE,
    fingerprint: fingerprint(contract),
    availability: 'unavailable',
    reason: Object.hasOwn(contract.providers, 'gcp')
      ? 'gcp_provider_requires_consumer_qualification'
      : 'gcp_provider_not_published',
  };
}
