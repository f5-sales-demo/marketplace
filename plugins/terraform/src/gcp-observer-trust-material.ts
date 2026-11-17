import { createHash } from 'node:crypto';
import {
  assertOriginalGcpObserverVmCaptureCallback,
  readOriginalGcpObserverSerialSource,
} from './gcp-observer-insert-evidence';
import { assertOriginalGcpObserverWireKeysOrigin } from './gcp-observer-wire-key-reader';
import type { OriginalApplyCallbackContext } from './installed-apply-controller';

const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
export interface OriginalGcpObserverTrustMaterial {
  readonly schemaVersion: 1;
  readonly kind: 'original-gcp-observer-trust-material-reference';
}
interface TrustContext {
  readonly campaign: string;
  readonly nodeName: string;
  readonly instanceId: string;
  readonly ownershipSha256: string;
  readonly address: string;
}
interface TrustMaterial {
  readonly serial: Buffer;
  readonly wire: Buffer;
  readonly expected: Readonly<TrustContext>;
  readonly receipt: Readonly<
    TrustContext & {
      readonly transport: 'gcp-original-bound-serial-port-1';
      readonly startedAtEpoch: number;
      readonly finishedAtEpoch: number;
      readonly exitCode: 0;
      readonly truncated: false;
      readonly retainedBytes: number;
      readonly sha256: string;
    }
  >;
  readonly sources: Readonly<{
    serialSha256: string;
    serialContentsSha256: string;
    wireStdoutSha256: string;
    wireStartedAt: number;
    wireFinishedAt: number;
  }>;
  readonly parserQualified: false;
}
const origins = new WeakMap<
  OriginalGcpObserverTrustMaterial,
  {
    readonly callback: OriginalApplyCallbackContext;
    read(): Promise<Readonly<TrustMaterial>>;
  }
>();
export async function readOriginalGcpObserverTrustMaterial(value: unknown) {
  const origin =
    value && typeof value === 'object' ? origins.get(value as OriginalGcpObserverTrustMaterial) : undefined;
  if (!origin) throw new Error('Original observer serial/wire material required');
  return origin.read();
}
export async function assertOriginalGcpObserverTrustMaterialContext(
  value: unknown,
  callback: OriginalApplyCallbackContext,
) {
  const origin =
    value && typeof value === 'object' ? origins.get(value as OriginalGcpObserverTrustMaterial) : undefined;
  if (!origin || origin.callback !== callback)
    throw new Error('Original material and actual capture callback required');
  return origin.read();
}
/** Derive parser inputs from actual issued records, never caller-created receipts.
 * This binds provenance but grants no trust until the supported parser completes. */
export async function compileOriginalGcpObserverTrustMaterial(
  vm: unknown,
  serial: unknown,
  keys: unknown,
  callback: OriginalApplyCallbackContext,
): Promise<OriginalGcpObserverTrustMaterial> {
  const collect = async (): Promise<Readonly<TrustMaterial>> => {
    const original = await assertOriginalGcpObserverVmCaptureCallback(vm, callback);
    const wire = await assertOriginalGcpObserverWireKeysOrigin(keys, vm, callback);
    const source = await readOriginalGcpObserverSerialSource(vm, serial);
    const bytes = Buffer.from(source.contents);
    if (
      source.project !== original.project ||
      source.zone !== original.zone ||
      source.nodeName !== original.name ||
      source.instanceId !== original.instanceId ||
      source.start !== '0' ||
      BigInt(source.next) !== BigInt(bytes.length) ||
      !bytes.length ||
      bytes.length > 4 * 1024 * 1024 ||
      source.contentsSha256 !== hash(bytes) ||
      wire.project !== original.project ||
      wire.zone !== original.zone ||
      wire.nodeName !== original.name ||
      wire.instanceId !== original.instanceId ||
      wire.address !== original.externalAddress ||
      callback.original.owner.provider !== 'gcp' ||
      callback.original.owner.engine !== 'terraform' ||
      callback.original.owner.account !== original.project
    )
      throw new Error('Original complete observer serial/wire/owner join differs');
    const expected: Readonly<TrustContext> = Object.freeze({
      campaign: callback.original.owner.deploymentId,
      nodeName: original.name,
      instanceId: original.instanceId,
      address: original.externalAddress,
      ownershipSha256: hash(
        Buffer.from(
          JSON.stringify({
            owner: callback.original.owner,
            callbackNonce: callback.nonce,
            original,
          }),
        ),
      ),
    });
    return Object.freeze({
      serial: bytes,
      wire: Buffer.from(`${wire.knownHostsLine}\n`),
      expected,
      receipt: Object.freeze({
        ...expected,
        transport: 'gcp-original-bound-serial-port-1',
        startedAtEpoch: source.startedAt / 1000,
        finishedAtEpoch: source.finishedAt / 1000,
        exitCode: 0,
        truncated: false,
        retainedBytes: bytes.length,
        sha256: source.contentsSha256,
      }),
      sources: Object.freeze({
        serialSha256: source.sourceSha256,
        serialContentsSha256: source.contentsSha256,
        wireStdoutSha256: wire.stdoutSha256,
        wireStartedAt: wire.startedAt,
        wireFinishedAt: wire.finishedAt,
      }),
      parserQualified: false,
    });
  };
  const original = await collect();
  const manifest = JSON.stringify({
    expected: original.expected,
    receipt: original.receipt,
    sources: original.sources,
  });
  let retired = false;
  const read = async () => {
    if (retired) throw new Error('Original observer trust material retired');
    try {
      const current = await collect();
      if (
        JSON.stringify({ expected: current.expected, receipt: current.receipt, sources: current.sources }) !==
          manifest ||
        !current.serial.equals(original.serial) ||
        !current.wire.equals(original.wire)
      )
        throw new Error('Original observer trust material source changed');
      return Object.freeze({ ...original, serial: Buffer.from(original.serial), wire: Buffer.from(original.wire) });
    } catch (error) {
      retired = true;
      throw error;
    }
  };
  const reference: OriginalGcpObserverTrustMaterial = Object.freeze({
    schemaVersion: 1,
    kind: 'original-gcp-observer-trust-material-reference',
  });
  origins.set(reference, { read, callback });
  await read();
  return reference;
}
