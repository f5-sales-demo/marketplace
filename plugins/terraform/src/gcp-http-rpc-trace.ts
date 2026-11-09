import { createHash, type Hash } from 'node:crypto';
import { decodeEvidenceObject } from './evidence-json';

type Json = Record<string, unknown>;
type Rpc = 'ReadDataSource' | 'ReadResource' | 'ApplyResourceChange';
export interface GoogleHttpRpcTraceScope {
  readonly rpc: Rpc;
  readonly resourceType: string;
  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly url: string;
  readonly requestReason: string;
  readonly planSha256: string;
}
export interface GoogleHttpRpcTraceCandidate {
  readonly rpcRequestId: string;
  readonly rpc: Rpc;
  readonly resourceType: string;
  readonly method: string;
  readonly url: string;
  readonly status: number;
  readonly requestReasonSha256: string;
  readonly requestBodySha256: string;
  readonly responseBodySha256: string;
  readonly requestRecordsSha256: string;
  readonly responseRecordsSha256: string;
  readonly receivedRecordSha256: string;
  readonly servedRecordSha256: string;
  readonly planSha256: string;
  readonly applyRpcQualified: false;
  readonly originalInsertQualified: false;
}
interface ActiveRpc {
  id: string;
  fingerprint: string;
  eligible: boolean;
  receivedHash: string;
}
interface Dump {
  kind: 'request' | 'response';
  marker: boolean;
  lines: string[];
  bytes: number;
  hash: Hash;
}
interface HttpRequest {
  method: string;
  url: string;
  bodyHash: string;
  recordsHash: string;
  matching: boolean;
}
interface Transaction {
  request: HttpRequest;
  status: number;
  bodyHash: string;
  recordsHash: string;
}
const providerAddress = 'registry.terraform.io/hashicorp/google';
const providerModule = 'provider.terraform-provider-google_v8.7.0_x5';
const maximumLine = 1024 * 1024,
  maximumStream = 64 * 1024 * 1024,
  maximumDump = 4 * 1024 * 1024;
const hash = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const ending = '-----------------------------------------------------';
const markers = {
  request: '---[ REQUEST ]---------------------------------------',
  response: '---[ RESPONSE ]--------------------------------------',
};
const heading = /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2} \[DEBUG\] Google API (Request|Response) Details:$/;
const text = (value: unknown) => {
  if (typeof value !== 'string') throw new Error('Malformed original trace field');
  for (const char of value) if (char.charCodeAt(0) < 32) throw new Error('Multiline or control trace field');
  return value;
};

function headers(lines: string[]) {
  const separator = lines.indexOf('');
  if (separator < 1) throw new Error('Incomplete original HTTP headers');
  const values = new Map<string, string[]>();
  for (const line of lines.slice(1, separator)) {
    const found = /^([a-zA-Z][a-zA-Z0-9-]*):[ \t]*(.*)$/.exec(line);
    if (!found) throw new Error('Malformed original HTTP header');
    const key = found[1].toLowerCase();
    values.set(key, [...(values.get(key) ?? []), found[2].trim()]);
  }
  for (const key of ['host', 'authorization', 'content-type', 'content-length', 'x-goog-request-reason'])
    if ((values.get(key)?.length ?? 0) > 1) throw new Error('Ambiguous original HTTP header');
  return {
    values,
    body: lines
      .slice(separator + 1)
      .join('\n')
      .trim(),
  };
}
function jsonBody(body: string, contentType: string | undefined, required: boolean) {
  if (!body) {
    if (required) throw new Error('Missing original HTTP response body');
    return hash('');
  }
  if (!contentType || !/^application\/json(?:\s*;.*)?$/i.test(contentType))
    throw new Error('Original HTTP JSON content type required');
  decodeEvidenceObject(Buffer.from(body));
  return hash(body);
}

/** Pinned Google 8.7 / protocol 5.11 split-record inspection.
 * Original bytes must be retained and their producers admitted separately.
 * Serialized RPC and HTTP pairs remain candidates; this parser never authorizes
 * an apply, a resource incarnation, token reuse or an installed controller.
 */
export class GoogleHttpRpcTraceParser {
  readonly #scope: Readonly<GoogleHttpRpcTraceScope>;
  readonly #base: string;
  readonly #buffer = Buffer.allocUnsafe(maximumLine);
  readonly #seen = new Set<string>();
  #lineBytes = 0;
  #streamBytes = 0;
  #failed = false;
  #closed = false;
  #active: ActiveRpc | undefined;
  #dump: Dump | undefined;
  #pending: HttpRequest | undefined;
  #matched: Transaction | undefined;
  #matches = 0;

  constructor(scope: GoogleHttpRpcTraceScope) {
    const url = new URL(scope.url);
    const project = /^\/compute\/v1\/projects\/([a-z][a-z0-9-]{4,62})(?:\/|$)/.exec(url.pathname);
    if (
      !['ReadDataSource', 'ReadResource', 'ApplyResourceChange'].includes(scope.rpc) ||
      !/^google_[a-z0-9_]+$/.test(scope.resourceType) ||
      !['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(scope.method) ||
      !/^[a-f0-9]{64}$/.test(scope.planSha256) ||
      !scope.requestReason ||
      scope.requestReason.length > 256 ||
      url.protocol !== 'https:' ||
      !['compute.googleapis.com', 'www.googleapis.com'].includes(url.hostname) ||
      url.port ||
      url.username ||
      url.password ||
      url.hash ||
      !project
    )
      throw new Error('Fixed reviewed Google trace scope required');
    text(scope.requestReason);
    this.#scope = Object.freeze({ ...scope });
    this.#base = `${url.origin}/compute/v1/projects/${project[1]}/`;
  }
  #open() {
    if (this.#failed) throw new Error('Original HTTP/RPC trace failed');
    if (this.#closed) throw new Error('Original HTTP/RPC trace closed');
  }
  push(chunk: Uint8Array): readonly GoogleHttpRpcTraceCandidate[] {
    this.#open();
    try {
      this.#streamBytes += chunk.byteLength;
      if (this.#streamBytes > maximumStream) throw new Error('Original trace stream limit exceeded');
      const output: GoogleHttpRpcTraceCandidate[] = [];
      let offset = 0;
      while (offset < chunk.length) {
        const newline = chunk.indexOf(10, offset),
          end = newline === -1 ? chunk.length : newline;
        if (this.#lineBytes + end - offset > maximumLine) throw new Error('Original trace line limit exceeded');
        this.#buffer.set(chunk.subarray(offset, end), this.#lineBytes);
        this.#lineBytes += end - offset;
        if (newline < 0) break;
        const candidate = this.#record(this.#buffer.subarray(0, this.#lineBytes));
        if (candidate) output.push(candidate);
        this.#lineBytes = 0;
        offset = newline + 1;
      }
      return output;
    } catch (error) {
      this.#failed = true;
      throw error;
    }
  }
  #record(raw: Uint8Array): GoogleHttpRpcTraceCandidate | undefined {
    const record = decodeEvidenceObject(raw);
    if (typeof record['@message'] !== 'string') throw new Error('Malformed original trace message');
    const message = record['@message'];
    const rpcRecord = record['@module'] === 'sdk.proto' && record.tf_provider_addr === providerAddress;
    const httpRecord = record['@module'] === providerModule;
    if (!rpcRecord && !httpRecord) {
      if (this.#dump && heading.test(message)) throw new Error('Original forwarding module changed');
      if (this.#dump?.marker && message === markers[this.#dump.kind])
        throw new Error('Original forwarding module changed');
      return;
    }
    const timestamp = text(record['@timestamp']);
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp) ||
      !Number.isFinite(Date.parse(timestamp)) ||
      !['trace', 'debug', 'info', 'warn', 'error'].includes(text(record['@level']))
    )
      throw new Error('Original trace envelope required');
    if (rpcRecord) return this.#rpc(record, message, raw);
    if (!this.#active) return;
    if (record['@level'] === 'error' || /\[ERROR\] Google API (?:Request|Response) error:/.test(message))
      throw new Error('Original provider HTTP dump failed');
    const found = heading.exec(message);
    if (found) {
      if (this.#dump) throw new Error('Overlapping original HTTP dumps');
      const kind = found[1] === 'Request' ? 'request' : 'response';
      if ((kind === 'request' && this.#pending) || (kind === 'response' && !this.#pending))
        throw new Error('Unpaired original HTTP transaction');
      this.#dump = { kind, marker: true, lines: [], bytes: 0, hash: createHash('sha256').update(raw).update('\n') };
      return;
    }
    const dump = this.#dump;
    if (!dump) {
      if (message === ending || message === markers.request || message === markers.response)
        throw new Error('Unpaired original HTTP dump marker');
      return;
    }
    text(message);
    dump.hash.update(raw).update('\n');
    if (dump.marker) {
      if (message !== markers[dump.kind]) throw new Error('Missing original HTTP dump marker');
      dump.marker = false;
      return;
    }
    if (message === ending) {
      this.#completeDump(dump);
      this.#dump = undefined;
      return;
    }
    dump.bytes += Buffer.byteLength(message) + 1;
    if (dump.bytes > maximumDump) throw new Error('Original HTTP dump limit exceeded');
    dump.lines.push(message);
  }
  #rpc(record: Json, message: string, raw: Uint8Array): GoogleHttpRpcTraceCandidate | undefined {
    if (record.tf_proto_version !== '5.11') throw new Error('Pinned original Google protocol required');
    if (this.#active && record['@level'] === 'error') throw new Error('Original provider RPC failed');
    if (!['Received request', 'Served request'].includes(message)) return;
    const id = text(record.tf_req_id),
      rpc = text(record.tf_rpc);
    if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id))
      throw new Error('Original RPC request identity required');
    const fingerprint = JSON.stringify([rpc, record.tf_resource_type ?? null, record.tf_data_source_type ?? null]);
    if (message === 'Received request') {
      if (this.#active || this.#seen.has(id)) throw new Error('Concurrent or replayed original Google RPC');
      this.#seen.add(id);
      this.#active = {
        id,
        fingerprint,
        eligible:
          rpc === this.#scope.rpc &&
          (record.tf_resource_type ?? record.tf_data_source_type) === this.#scope.resourceType,
        receivedHash: createHash('sha256').update(raw).update('\n').digest('hex'),
      };
      return;
    }
    const active = this.#active;
    if (!active || active.id !== id || active.fingerprint !== fingerprint || this.#dump || this.#pending)
      throw new Error('Unpaired or changed original Google RPC');
    this.#active = undefined;
    const transaction = this.#matched;
    this.#matched = undefined;
    if (!transaction) return;
    this.#matches++;
    if (this.#matches !== 1) throw new Error('Replayed matching original HTTP transaction');
    return Object.freeze({
      rpcRequestId: id,
      rpc: this.#scope.rpc,
      resourceType: this.#scope.resourceType,
      method: transaction.request.method,
      url: transaction.request.url,
      status: transaction.status,
      requestReasonSha256: hash(this.#scope.requestReason),
      requestBodySha256: transaction.request.bodyHash,
      responseBodySha256: transaction.bodyHash,
      requestRecordsSha256: transaction.request.recordsHash,
      responseRecordsSha256: transaction.recordsHash,
      receivedRecordSha256: active.receivedHash,
      servedRecordSha256: createHash('sha256').update(raw).update('\n').digest('hex'),
      planSha256: this.#scope.planSha256,
      applyRpcQualified: false,
      originalInsertQualified: false,
    });
  }
  #completeDump(dump: Dump) {
    const parsed = headers(dump.lines),
      recordsHash = dump.hash.digest('hex');
    if (dump.kind === 'request') {
      const line = /^(GET|POST|PUT|PATCH|DELETE) (\/[^ ]*) HTTP\/1\.1$/.exec(dump.lines[0]);
      const host = parsed.values.get('host')?.[0];
      if (!line || line[2].startsWith('//') || !host) throw new Error('Fixed original HTTP request line required');
      const url = new URL(`https://${host}${line[2]}`);
      if (!url.href.startsWith(this.#base) || url.username || url.password || url.hash || url.port)
        throw new Error('Original Google HTTP target differs');
      if (parsed.values.get('x-goog-request-reason')?.[0] !== this.#scope.requestReason)
        throw new Error('Original reviewed HTTP request reason differs');
      const matching =
        this.#active?.eligible === true && line[1] === this.#scope.method && url.href === this.#scope.url;
      if (matching && (this.#matched || this.#matches)) throw new Error('Replayed matching original HTTP request');
      this.#pending = {
        method: line[1],
        url: url.href,
        matching,
        recordsHash,
        bodyHash: jsonBody(parsed.body, parsed.values.get('content-type')?.[0], false),
      };
      return;
    }
    const status = /^HTTP\/(?:1\.0|1\.1|2\.0) ([1-5][0-9]{2})(?: .*)?$/.exec(dump.lines[0]);
    if (!status || !this.#pending) throw new Error('Original HTTP response identity required');
    const bodyHash = jsonBody(parsed.body, parsed.values.get('content-type')?.[0], true);
    if (this.#pending.matching)
      this.#matched = { request: this.#pending, status: Number(status[1]), bodyHash, recordsHash };
    this.#pending = undefined;
  }
  finish() {
    this.#open();
    if (this.#lineBytes || this.#active || this.#dump || this.#pending || this.#matches !== 1) {
      this.#failed = true;
      throw new Error('Original HTTP/RPC trace truncated or missing matching evidence');
    }
    this.#closed = true;
    return Object.freeze({
      complete: true as const,
      matchingTransactions: this.#matches,
      applyRpcQualified: false as const,
      originalInsertQualified: false as const,
    });
  }
}
