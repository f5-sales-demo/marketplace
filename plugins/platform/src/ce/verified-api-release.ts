import { createHash } from 'node:crypto';

type Json = Record<string, unknown>;
export type PublishedApiFetcher = (url: string, init?: RequestInit) => Promise<Response>;
const repository = 'f5-sales-demo/api-specs-enriched';
const tag = 'v7.0.1';
const commit = '2513fe498149c98fb737ff2ab207704b8a86fec6';
const digest = 'sha256:48863c0a2e6c6a6fde050f4f8f5a6966b02872851fa1acb7830f26ef2e143cd9';
const assetUrl = `https://github.com/${repository}/releases/download/${tag}/openapi.json`;
function object(value: unknown): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed CE API contract');
  return value as Json;
}
function parse(bytes: Uint8Array): Json {
  try {
    return object(JSON.parse(Buffer.from(bytes).toString('utf8')));
  } catch {
    throw new Error('Malformed CE API contract JSON');
  }
}

export const CE_API_RELEASE = Object.freeze({ tag, commit, fingerprint: digest });

/** Verify publication identity and bytes independently of each operation's capability contract. */
export async function loadPublishedCeApi(fetcher: PublishedApiFetcher = fetch, signal?: AbortSignal): Promise<Json> {
  const deadline = AbortSignal.timeout(60_000);
  const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
  const read = async (url: string, maximum = 1_048_576): Promise<Uint8Array> => {
    combined.throwIfAborted();
    const response = await fetcher(url, { signal: combined, headers: { Accept: 'application/vnd.github+json' } });
    if (!response.ok || !response.body) throw new Error('CE API contract download failed');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        combined.throwIfAborted();
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > maximum) throw new Error('CE API contract download exceeds size limit');
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
    return Buffer.concat(chunks);
  };
  const release = parse(await read(`https://api.github.com/repos/${repository}/releases/tags/${tag}`));
  if (release.tag_name !== tag || release.immutable !== true || release.draft !== false || release.prerelease !== false)
    throw new Error('CE API release is not the pinned immutable publication');
  const matches =
    typeof release.body === 'string' ? [...release.body.matchAll(/^<!-- publication-receipt:(.+) -->$/gm)] : [];
  if (matches.length !== 1) throw new Error('CE API publication receipt is missing or ambiguous');
  const receipt = parse(Buffer.from(matches[0][1]));
  if (receipt.commit !== commit || receipt.version !== '7.0.1' || object(receipt.assets)['openapi.json'] !== digest)
    throw new Error('CE API publication receipt differs from the pinned contract');
  const assets = Array.isArray(release.assets)
    ? release.assets.map(object).filter((asset) => asset.name === 'openapi.json')
    : [];
  if (assets.length !== 1 || assets[0].digest !== digest || assets[0].browser_download_url !== assetUrl)
    throw new Error('CE API schema asset binding differs from the pinned contract');
  const resolved = parse(await read(`https://api.github.com/repos/${repository}/commits/${tag}`));
  if (resolved.sha !== commit) throw new Error('CE API release tag moved');
  const bytes = await read(assetUrl, 64 * 1024 * 1024);
  if (`sha256:${createHash('sha256').update(bytes).digest('hex')}` !== digest)
    throw new Error('CE API schema checksum mismatch');
  const api = parse(bytes);
  combined.throwIfAborted();
  return api;
}
