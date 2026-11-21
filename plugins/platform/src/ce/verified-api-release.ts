import { createHash } from 'node:crypto';
import { authenticatedContractHeaders } from './contract-auth';

type Json = Record<string, unknown>;
export type PublishedApiFetcher = (url: string, init?: RequestInit) => Promise<Response>;
export class CeContractFailure extends Error {
  constructor(
    readonly category: 'public_contract_transport',
    message: string,
  ) {
    super(message);
  }
}
const repository = 'f5-sales-demo/api-specs-enriched';
const tag = 'v12.3.0';
const commit = '7f61de00a1048a801c4be6bea9c462803fd1e3ae';
const digest = 'sha256:91411ef102ecdb5564f7d3b188407c7d1468d6f9949ca4e5634e420ed1dca8b5';
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
const verifiedSchemas = new WeakMap<PublishedApiFetcher, Promise<Json>>();

/** Immutable verified bytes are shared; live tenant observations are never cached here. */
export async function loadPublishedCeApi(fetcher: PublishedApiFetcher = fetch, signal?: AbortSignal): Promise<Json> {
  signal?.throwIfAborted();
  let pending = verifiedSchemas.get(fetcher);
  if (!pending) {
    pending = verifyPublishedCeApi(fetcher, signal);
    verifiedSchemas.set(fetcher, pending);
    void pending.catch(() => {
      if (verifiedSchemas.get(fetcher) === pending) verifiedSchemas.delete(fetcher);
    });
  }
  const api = await pending;
  signal?.throwIfAborted();
  return structuredClone(api);
}

async function verifyPublishedCeApi(fetcher: PublishedApiFetcher, signal?: AbortSignal): Promise<Json> {
  const deadline = AbortSignal.timeout(60_000);
  const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
  const read = async (url: string, maximum = 1_048_576): Promise<Uint8Array> => {
    combined.throwIfAborted();
    let response: Response;
    try {
      response = await fetcher(url, { signal: combined, headers: authenticatedContractHeaders(url) });
    } catch {
      throw new CeContractFailure('public_contract_transport', 'Published contract transport failed');
    }
    if (!response.ok || !response.body)
      throw new CeContractFailure(
        'public_contract_transport',
        `CE API contract download failed: HTTP ${response.status}, ${new URL(url).hostname}`,
      );
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
  if (receipt.commit !== commit || receipt.version !== '12.3.0' || object(receipt.assets)['openapi.json'] !== digest)
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
