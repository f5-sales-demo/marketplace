import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import type { CeDeploymentStore } from './deployment-store';
import { decodeEvidenceObject } from './evidence-json';
import type { CeOwner } from './runtime';

const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
type Identity = Readonly<Record<string, string>>;
function currentUid() {
  const uid = process.getuid?.();
  if (uid === undefined) throw new Error('Owned Platform capture requires a supported host');
  return BigInt(uid);
}
const fileKeys = ['dev', 'ino', 'uid', 'mode', 'nlink', 'size', 'mtimeNs', 'ctimeNs'] as const;
async function file(path: string) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const first = await handle.stat({ bigint: true });
    if (
      first.size > 32n * 1024n * 1024n ||
      !first.isFile() ||
      first.uid !== currentUid() ||
      first.nlink !== 1n ||
      (first.mode & 0o077n) !== 0n
    )
      throw new Error('Original private Platform capture file required');
    const bytes = await handle.readFile();
    const second = await handle.stat({ bigint: true }),
      linked = await lstat(path, { bigint: true });
    const identity = Object.fromEntries(fileKeys.map((key) => [key, first[key].toString()]));
    if (fileKeys.some((key) => first[key] !== second[key] || first[key] !== linked[key]))
      throw new Error('Original Platform capture file changed during read');
    return { bytes, identity, sha256: hash(bytes) };
  } finally {
    await handle.close();
  }
}
async function directory(path: string): Promise<Identity> {
  const value = await lstat(path, { bigint: true });
  if (
    !value.isDirectory() ||
    value.isSymbolicLink() ||
    value.uid !== currentUid() ||
    (value.mode & 0o077n) !== 0n ||
    (await realpath(path)) !== path
  )
    throw new Error('Original private Platform capture directory required');
  return Object.freeze(
    Object.fromEntries(
      ['dev', 'ino', 'uid', 'mode'].map((key) => [key, value[key as 'dev' | 'ino' | 'uid' | 'mode'].toString()]),
    ),
  );
}
export interface GcpPlatformHttpRequest {
  readonly origin: string;
  readonly path: string;
  readonly method: 'GET' | 'POST' | 'DELETE';
  readonly credentialSha256: string;
  readonly requestBodySha256: string | null;
}
export interface GcpPlatformHttpOutcome {
  readonly status: number | null;
  readonly responseComplete: boolean;
  readonly accepted: boolean;
  readonly truncated: boolean;
  readonly error?: unknown;
}
export interface GcpPlatformHttpEvidence extends GcpPlatformHttpRequest {
  readonly schemaVersion: 1;
  readonly kind: 'original-gcp-platform-http-evidence';
  readonly captureId: string;
  readonly owner: Readonly<CeOwner>;
  readonly bodyPath: string;
  readonly metadataPath: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly status: number | null;
  readonly responseComplete: boolean;
  readonly accepted: boolean;
  readonly truncated: boolean;
  readonly bodySha256: string;
  readonly bytesCaptured: number;
  readonly errorType: string | null;
  readonly bootstrapOwnershipQualified: false;
}
export interface OriginalGcpPlatformHttpBody {
  readonly evidence: GcpPlatformHttpEvidence;
  readonly bytes: Buffer;
}
const bodies = new WeakMap<OriginalGcpPlatformHttpBody, { sha256: string; assertOriginal: () => Promise<void> }>();
export async function assertOriginalGcpPlatformHttpBody(value: OriginalGcpPlatformHttpBody) {
  const issued = bodies.get(value);
  if (!issued || hash(value.bytes) !== issued.sha256) throw new Error('Original GCP Platform HTTP body required');
  await issued.assertOriginal();
}
export interface GcpPlatformHttpCaptureSession {
  append(bytes: Uint8Array): Promise<void>;
  finish(outcome: GcpPlatformHttpOutcome): Promise<GcpPlatformHttpEvidence>;
}
export interface GcpPlatformHttpScope {
  readonly siteNames: readonly string[];
  readonly tokenNames: readonly string[];
}
export interface GcpLifecycleHttpCapture {
  assertOriginal(): Promise<void>;
  begin(request: GcpPlatformHttpRequest, body?: string): Promise<GcpPlatformHttpCaptureSession>;
  records(): readonly GcpPlatformHttpEvidence[];
  read(reference: GcpPlatformHttpEvidence): Promise<OriginalGcpPlatformHttpBody>;
  bindResponse(value: Record<string, unknown>, reference: GcpPlatformHttpEvidence): Promise<void>;
  evidenceFor(value: Record<string, unknown>): GcpPlatformHttpEvidence;
}
interface Binding {
  body: Awaited<ReturnType<typeof file>>;
  metadata: Awaited<ReturnType<typeof file>>;
}
/** Compiled controller only. Shared Platform owner storage holds raw private bytes;
 * source references are issued by this exact recorder and cannot be deserialized.
 */
export async function openGcpLifecycleHttpCapture(
  store: CeDeploymentStore,
  assertInputs: () => Promise<void>,
  scope: GcpPlatformHttpScope,
): Promise<GcpLifecycleHttpCapture> {
  if (
    store.owner.provider !== 'gcp' ||
    !['native', 'terraform'].includes(store.owner.engine) ||
    typeof assertInputs !== 'function'
  )
    throw new Error('Original GCP Platform capture admission required');
  if (
    !scope ||
    !Array.isArray(scope.siteNames) ||
    !Array.isArray(scope.tokenNames) ||
    (!scope.siteNames.length && !scope.tokenNames.length) ||
    [scope.siteNames, scope.tokenNames].some(
      (names) =>
        new Set(names).size !== names.length ||
        names.some((name) => typeof name !== 'string' || !/^[a-z][a-z0-9-]{0,62}$/.test(name)),
    )
  )
    throw new Error('Original explicit Platform site/token scope required');
  const selectedSites = Object.freeze([...scope.siteNames]),
    selectedTokens = Object.freeze([...scope.tokenNames]);
  const owner = Object.freeze(structuredClone(store.owner));
  await store.verify();
  await assertInputs();
  const originalDirectory = await directory(store.directory),
    originalOwner = await file(join(store.directory, 'owner.json'));
  const captureId = randomUUID();
  const references: GcpPlatformHttpEvidence[] = [];
  const bindings = new WeakMap<GcpPlatformHttpEvidence, Binding>();
  const responses = new WeakMap<Record<string, unknown>, { reference: GcpPlatformHttpEvidence; valueSha256: string }>();
  const assertStorage = async () => {
    if (JSON.stringify(await directory(store.directory)) !== JSON.stringify(originalDirectory))
      throw new Error('Original Platform capture directory changed');
    await store.verify();
    const current = await file(join(store.directory, 'owner.json'));
    if (
      JSON.stringify(current.identity) !== JSON.stringify(originalOwner.identity) ||
      current.sha256 !== originalOwner.sha256 ||
      JSON.stringify(store.owner) !== JSON.stringify(owner)
    )
      throw new Error('Original Platform capture ownership changed');
  };
  const assertOriginal = async () => {
    await assertStorage();
    await assertInputs();
    await assertStorage();
  };
  const readBound = async (reference: GcpPlatformHttpEvidence) => {
    const expected = bindings.get(reference);
    if (!expected) throw new Error('Original GCP Platform HTTP evidence required');
    await assertOriginal();
    const raw = await file(reference.bodyPath),
      metadata = await file(reference.metadataPath);
    if (
      JSON.stringify(raw.identity) !== JSON.stringify(expected.body.identity) ||
      raw.sha256 !== expected.body.sha256 ||
      JSON.stringify(metadata.identity) !== JSON.stringify(expected.metadata.identity) ||
      metadata.sha256 !== expected.metadata.sha256 ||
      raw.sha256 !== reference.bodySha256
    )
      throw new Error('Original Platform HTTP capture bytes or identity changed');
    await assertOriginal();
    return raw.bytes;
  };
  const api: GcpLifecycleHttpCapture = {
    assertOriginal,
    records: () => Object.freeze([...references]),
    async read(reference) {
      const bytes = Buffer.from(await readBound(reference));
      const value = Object.freeze({ evidence: reference, bytes });
      bodies.set(value, {
        sha256: reference.bodySha256,
        assertOriginal: async () => {
          await readBound(reference);
        },
      });
      return value;
    },
    async bindResponse(value, reference) {
      if (
        !reference.accepted ||
        !reference.responseComplete ||
        reference.status === null ||
        reference.status < 200 ||
        reference.status >= 300
      )
        throw new Error('Original accepted Platform response required');
      const raw = await readBound(reference);
      let parsed: unknown;
      try {
        parsed = raw.length ? decodeEvidenceObject(raw) : {};
      } catch {
        throw new Error('Original Platform response JSON required');
      }
      if (JSON.stringify(parsed) !== JSON.stringify(value)) throw new Error('Original Platform response value differs');
      responses.set(value, { reference, valueSha256: hash(Buffer.from(JSON.stringify(value))) });
    },
    evidenceFor(value) {
      const issued = responses.get(value);
      if (!issued || hash(Buffer.from(JSON.stringify(value))) !== issued.valueSha256)
        throw new Error('Original Platform response value required');
      return issued.reference;
    },
    async begin(request, requestBody) {
      const url = new URL(request.origin);
      if (
        url.protocol !== 'https:' ||
        url.origin !== request.origin ||
        url.username ||
        url.password ||
        !/^\/api\/(?:config|register)\/namespaces\/system\/(?:securemesh_site_v2s|tokens)(?:\/[a-z][a-z0-9-]{0,62})?$/.test(
          request.path,
        ) ||
        !['GET', 'POST', 'DELETE'].includes(request.method) ||
        !/^[a-f0-9]{64}$/.test(request.credentialSha256) ||
        (request.requestBodySha256 !== null && !/^[a-f0-9]{64}$/.test(request.requestBodySha256))
      )
        throw new Error('Original scoped Platform HTTP request required');
      if ((requestBody === undefined ? null : hash(Buffer.from(requestBody))) !== request.requestBodySha256)
        throw new Error('Original Platform request body differs');
      const selected = /\/(securemesh_site_v2s|tokens)(?:\/([a-z][a-z0-9-]{0,62}))?$/.exec(request.path);
      if (!selected) throw new Error('Original Platform capture path escaped scope');
      const names = selected[1] === 'tokens' ? selectedTokens : selectedSites;
      let requestedName: unknown = selected[2];
      if (request.method === 'POST') {
        if (requestedName || requestBody === undefined) throw new Error('Original Platform create escaped scope');
        const value = decodeEvidenceObject(Buffer.from(requestBody)),
          metadata = value.metadata;
        requestedName =
          metadata && typeof metadata === 'object' && !Array.isArray(metadata)
            ? (metadata as Record<string, unknown>).name
            : undefined;
      }
      if (typeof requestedName !== 'string' || !names.includes(requestedName))
        throw new Error('Original Platform request escaped selected site/token scope');
      await assertOriginal();
      const id = randomUUID(),
        bodyPath = join(store.directory, `gcp-http-${id}.body.private.bin`),
        metadataName = `gcp-http-${id}.capture.private.json`,
        metadataPath = join(store.directory, metadataName);
      const startedAt = new Date().toISOString(),
        boundRequest = Object.freeze({ ...request });
      const handle = await open(
        bodyPath,
        constants.O_CREAT | constants.O_EXCL | constants.O_RDWR | constants.O_NOFOLLOW,
        0o600,
      );
      const initial = await handle.stat({ bigint: true });
      let finished = false;
      const assertWriter = async () => {
        await assertStorage();
        const current = await handle.stat({ bigint: true }),
          linked = await lstat(bodyPath, { bigint: true });
        if (
          !current.isFile() ||
          current.nlink !== 1n ||
          current.uid !== initial.uid ||
          current.ino !== initial.ino ||
          current.dev !== initial.dev ||
          current.ino !== linked.ino ||
          current.dev !== linked.dev
        )
          throw new Error('Original Platform capture writer changed');
      };
      try {
        await handle.sync();
        await store.write(metadataName, {
          schemaVersion: 1,
          kind: 'partial-gcp-platform-http-capture',
          captureId,
          request: boundRequest,
          owner,
          bodyPath,
          bodyIdentity: Object.fromEntries(
            ['dev', 'ino', 'uid', 'mode', 'nlink'].map((key) => [
              key,
              initial[key as 'dev' | 'ino' | 'uid' | 'mode' | 'nlink'].toString(),
            ]),
          ),
          directoryIdentity: originalDirectory,
          ownerFileSha256: originalOwner.sha256,
          creatorPid: process.pid,
          startedAt,
          state: 'capturing',
          responseComplete: false,
          accepted: false,
          bootstrapOwnershipQualified: false,
        });
      } catch (error) {
        await handle.close();
        throw error;
      }
      return {
        async append(bytes) {
          if (finished) throw new Error('Original Platform HTTP capture already sealed');
          await assertWriter();
          const copy = Buffer.from(bytes);
          if ((await handle.stat()).size + copy.length > 16 * 1024 * 1024)
            throw new Error('Original Platform capture exceeds its bounded body');
          let offset = 0;
          while (offset < copy.length) {
            const { bytesWritten } = await handle.write(copy, offset, copy.length - offset, null);
            if (!bytesWritten) throw new Error('Original Platform capture write incomplete');
            offset += bytesWritten;
          }
          await handle.sync();
          await assertWriter();
        },
        async finish(outcome) {
          if (finished) throw new Error('Original Platform HTTP capture already sealed');
          finished = true;
          try {
            if (outcome.accepted && !outcome.responseComplete)
              throw new Error('Original accepted Platform capture requires complete transport');
            await assertWriter();
            await handle.sync();
            await handle.chmod(0o400);
            const stat = await handle.stat();
            if (stat.size > 16 * 1024 * 1024) throw new Error('Original Platform capture exceeds its bounded body');
            const bytes = Buffer.alloc(stat.size);
            let offset = 0;
            while (offset < bytes.length) {
              const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset);
              if (!bytesRead) throw new Error('Original Platform capture read incomplete');
              offset += bytesRead;
            }
            const reference: GcpPlatformHttpEvidence = Object.freeze({
              ...boundRequest,
              schemaVersion: 1,
              kind: 'original-gcp-platform-http-evidence',
              captureId,
              owner,
              bodyPath,
              metadataPath,
              startedAt,
              finishedAt: new Date().toISOString(),
              status: outcome.status,
              responseComplete: outcome.responseComplete,
              accepted: outcome.accepted,
              truncated: outcome.truncated,
              bodySha256: hash(bytes),
              bytesCaptured: bytes.length,
              errorType:
                outcome.error instanceof Error
                  ? outcome.error.name
                  : Object.hasOwn(outcome, 'error')
                    ? typeof outcome.error
                    : null,
              bootstrapOwnershipQualified: false,
            });
            await assertStorage();
            await store.write(metadataName, {
              ...reference,
              state: 'sealed',
              error:
                outcome.error instanceof Error
                  ? { name: outcome.error.name, message: outcome.error.message, stack: outcome.error.stack }
                  : undefined,
            });
            const body = await file(bodyPath),
              metadata = await file(metadataPath);
            await assertStorage();
            if (body.sha256 !== reference.bodySha256) throw new Error('Original Platform capture body differs');
            bindings.set(reference, { body, metadata });
            references.push(reference);
            return reference;
          } finally {
            await handle.close();
          }
        },
      };
    },
  };
  return api;
}
