import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { createWireValidator } from './wire-schema';
import { buildWireSite, type WireSiteIntent } from './wire-site';

type Json = Record<string, unknown>;
const hash = (bytes: Uint8Array) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const commitPattern = /^[0-9a-f]{40}$/;
const digestPattern = /^sha256:[0-9a-f]{64}$/;
function object(value: unknown): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid verified CE contract');
  return value as Json;
}
function parse(bytes: Uint8Array): Json {
  try {
    return object(JSON.parse(Buffer.from(bytes).toString('utf8')));
  } catch {
    throw new Error('Malformed CE contract artifact');
  }
}
const files = ['smsv2-contract.json', 'smsv2-contract-manifest.json', 'smsv2-evidence-receipt.json', 'sites.json'];

/** Candidate admission is for local acceptance only. It does not assert public release or live parity. */
export class VerifiedCeContract {
  readonly publication = 'local-candidate' as const;
  readonly #contract: Json;
  readonly #schemas: Json;
  readonly #validate: (spec: unknown) => void;
  private constructor(
    readonly commit: string,
    readonly fingerprint: string,
    contract: Json,
    schemas: Json,
  ) {
    this.#contract = contract;
    this.#schemas = schemas;
    this.#validate = createWireValidator(schemas);
  }
  static async candidate(directory: string, expectedReceiptSha256: string): Promise<VerifiedCeContract> {
    if (!isAbsolute(directory) || !digestPattern.test(expectedReceiptSha256))
      throw new Error('Candidate path and pinned receipt digest required');
    const receiptBytes = await readFile(join(directory, 'candidate-receipt.json'));
    if (hash(receiptBytes) !== expectedReceiptSha256) throw new Error('CE candidate receipt checksum mismatch');
    const receipt = parse(receiptBytes);
    if (
      receipt.kind !== 'local-candidate' ||
      receipt.repository !== 'f5-sales-demo/api-specs-enriched' ||
      receipt.publication !== 'held' ||
      typeof receipt.commit !== 'string' ||
      !commitPattern.test(receipt.commit)
    )
      throw new Error('Invalid CE candidate provenance');
    const declared = object(receipt.assets);
    if (
      Object.keys(declared).length !== files.length ||
      files.some((file) => typeof declared[file] !== 'string' || !digestPattern.test(declared[file] as string))
    )
      throw new Error('CE candidate asset inventory is incomplete');
    const assets: Record<string, Json> = {};
    for (const file of files) {
      const bytes = await readFile(join(directory, file));
      if (hash(bytes) !== declared[file]) throw new Error('CE candidate asset checksum mismatch');
      assets[file] = parse(bytes);
    }
    const manifest = assets['smsv2-contract-manifest.json'];
    const contract = assets['smsv2-contract.json'];
    const evidence = assets['smsv2-evidence-receipt.json'];
    if (
      manifest.schema_version !== 1 ||
      object(manifest.release).commit !== receipt.commit ||
      contract.contract_id !== 'f5xc-smsv2-api/v1' ||
      contract.version !== '7.0.0' ||
      manifest.contract_id !== contract.contract_id ||
      manifest.contract_version !== contract.version ||
      evidence.contract_id !== contract.contract_id
    )
      throw new Error('CE candidate contract identity mismatch');
    const bindings = object(manifest.assets);
    if (
      bindings['smsv2-contract.json'] !== declared['smsv2-contract.json'] ||
      bindings['smsv2-evidence-receipt.json'] !== declared['smsv2-evidence-receipt.json']
    )
      throw new Error('CE candidate manifest checksum mismatch');
    const api = object(contract.api);
    if (
      api.namespace !== 'system' ||
      api.collection_path !== '/api/config/namespaces/{namespace}/securemesh_site_v2s' ||
      api.item_path !== '/api/config/namespaces/{namespace}/securemesh_site_v2s/{name}'
    )
      throw new Error('Unsupported CE API paths');
    const schemas = object(object(assets['sites.json'].components).schemas);
    return new VerifiedCeContract(receipt.commit, expectedReceiptSha256, contract, schemas);
  }
  buildSite(intent: WireSiteIntent): Json {
    return buildWireSite(intent, this.#schemas);
  }
  validateSite(spec: unknown): void {
    this.#validate(spec);
  }
  provider(name: 'aws' | 'azure'): Json {
    return structuredClone(object(object(this.#contract.providers)[name]));
  }
  get api(): Json {
    return structuredClone(object(this.#contract.api));
  }
}
