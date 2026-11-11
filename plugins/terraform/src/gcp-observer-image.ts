import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, open, realpath } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { decodeEvidenceObject } from './evidence-json';
import { isEvidenceRfc3339 } from './evidence-rfc3339';
import { GCP_OBSERVER_IMAGE_PIN } from './gcp-observer-image-pin';
import {
  type GoogleAdcAuthenticationRequest,
  type GoogleComputeRead,
  GoogleComputeReadError,
  openGoogleAdcComputeReader,
} from './google-adc-authentication';
import { readOwnedInstalledInput } from './installed-runtime';
import { assertSameOriginalInput, type OriginalInputBinding } from './original-input-monitor';

const hash = (raw: Uint8Array) => createHash('sha256').update(raw).digest('hex');
const fileKeys = ['dev', 'ino', 'uid', 'nlink', 'mode', 'size', 'mtimeNs', 'ctimeNs'] as const;
export interface OriginalGcpObserverImageEvidence {
  readonly schemaVersion: 1;
  readonly kind: 'original-gcp-observer-image-candidate';
  readonly path: string;
  readonly sha256: string;
  readonly startedAt: number;
  readonly finishedAt: number;
  readonly owningProject: string;
  readonly imageProject: 'ubuntu-os-cloud';
  readonly imageId: '4996011480491275419';
  readonly imageName: string;
  readonly selfLink: string;
  readonly creationTimestamp: string;
  readonly accountSha256: string;
  readonly audienceSha256: string;
  readonly snapshotSha256: string;
  readonly observerExecutionAuthorized: false;
}
export interface GcpObserverImageReaderOptions {
  readonly root: string;
  readonly authentication: GoogleAdcAuthenticationRequest;
}
/** Original fixed image read only. Observer insert/disk/SSH joins and reviewed execution remain separate gates. */
export async function openGcpObserverImageReader(
  input: GcpObserverImageReaderOptions,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
) {
  const root = input.root;
  const authentication = Object.freeze({
    ...input.authentication,
    credentialBytes: Buffer.from(input.authentication.credentialBytes),
  });
  if (!isAbsolute(root) || resolve(root) !== root)
    throw new Error('Canonical private observer image directory required');
  await mkdir(root, { recursive: true, mode: 0o700 });
  const originalRoot = await lstat(root, { bigint: true });
  if (
    !originalRoot.isDirectory() ||
    originalRoot.isSymbolicLink() ||
    originalRoot.uid !== BigInt(process.getuid?.() ?? -1) ||
    (originalRoot.mode & 0o777n) !== 0o700n ||
    (await realpath(root)) !== root
  )
    throw new Error('Owned private observer image directory required');
  const assertRoot = async () => {
    const current = await lstat(root, { bigint: true });
    if (
      ['dev', 'ino', 'uid', 'mode'].some(
        (key) => current[key as keyof typeof current] !== originalRoot[key as keyof typeof originalRoot],
      ) ||
      !current.isDirectory() ||
      current.isSymbolicLink() ||
      (await realpath(root)) !== root
    )
      throw new Error('original observer image directory changed');
  };
  const assertOriginal = async () => {
    await assertRoot();
    try {
      await authentication.assertOriginal();
    } catch (error) {
      throw new Error('original observer image inputs changed', { cause: error });
    }
    await assertRoot();
  };
  const client = await openGoogleAdcComputeReader({ ...authentication, assertOriginal }, signal, fetcher);
  const issued = new WeakMap<
    OriginalGcpObserverImageEvidence,
    { body: OriginalInputBinding; receipt: OriginalInputBinding }
  >();
  const retained: Array<Readonly<Record<string, unknown>>> = [];
  let retired = false;
  let originalCreationTimestamp: string | undefined;
  // Retention uses only the original owned directory. A denied cloud/input guard
  // cannot authorize another read, but must not erase bytes already captured.
  const persist = async (path: string, raw: Uint8Array): Promise<OriginalInputBinding> => {
    await assertRoot();
    const handle = await open(path, 'wx', 0o400);
    try {
      await handle.writeFile(raw);
      await handle.sync();
      const file = await handle.stat({ bigint: true });
      return Object.freeze({
        path,
        sha256: hash(raw),
        expectedIdentity: Object.freeze(
          Object.fromEntries(fileKeys.map((key) => [key, String(file[key])])),
        ) as OriginalInputBinding['expectedIdentity'],
        expectedParentIdentity: Object.freeze({
          dev: String(originalRoot.dev),
          ino: String(originalRoot.ino),
          uid: String(originalRoot.uid),
          mode: String(originalRoot.mode),
        }),
      });
    } finally {
      await handle.close();
    }
  };
  const retain = async (capture: GoogleComputeRead) => {
    const path = join(root, `observer-image-${randomUUID()}`);
    const body = await persist(`${path}.body.private.bin`, capture.raw);
    const value = Object.freeze({
      schemaVersion: 1,
      kind: 'original-gcp-observer-image-read',
      owningProject: authentication.project,
      imageProject: GCP_OBSERVER_IMAGE_PIN.project,
      imageName: GCP_OBSERVER_IMAGE_PIN.name,
      path: body.path,
      sha256: body.sha256,
      startedAt: capture.startedAt,
      finishedAt: capture.finishedAt,
      status: capture.status,
      complete: capture.complete,
      truncated: capture.truncated,
      accountSha256: authentication.accountSha256,
      audienceSha256: authentication.audienceSha256,
      snapshotSha256: hash(authentication.credentialBytes),
      observerExecutionAuthorized: false,
    });
    const receipt = await persist(`${path}.receipt.private.json`, Buffer.from(JSON.stringify(value)));
    const directory = await open(root, 'r');
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
    await assertRoot();
    retained.push(value);
    return { body, receipt, value };
  };
  const withinFreshness = (record: { startedAt: number; finishedAt: number }) => {
    const now = Date.now();
    if (
      !Number.isSafeInteger(record.startedAt) ||
      !Number.isSafeInteger(record.finishedAt) ||
      record.startedAt < 0 ||
      record.finishedAt < record.startedAt ||
      record.finishedAt - record.startedAt > 60000 ||
      now < record.finishedAt ||
      now - record.finishedAt > 300000
    )
      throw new Error('original observer image freshness required');
  };
  const verifyFiles = async (bindings: { body: OriginalInputBinding; receipt: OriginalInputBinding }) => {
    await assertOriginal();
    const body = await readOwnedInstalledInput(bindings.body.path, 4 * 1024 * 1024);
    const receipt = await readOwnedInstalledInput(bindings.receipt.path, 65536);
    assertSameOriginalInput(bindings.body, body.binding);
    assertSameOriginalInput(bindings.receipt, receipt.binding);
    await assertOriginal();
    const finalBody = await readOwnedInstalledInput(bindings.body.path, 4 * 1024 * 1024);
    const finalReceipt = await readOwnedInstalledInput(bindings.receipt.path, 65536);
    assertSameOriginalInput(bindings.body, finalBody.binding);
    assertSameOriginalInput(bindings.receipt, finalReceipt.binding);
    await assertRoot();
    return Buffer.from(body.bytes);
  };
  return Object.freeze({
    async read(): Promise<OriginalGcpObserverImageEvidence> {
      if (retired) throw new Error('original observer image reader retired');
      try {
        await assertOriginal();
        let capture: GoogleComputeRead;
        try {
          capture = await client.observerImage();
        } catch (error) {
          if (error instanceof GoogleComputeReadError) {
            try {
              await retain(error.capture);
            } catch (retention) {
              throw new AggregateError([error, retention], 'original observer image capture and retention failed');
            }
          }
          throw error;
        }
        const saved = await retain(capture);
        if (capture.status !== 200 || !capture.complete || capture.truncated)
          throw new Error('complete original observer image response required');
        withinFreshness(capture);
        const value = decodeEvidenceObject(capture.raw);
        if (
          value.kind !== 'compute#image' ||
          value.id !== GCP_OBSERVER_IMAGE_PIN.id ||
          value.name !== GCP_OBSERVER_IMAGE_PIN.name ||
          value.selfLink !== GCP_OBSERVER_IMAGE_PIN.selfLink ||
          value.architecture !== GCP_OBSERVER_IMAGE_PIN.architecture ||
          value.status !== GCP_OBSERVER_IMAGE_PIN.status ||
          !isEvidenceRfc3339(value.creationTimestamp) ||
          Date.parse(value.creationTimestamp) > capture.finishedAt ||
          (originalCreationTimestamp !== undefined && originalCreationTimestamp !== value.creationTimestamp)
        )
          throw new Error('original observer image numeric identity, namespace or creation differs');
        await verifyFiles(saved);
        withinFreshness(capture);
        originalCreationTimestamp ??= value.creationTimestamp;
        const record: OriginalGcpObserverImageEvidence = Object.freeze({
          schemaVersion: 1,
          kind: 'original-gcp-observer-image-candidate',
          path: saved.body.path,
          sha256: saved.body.sha256,
          startedAt: capture.startedAt,
          finishedAt: capture.finishedAt,
          owningProject: authentication.project,
          imageProject: GCP_OBSERVER_IMAGE_PIN.project,
          imageId: GCP_OBSERVER_IMAGE_PIN.id,
          imageName: GCP_OBSERVER_IMAGE_PIN.name,
          selfLink: GCP_OBSERVER_IMAGE_PIN.selfLink,
          creationTimestamp: value.creationTimestamp,
          accountSha256: authentication.accountSha256,
          audienceSha256: authentication.audienceSha256,
          snapshotSha256: hash(authentication.credentialBytes),
          observerExecutionAuthorized: false,
        });
        issued.set(record, saved);
        return record;
      } catch (error) {
        retired = true;
        throw error;
      }
    },
    async readEvidence(record: OriginalGcpObserverImageEvidence) {
      const bindings = issued.get(record);
      if (!bindings) throw new Error('original reader-issued observer image evidence required');
      if (retired) throw new Error('original observer image reader retired');
      try {
        withinFreshness(record);
        const raw = await verifyFiles(bindings);
        withinFreshness(record);
        if (hash(raw) !== record.sha256) throw new Error('original observer image input bytes differ');
        return raw;
      } catch (error) {
        retired = true;
        throw error;
      }
    },
    captures: () => Object.freeze([...retained]),
  });
}
