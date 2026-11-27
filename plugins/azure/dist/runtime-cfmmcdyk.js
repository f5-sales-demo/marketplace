// biome-ignore-all lint: Generated Bun bundle; lint the source modules instead.
// @bun
// plugins/platform/src/ce/verified-api-release.ts

// plugins/platform/src/ce/contract-auth.ts
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

function existingContractCredential(env = process.env) {
  const configured = env.GH_TOKEN || env.GITHUB_TOKEN;
  if (configured) return configured;
  try {
    return (
      execFileSync('gh', ['auth', 'token'], {
        encoding: 'utf8',
        timeout: 5000,
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim() || undefined
    );
  } catch {
    return;
  }
}
function contractHeaders(url, token) {
  const headers = { Accept: 'application/vnd.github+json' };
  const target = new URL(url);
  if (
    token &&
    target.origin === 'https://api.github.com' &&
    target.pathname.startsWith('/repos/f5-sales-demo/api-specs-enriched/')
  )
    headers.Authorization = `Bearer ${token}`;
  return headers;
}
function authenticatedContractHeaders(url) {
  const target = new URL(url);
  const scoped =
    target.origin === 'https://api.github.com' &&
    target.pathname.startsWith('/repos/f5-sales-demo/api-specs-enriched/');
  return contractHeaders(url, scoped ? existingContractCredential() : undefined);
}

// plugins/platform/src/ce/verified-api-release.ts
class CeContractFailure extends Error {
  category;
  constructor(category, message) {
    super(message);
    this.category = category;
  }
}
var repository = 'f5-sales-demo/api-specs-enriched';
var tag = 'v12.3.0';
var commit = '7f61de00a1048a801c4be6bea9c462803fd1e3ae';
var digest = 'sha256:91411ef102ecdb5564f7d3b188407c7d1468d6f9949ca4e5634e420ed1dca8b5';
var assetUrl = `https://github.com/${repository}/releases/download/${tag}/openapi.json`;
function object(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed CE API contract');
  return value;
}
function parse(bytes) {
  try {
    return object(JSON.parse(Buffer.from(bytes).toString('utf8')));
  } catch {
    throw new Error('Malformed CE API contract JSON');
  }
}
var CE_API_RELEASE = Object.freeze({ tag, commit, fingerprint: digest });
var verifiedSchemas = new WeakMap();
async function loadPublishedCeApi(fetcher = fetch, signal) {
  signal?.throwIfAborted();
  let pending = verifiedSchemas.get(fetcher);
  if (!pending) {
    pending = verifyPublishedCeApi(fetcher, signal);
    verifiedSchemas.set(fetcher, pending);
    pending.catch(() => {
      if (verifiedSchemas.get(fetcher) === pending) verifiedSchemas.delete(fetcher);
    });
  }
  const api = await pending;
  signal?.throwIfAborted();
  return structuredClone(api);
}
async function verifyPublishedCeApi(fetcher, signal) {
  const deadline = AbortSignal.timeout(60000);
  const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
  const read = async (url, maximum = 1048576) => {
    combined.throwIfAborted();
    let response;
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
    const chunks = [];
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

export { CE_API_RELEASE, loadPublishedCeApi };
