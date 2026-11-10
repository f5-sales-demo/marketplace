import { createHash } from 'node:crypto';
import { basename, isAbsolute, resolve } from 'node:path';
import { decodeEvidenceObject } from './evidence-json';
import { isEvidenceRfc3339 } from './evidence-rfc3339';
import { type InstalledGcpVersionBinding, resolveInstalledGcpVersionProfile } from './installed-version-profile';
import {
  type OriginalExecutionOutput,
  type OriginalOutputChunk,
  type OriginalOutputCompletion,
  readOriginalExecutionChunk,
  readOriginalExecutionCompletion,
} from './original-output-stream';

type Json = Record<string, unknown>;
export interface GoogleProviderLifecycleScope {
  readonly providerPath: string;
  readonly planSha256: string;
}
export interface GoogleProviderRpcCandidate {
  readonly providerPid: number;
  readonly providerPathSha256: string;
  readonly rpc: string;
  readonly rpcRequestId: string;
  readonly resourceType: string | null;
  readonly startingRecordSha256: string;
  readonly startedRecordSha256: string;
  readonly receivedRecordSha256: string;
  readonly servedRecordSha256: string;
  readonly planSha256: string;
  readonly providerProcessQualified: false;
  readonly applyRpcQualified: false;
  readonly originalInsertQualified: false;
}
export interface OriginalGoogleProviderRpcSource {
  readonly schemaVersion: 1;
  readonly executor: Readonly<{ pid: number; group: number; start: string; boot: string }>;
  readonly stderrBytes: number;
  readonly stderrSha256: string;
  readonly planSha256: string;
}
const rpcOrigins = new WeakMap<GoogleProviderRpcCandidate, () => OriginalGoogleProviderRpcSource>();
export function readOriginalGoogleProviderRpcSource(
  candidate: GoogleProviderRpcCandidate,
): OriginalGoogleProviderRpcSource {
  const read = rpcOrigins.get(candidate);
  if (!read) throw new Error('An original descriptor-sourced Google RPC candidate is required');
  return read();
}
interface Provider {
  pid: number;
  starting: string;
  started: string;
}
interface Rpc {
  id: string;
  name: string;
  fingerprint: string;
  received: string;
  resource: string | null;
}
const maximumLine = 1024 * 1024,
  maximumStream = 64 * 1024 * 1024;
const hash = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const hasControls = (value: string) => {
  for (const char of value) if (char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) return true;
  return false;
};
const text = (value: unknown) => {
  if (typeof value !== 'string' || !value || hasControls(value))
    throw new Error('Original provider lifecycle text field required');
  return value;
};
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;

/** Authenticated Terraform / go-plugin start/exit and Google5.11 RPC profiles.
 * Original process/pipe admission must corroborate these serialized candidates.
 * No log record or PID alone grants process, RPC or cloud insert authority.
 */
export class GoogleProviderLifecycleParser {
  readonly #scope: Readonly<GoogleProviderLifecycleScope>;
  readonly #line = Buffer.allocUnsafe(maximumLine);
  readonly #pids = new Set<number>();
  readonly #requests = new Set<string>();
  #length = 0;
  #bytes = 0;
  #failed = false;
  #closed = false;
  #pending: string | undefined;
  #provider: Provider | undefined;
  #rpc: Rpc | undefined;
  #originOutput: OriginalExecutionOutput | undefined;
  #originCompletion: ReturnType<typeof readOriginalExecutionCompletion> | undefined;
  #sourceEnd = 0;
  readonly #sourceHash = createHash('sha256');
  #providers = 0;
  #rpcs = 0;
  constructor(input: GoogleProviderLifecycleScope, binding?: InstalledGcpVersionBinding) {
    const googleVersion = binding ? resolveInstalledGcpVersionProfile(binding).googleVersion : '8.7.0';
    if (
      !isAbsolute(input.providerPath) ||
      resolve(input.providerPath) !== input.providerPath ||
      basename(input.providerPath) !== `terraform-provider-google_v${googleVersion}_x5` ||
      hasControls(input.providerPath) ||
      !/^[a-f0-9]{64}$/.test(input.planSha256)
    )
      throw new Error('Original pinned provider path and reviewed plan required');
    this.#scope = Object.freeze({ ...input });
  }
  #open() {
    if (this.#failed) throw new Error('Original provider lifecycle failed');
    if (this.#closed) throw new Error('Original provider lifecycle closed');
  }
  push(chunk: Uint8Array): readonly GoogleProviderRpcCandidate[] {
    this.#open();
    if (this.#originOutput) {
      this.#failed = true;
      throw new Error('Original descriptor source cannot accept unowned bytes');
    }
    return this.#consume(chunk);
  }
  pushOriginal(output: OriginalExecutionOutput, chunk: OriginalOutputChunk): readonly GoogleProviderRpcCandidate[] {
    this.#open();
    try {
      const source = readOriginalExecutionChunk(output, chunk, 'stderr');
      if (
        (this.#originOutput && this.#originOutput !== output) ||
        (!this.#originOutput && this.#bytes !== 0) ||
        source.offset !== this.#sourceEnd
      )
        throw new Error('Original descriptor stream changed or has a gap');
      this.#originOutput = output;
      this.#sourceEnd = source.endOffset;
      this.#sourceHash.update(source.bytes);
      const candidates = this.#consume(source.bytes);
      for (const candidate of candidates)
        rpcOrigins.set(candidate, () => {
          if (this.#failed) throw new Error('Original RPC source was refused');
          const origin = this.#originCompletion;
          if (!origin) throw new Error('Original descriptor completion is required');
          readOriginalExecutionCompletion(output, origin.completion);
          return Object.freeze({
            schemaVersion: 1 as const,
            executor: origin.identity,
            stderrBytes: origin.completion.stderr.bytes,
            stderrSha256: origin.completion.stderr.sha256,
            planSha256: this.#scope.planSha256,
          });
        });
      return candidates;
    } catch (error) {
      this.#failed = true;
      throw error;
    }
  }
  #consume(chunk: Uint8Array): readonly GoogleProviderRpcCandidate[] {
    this.#open();
    try {
      this.#bytes += chunk.byteLength;
      if (this.#bytes > maximumStream) throw new Error('Original provider stream limit exceeded');
      const results: GoogleProviderRpcCandidate[] = [];
      let offset = 0;
      while (offset < chunk.length) {
        const newline = chunk.indexOf(10, offset),
          end = newline < 0 ? chunk.length : newline;
        if (this.#length + end - offset > maximumLine) throw new Error('Original provider line limit exceeded');
        this.#line.set(chunk.subarray(offset, end), this.#length);
        this.#length += end - offset;
        if (newline < 0) break;
        const result = this.#record(this.#line.subarray(0, this.#length));
        if (result) results.push(result);
        this.#length = 0;
        offset = newline + 1;
      }
      return results;
    } catch (error) {
      this.#failed = true;
      throw error;
    }
  }
  #record(raw: Uint8Array): GoogleProviderRpcCandidate | undefined {
    const value = decodeEvidenceObject(raw),
      message = value['@message'];
    if (typeof message !== 'string') throw new Error('Original lifecycle message required');
    if (value['@module'] === 'provider') {
      if (/reattach/i.test(message)) throw new Error('Reattached provider lifecycle is not original');
      const path = value.path ?? value.plugin;
      if (value.path !== this.#scope.providerPath && value.plugin !== this.#scope.providerPath) return;
      if (
        ['starting plugin', 'plugin started'].includes(message) &&
        (value.plugin !== undefined ||
          value.id !== undefined ||
          (message === 'starting plugin' ? value.pid !== undefined : value.args !== undefined))
      )
        throw new Error('Conflicting original provider lifecycle identity');
      if (
        message === 'plugin process exited' &&
        (value.path !== undefined || value.pid !== undefined || value.args !== undefined)
      )
        throw new Error('Conflicting original provider exit identity');
      this.#envelope(value);
      if (value['@level'] === 'error' || value.error !== undefined) throw new Error('Original provider failed');
      if (message === 'starting plugin') {
        if (
          this.#provider ||
          this.#pending ||
          !Array.isArray(value.args) ||
          value.args.length !== 1 ||
          value.args[0] !== path
        )
          throw new Error('Concurrent or changed original provider start');
        this.#pending = hash(Buffer.concat([Buffer.from(raw), Buffer.from('\n')]));
      } else if (message === 'plugin started') {
        if (
          !this.#pending ||
          this.#provider ||
          typeof value.pid !== 'number' ||
          !Number.isSafeInteger(value.pid) ||
          value.pid <= 0 ||
          this.#pids.has(value.pid)
        )
          throw new Error('Unpaired or replayed original provider PID');
        this.#pids.add(value.pid);
        this.#provider = {
          pid: value.pid,
          starting: this.#pending,
          started: hash(Buffer.concat([Buffer.from(raw), Buffer.from('\n')])),
        };
        this.#pending = undefined;
      } else if (message === 'plugin process exited') {
        const pid = text(value.id);
        if (!/^[1-9][0-9]*$/.test(pid) || !this.#provider || this.#rpc || pid !== String(this.#provider.pid))
          throw new Error('Unpaired or changed original provider exit');
        this.#provider = undefined;
        this.#providers++;
      }
      return;
    }
    if (value['@module'] !== 'sdk.proto') return;
    if (value.tf_provider_addr !== 'registry.terraform.io/hashicorp/google') {
      if (this.#rpc && value.tf_req_id === this.#rpc.id) throw new Error('Original RPC provider changed');
      return;
    }
    this.#envelope(value);
    if (value.tf_proto_version !== '5.11' || value['@level'] === 'error')
      throw new Error('Pinned original Google RPC protocol required');
    if (!['Received request', 'Served request'].includes(message)) return;
    if (!this.#provider || this.#pending) throw new Error('Original Google RPC has no started provider');
    const id = text(value.tf_req_id),
      name = text(value.tf_rpc);
    if (!uuid.test(id)) throw new Error('Original Google RPC identity required');
    const resource = value.tf_resource_type ?? value.tf_data_source_type ?? null;
    if (resource !== null && !/^google_[a-z0-9_]+$/.test(text(resource)))
      throw new Error('Original RPC resource type required');
    const fingerprint = JSON.stringify([name, value.tf_resource_type ?? null, value.tf_data_source_type ?? null]);
    if (message === 'Received request') {
      if (this.#rpc || this.#requests.has(id)) throw new Error('Concurrent or replayed original Google RPC');
      this.#requests.add(id);
      this.#rpc = {
        id,
        name,
        resource: resource as string | null,
        fingerprint,
        received: hash(Buffer.concat([Buffer.from(raw), Buffer.from('\n')])),
      };
      return;
    }
    const rpc = this.#rpc,
      provider = this.#provider;
    if (!rpc || rpc.id !== id || rpc.fingerprint !== fingerprint) throw new Error('Unpaired or changed original RPC');
    this.#rpc = undefined;
    this.#rpcs++;
    return Object.freeze({
      providerPid: provider.pid,
      providerPathSha256: hash(this.#scope.providerPath),
      rpc: rpc.name,
      rpcRequestId: id,
      resourceType: rpc.resource,
      startingRecordSha256: provider.starting,
      startedRecordSha256: provider.started,
      receivedRecordSha256: rpc.received,
      servedRecordSha256: hash(Buffer.concat([Buffer.from(raw), Buffer.from('\n')])),
      planSha256: this.#scope.planSha256,
      providerProcessQualified: false,
      applyRpcQualified: false,
      originalInsertQualified: false,
    });
  }
  #envelope(value: Json) {
    const stamp = text(value['@timestamp']);
    if (
      !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:[.][0-9]{1,9})?(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(
        stamp,
      ) ||
      !isEvidenceRfc3339(stamp) ||
      !['trace', 'debug', 'info', 'warn', 'error'].includes(text(value['@level']))
    )
      throw new Error('Original provider lifecycle envelope required');
  }
  finish() {
    this.#open();
    if (this.#originOutput) {
      this.#failed = true;
      throw new Error('Original descriptor completion is required');
    }
    return this.#finish();
  }
  finishOriginal(output: OriginalExecutionOutput, completion: OriginalOutputCompletion) {
    this.#open();
    try {
      const origin = readOriginalExecutionCompletion(output, completion);
      if (
        output !== this.#originOutput ||
        this.#sourceEnd !== completion.stderr.bytes ||
        this.#bytes !== completion.stderr.bytes ||
        this.#sourceHash.copy().digest('hex') !== completion.stderr.sha256
      )
        throw new Error('Original descriptor source completion differs');
      const result = this.#finish();
      this.#originCompletion = origin;
      return result;
    } catch (error) {
      this.#failed = true;
      throw error;
    }
  }
  #finish() {
    this.#open();
    if (this.#length || this.#pending || this.#provider || this.#rpc || !this.#providers || !this.#rpcs) {
      this.#failed = true;
      throw new Error('Original provider lifecycle truncated or incomplete');
    }
    this.#closed = true;
    return Object.freeze({
      complete: true as const,
      providers: this.#providers,
      rpcs: this.#rpcs,
      providerProcessQualified: false as const,
      applyRpcQualified: false as const,
      originalInsertQualified: false as const,
    });
  }
}
