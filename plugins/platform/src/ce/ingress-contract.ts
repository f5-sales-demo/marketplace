import { createHash } from 'node:crypto';
import { buildInsideHttpListener, type InsideHttpListener, projectInsideHttpListener } from './wire-ingress';
import { createWireValidator } from './wire-schema';

type Json = Record<string, unknown>;
type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
const repository = 'f5-sales-demo/api-specs-enriched';
const tag = 'v6.1.2';
const commit = 'a5fa987f876db955666bd94fefed35f283bb5364';
const digest = 'sha256:66f3c819e6c1cdc96dadcee513cf0b5af74b70b5d603d28f70578e6f206cfef7';
const assetUrl = `https://github.com/${repository}/releases/download/${tag}/openapi.json`;
function object(value: unknown): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed ingress contract');
  return value as Json;
}
function parse(bytes: Uint8Array): Json {
  try {
    return object(JSON.parse(Buffer.from(bytes).toString('utf8')));
  } catch {
    throw new Error('Malformed ingress contract JSON');
  }
}

/** HTTP schema authority is independent of SMSv2 bootstrap capability and live ingress acceptance. */
export class VerifiedIngressContract {
  readonly identity = 'f5xc-ce-http-ingress-api/v1';
  readonly publication = 'immutable-release';
  readonly releaseTag = tag;
  readonly commit = commit;
  readonly fingerprint = digest;
  readonly #validate: (spec: unknown) => void;
  readonly #schemas: Json;
  private constructor(schemas: Json) {
    this.#schemas = schemas;
    this.#validate = createWireValidator(schemas, 'viewshttp_loadbalancerCreateSpecType');
  }
  static async release(fetcher: Fetcher = fetch, signal?: AbortSignal): Promise<VerifiedIngressContract> {
    const deadline = AbortSignal.timeout(60_000);
    const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
    const read = async (url: string, maximum = 1_048_576): Promise<Uint8Array> => {
      combined.throwIfAborted();
      const response = await fetcher(url, { signal: combined, headers: { Accept: 'application/vnd.github+json' } });
      if (!response.ok || !response.body) throw new Error('Ingress contract download failed');
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          combined.throwIfAborted();
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > maximum) throw new Error('Ingress contract download exceeds size limit');
          chunks.push(value);
        }
      } finally {
        await reader.cancel();
        reader.releaseLock();
      }
      return Buffer.concat(chunks);
    };
    const release = parse(await read(`https://api.github.com/repos/${repository}/releases/tags/${tag}`));
    if (
      release.tag_name !== tag ||
      release.immutable !== true ||
      release.draft !== false ||
      release.prerelease !== false
    )
      throw new Error('Ingress release is not the pinned immutable publication');
    const matches =
      typeof release.body === 'string' ? [...release.body.matchAll(/^<!-- publication-receipt:(.+) -->$/gm)] : [];
    if (matches.length !== 1) throw new Error('Ingress publication receipt is missing or ambiguous');
    const receipt = parse(Buffer.from(matches[0][1]));
    if (receipt.commit !== commit || receipt.version !== '6.1.2' || object(receipt.assets)['openapi.json'] !== digest)
      throw new Error('Ingress publication receipt differs from the pinned contract');
    const assets = Array.isArray(release.assets)
      ? release.assets.map(object).filter((asset) => asset.name === 'openapi.json')
      : [];
    if (assets.length !== 1 || assets[0].digest !== digest || assets[0].browser_download_url !== assetUrl)
      throw new Error('Ingress schema asset binding differs from the pinned contract');
    const resolved = parse(await read(`https://api.github.com/repos/${repository}/commits/${tag}`));
    if (resolved.sha !== commit) throw new Error('Ingress release tag moved');
    const bytes = await read(assetUrl, 64 * 1024 * 1024);
    if (`sha256:${createHash('sha256').update(bytes).digest('hex')}` !== digest)
      throw new Error('Ingress schema checksum mismatch');
    const api = parse(bytes);
    const path = object(object(api.paths)['/api/config/namespaces/{metadata.namespace}/http_loadbalancers']);
    const schema = object(object(object(object(object(path.post).requestBody).content)['application/json']).schema);
    if (schema.$ref !== '#/components/schemas/http_loadbalancerCreateRequest')
      throw new Error('Unsupported ingress request path');
    combined.throwIfAborted();
    return new VerifiedIngressContract(object(object(api.components).schemas));
  }
  build(input: InsideHttpListener) {
    return buildInsideHttpListener(input, this.#validate);
  }
  projectObserved(spec: unknown): Json {
    return projectInsideHttpListener(spec, this.#schemas, this.#validate);
  }
}
