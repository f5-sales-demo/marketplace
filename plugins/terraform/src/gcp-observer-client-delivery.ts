import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, open, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { decodeEvidenceObject } from './evidence-json';
import {
  assertOriginalGcpObserverClientDeliveryInputs,
  readOriginalGcpObserverClientDeliveryCommand,
} from './gcp-observer-client-delivery-command';
import { assertOriginalVerifiedGcpObserverPeerContext } from './gcp-observer-ssh-peer';
import {
  assertOriginalApplyCallback,
  assertOriginalApplyLifetime,
  type OriginalApplyCallbackContext,
} from './installed-apply-controller';
import type { InstalledCaptureContext } from './installed-capture-context';
import { readOwnedInstalledInput } from './installed-runtime';
import { bindOriginalAccessReaderCapture, openOriginalAccessReaderCapture } from './original-access-reader-source';
import { monitorOriginalInputs, type OriginalInputBinding } from './original-input-monitor';
import {
  type OriginalOutputCompletion,
  readOriginalExecutionChunk,
  readOriginalExecutionCompletion,
} from './original-output-stream';
import {
  type ExecutionCaptureAdmission,
  type FinalExecutionCapture,
  type SignalFreeExecutionPolicy,
  signalFreeGcpObserverClientDeliveryExecutor,
} from './signal-free-executor';

const hash = (raw: Uint8Array) => createHash('sha256').update(raw).digest('hex');
const same = (a: ExecutionCaptureAdmission['identity'], b: ExecutionCaptureAdmission['identity']) =>
  (['pid', 'group', 'start', 'boot'] as const).every((key) => a[key] === b[key]);
export interface GcpObserverInstalledBytes {
  readonly receiptSha256: string;
  readonly instanceId: string;
  readonly nonce: string;
  readonly clientRoot: string;
  readonly bootId: string;
  readonly uid: number;
  readonly pythonPath: string;
  readonly pythonSha256: string;
  readonly archiveSha256: string;
  readonly startedMs: number;
  readonly finishedMs: number;
  readonly originalDeadlineMs: number;
  readonly installedBytesVerified: true;
  readonly abiVerified: false;
  readonly guestClientQualified: false;
}
/** Consistency only. An original command/output issuer is also required. */
export function inspectGcpObserverClientDelivery(
  raw: Uint8Array,
  request: Readonly<Record<string, unknown>>,
): Readonly<GcpObserverInstalledBytes> {
  const value = decodeEvidenceObject(raw);
  const fields = [
    'schemaVersion',
    'kind',
    'instanceId',
    'nonce',
    'uid',
    'bootId',
    'pythonPath',
    'pythonSha256',
    'archiveSha256',
    'clientRoot',
    'startedMs',
    'finishedMs',
    'originalDeadlineMs',
    'installedBytesVerified',
    'abiVerified',
    'guestClientQualified',
  ];
  if (
    Object.keys(value).sort().join(',') !== fields.sort().join(',') ||
    value.schemaVersion !== 1 ||
    value.kind !== 'original-observer-installed-client-bytes' ||
    ['instanceId', 'nonce', 'uid', 'bootId', 'pythonPath', 'pythonSha256', 'archiveSha256'].some(
      (key) => value[key] !== request[key],
    ) ||
    value.clientRoot !== `/home/ubuntu/.local/share/xcsh/gcp-observer-clients/${request.instanceId}` ||
    typeof value.uid !== 'number' ||
    !Number.isSafeInteger(value.uid) ||
    value.uid <= 0 ||
    typeof value.startedMs !== 'number' ||
    !Number.isSafeInteger(value.startedMs) ||
    value.startedMs <= 0 ||
    typeof value.finishedMs !== 'number' ||
    !Number.isSafeInteger(value.finishedMs) ||
    value.finishedMs < value.startedMs ||
    value.finishedMs - value.startedMs > 60000 ||
    value.originalDeadlineMs !== request.guestDeadlineMs ||
    typeof value.originalDeadlineMs !== 'number' ||
    value.finishedMs >= value.originalDeadlineMs ||
    value.installedBytesVerified !== true ||
    value.abiVerified !== false ||
    value.guestClientQualified !== false
  )
    throw new Error('Original observer delivery framing, identity, path or clock differs');
  return Object.freeze({
    receiptSha256: hash(raw),
    instanceId: value.instanceId as string,
    nonce: value.nonce as string,
    clientRoot: value.clientRoot as string,
    bootId: value.bootId as string,
    uid: value.uid,
    pythonPath: value.pythonPath as string,
    pythonSha256: value.pythonSha256 as string,
    archiveSha256: value.archiveSha256 as string,
    startedMs: value.startedMs,
    finishedMs: value.finishedMs,
    originalDeadlineMs: value.originalDeadlineMs,
    installedBytesVerified: true,
    abiVerified: false,
    guestClientQualified: false,
  });
}
export interface OriginalGcpObserverClientInstallation {
  readonly schemaVersion: 1;
  readonly kind: 'original-gcp-observer-client-installation-reference';
}
interface InstallationView {
  readonly context: InstalledCaptureContext;
  readonly installation: Readonly<GcpObserverInstalledBytes>;
  readonly originalProducer: Readonly<ExecutionCaptureAdmission['identity']>;
  readonly originalOutputSha256: string;
  readonly commandsAuthorized: false;
  readonly guestClientQualified: false;
}
const installations = new WeakMap<
  OriginalGcpObserverClientInstallation,
  {
    readonly context: InstalledCaptureContext;
    read(): Promise<Readonly<InstallationView>>;
    close(): void;
  }
>();
function installationOrigin(value: unknown) {
  const origin =
    value && typeof value === 'object' ? installations.get(value as OriginalGcpObserverClientInstallation) : undefined;
  if (!origin) throw new Error('Original observer installation provenance required');
  return origin;
}
/** Historical installation provenance alone grants no command or guest authority. */
export async function readOriginalGcpObserverClientInstallation(value: unknown) {
  return installationOrigin(value).read();
}
export async function assertOriginalGcpObserverClientInstallationContext(
  value: unknown,
  callback: OriginalApplyCallbackContext,
) {
  const origin = installationOrigin(value);
  if (callback.phase === 'after') await assertOriginalApplyCallback(callback);
  else await assertOriginalApplyLifetime(callback);
  if (origin.context !== callback.original)
    throw new Error('Original installation and actual callback context required');
  return origin.read();
}
export function closeOriginalGcpObserverClientInstallation(value: unknown) {
  installationOrigin(value).close();
}
export async function openOriginalGcpObserverClientInstallation(delivery: unknown) {
  const origin =
    delivery && typeof delivery === 'object' ? origins.get(delivery as OriginalGcpObserverClientDelivery) : undefined;
  if (!origin) throw new Error('Original successful observer delivery required');
  return origin.installation();
}
export interface OriginalGcpObserverClientDelivery {
  readonly schemaVersion: 1;
  readonly kind: 'original-gcp-observer-client-delivery-reference';
}
const origins = new WeakMap<
  OriginalGcpObserverClientDelivery,
  {
    readonly command: unknown;
    readonly peer: unknown;
    readonly callback: OriginalApplyCallbackContext;
    read(): Promise<Readonly<GcpObserverInstalledBytes>>;
    installation(): Promise<OriginalGcpObserverClientInstallation>;
  }
>();
export async function readOriginalGcpObserverClientDelivery(value: unknown) {
  const origin =
    value && typeof value === 'object' ? origins.get(value as OriginalGcpObserverClientDelivery) : undefined;
  if (!origin) throw new Error('Original observer client delivery provenance required');
  return origin.read();
}
/** Only the original successful delivery and the same actual callback can
 * hand the verified peer to the independent ABI command. */
export async function assertOriginalGcpObserverClientDeliveryContext(
  value: unknown,
  callback: OriginalApplyCallbackContext,
) {
  const origin =
    value && typeof value === 'object' ? origins.get(value as OriginalGcpObserverClientDelivery) : undefined;
  if (!origin || origin.callback !== callback)
    throw new Error('Original observer delivery and actual callback required');
  const delivery = await origin.read();
  const peer = await assertOriginalVerifiedGcpObserverPeerContext(origin.peer, callback);
  if (peer.peer.instanceId !== delivery.instanceId || peer.peer.clock.bootId !== delivery.bootId)
    throw new Error('Original observer delivery peer identity differs');
  return Object.freeze({ delivery, peer: origin.peer, command: origin.command, callback });
}
/** Real original native SSH execution/output only. No executor or reply override. */
export async function openGcpObserverClientDelivery(command: unknown) {
  const original = await readOriginalGcpObserverClientDeliveryCommand(command);
  const root = join(original.callback.original.executionDirectory, `gcp-observer-client-captures-${randomUUID()}`);
  await mkdir(root, { mode: 0o700 });
  const directory = await lstat(root, { bigint: true });
  const recorder = await openOriginalAccessReaderCapture({
    callback: original.callback,
    family: 'observer',
    role: 'delivery',
    instanceId: String(original.request.instanceId),
    directory: root,
    python: original.python,
    executable: original.executable,
    args: original.args,
    stdin: original.stdin,
  });
  let closed = false,
    used = false,
    producerSeen = false,
    producerClosed = false;
  let pending: Promise<OriginalGcpObserverClientDelivery> | undefined, closing: Promise<void> | undefined;
  const retained: OriginalInputBinding[] = [];
  let retired = false;
  let receipts: Awaited<ReturnType<typeof monitorOriginalInputs>> | undefined;
  const assertRetainedRoot = async () => {
    const current = await lstat(root, { bigint: true });
    if (
      (await realpath(root)) !== root ||
      !current.isDirectory() ||
      (['dev', 'ino', 'uid', 'mode'] as const).some((key) => current[key] !== directory[key])
    )
      throw new Error('Original observer delivery capture directory changed or closed');
  };
  const guard = async () => {
    if (closed) throw new Error('Original observer delivery capture directory changed or closed');
    await assertRetainedRoot();
  };
  const persist = async (name: string, value: Record<string, unknown>) => {
    await guard();
    const file = await open(join(root, name), 'wx', 0o400);
    try {
      await file.writeFile(JSON.stringify(value));
      await file.sync();
    } finally {
      await file.close();
    }
    retained.push((await readOwnedInstalledInput(join(root, name))).binding);
    const parent = await open(root, 'r');
    try {
      await parent.sync();
    } finally {
      await parent.close();
    }
  };
  const run = async (): Promise<OriginalGcpObserverClientDelivery> => {
    await guard();
    let admission: ExecutionCaptureAdmission | undefined,
      capture: FinalExecutionCapture | undefined,
      completion: OriginalOutputCompletion | undefined;
    let stdout = Buffer.alloc(0),
      stderr = Buffer.alloc(0);
    const policy: SignalFreeExecutionPolicy = {
      python: original.python,
      executable: original.executable,
      stdin: original.stdin,
      originalStartMs: original.callback.original.budget.start,
      originalDeadlineMs: original.callback.original.budget.deadline,
      timeoutMs: 60000,
      startupTimeoutMs: 15000,
      maxOutputBytes: 65536,
      assertOriginal: guard,
      assertOriginalIdentity: guard,
      assertFinalInputs: guard,
      beforeRelease: async (value) => {
        await guard();
        if (
          admission ||
          value.directory !== root ||
          JSON.stringify(value.args) !== JSON.stringify(original.args) ||
          value.stdin?.sha256 !== original.stdin.sha256 ||
          value.stdin?.path !== original.stdin.path
        )
          throw new Error('Original observer delivery admission differs');
        admission = value;
        producerSeen = true;
        await recorder.admit(value);
      },
      finalCapture: async (value) => {
        await recorder.capture(value);
        capture = value;
        producerSeen ||= !!value.identity;
        let failure: unknown;
        try {
          if (
            !admission ||
            !value.identity ||
            !same(value.identity, admission.identity) ||
            value.stdoutPath !== admission.stdoutPath ||
            value.stderrPath !== admission.stderrPath ||
            JSON.stringify(value.stdin) !== JSON.stringify(admission.stdin)
          )
            throw new Error('Original observer delivery producer or stdin differs');
          for (const channel of ['stdout', 'stderr'] as const) {
            const parts: Buffer[] = [];
            let offset = 0;
            for (;;) {
              const chunk = await admission.output.read(channel);
              if (!chunk) break;
              const record = readOriginalExecutionChunk(admission.output, chunk, channel);
              if (
                !same(record.identity, admission.identity) ||
                record.directory !== root ||
                record.offset !== offset ||
                record.endOffset !== offset + record.bytes.length ||
                record.endOffset > 65536 ||
                hash(record.bytes) !== record.sha256
              )
                throw new Error('Original observer delivery output chunk differs');
              offset = record.endOffset;
              parts.push(record.bytes);
              if (channel === 'stdout') stdout = Buffer.concat(parts);
              else stderr = Buffer.concat(parts);
            }
          }
          if (!value.originalGroupClosed) throw new Error('Original observer delivery producer closure unresolved');
          completion = await admission.output.finish();
          const issued = readOriginalExecutionCompletion(admission.output, completion);
          if (
            !same(issued.identity, admission.identity) ||
            issued.directory !== root ||
            completion.stdout.bytes !== stdout.length ||
            completion.stderr.bytes !== stderr.length ||
            completion.stdout.sha256 !== hash(stdout) ||
            completion.stderr.sha256 !== hash(stderr)
          )
            throw new Error('Original observer delivery completion differs');
          producerClosed = true;
        } catch (error) {
          failure = error;
        }
        await persist('capture.private.json', {
          schemaVersion: 1,
          kind: 'original-observer-delivery-capture',
          capture: value,
          completion,
          stdoutSha256: hash(stdout),
          stderrSha256: hash(stderr),
          complete: !failure && !!completion,
          guestClientQualified: false,
          ...(failure ? { errorType: failure instanceof Error ? failure.name : typeof failure } : {}),
        });
        if (failure) throw failure;
      },
    };
    try {
      const execute = await signalFreeGcpObserverClientDeliveryExecutor(policy, command);
      await recorder.begin();
      let result: Awaited<ReturnType<typeof execute>>;
      try {
        result = await execute({ cwd: root, args: [...original.args], env: { LC_ALL: 'C' } });
      } finally {
        recorder.finished();
      }
      await assertOriginalGcpObserverClientDeliveryInputs(command);
      if (
        result.code !== 0 ||
        !capture ||
        !completion ||
        !capture.submitted ||
        capture.actualExitCode !== 0 ||
        capture.reason ||
        !producerClosed ||
        capture.finishedMs > original.sourceDeadlineMs
      )
        throw new Error('Original observer delivery not verified; private diagnostics retained');
      const value = inspectGcpObserverClientDelivery(stdout, original.request);
      await persist('proof.private.json', {
        schemaVersion: 1,
        kind: 'original-observer-installed-byte-proof',
        ...value,
        stdoutSha256: hash(stdout),
      });
      const read = async () => {
        if (retired) throw new Error('Original observer delivery reference retired');
        try {
          await guard();
          await assertOriginalGcpObserverClientDeliveryInputs(command);
          const peer = await assertOriginalVerifiedGcpObserverPeerContext(original.peer, original.callback);
          if (peer.peer.instanceId !== value.instanceId || peer.peer.clock.bootId !== value.bootId)
            throw new Error('Original observer delivery peer identity differs');
          await receipts?.assertOriginal();
          return value;
        } catch (error) {
          retired = true;
          receipts?.close();
          throw error;
        }
      };
      receipts = await monitorOriginalInputs(
        Object.fromEntries(retained.map((input, index) => [String(index), input])),
      );
      const ref: OriginalGcpObserverClientDelivery = Object.freeze({
        schemaVersion: 1,
        kind: 'original-gcp-observer-client-delivery-reference',
      });
      if (!admission) throw new Error('Original observer installation producer admission required');
      const installationValue: Readonly<InstallationView> = Object.freeze({
        context: original.callback.original,
        installation: value,
        originalProducer: Object.freeze({ ...admission.identity }),
        originalOutputSha256: completion.stdout.sha256,
        commandsAuthorized: false,
        guestClientQualified: false,
      });
      let installationPending: Promise<OriginalGcpObserverClientInstallation> | undefined;
      const installation = () => {
        if (!installationPending)
          installationPending = (async () => {
            // Mint once while the original native delivery and peer are fresh.
            await read();
            const originalReceipts = Object.fromEntries(retained.map((input, index) => [String(index), input]));
            const monitor = await monitorOriginalInputs(originalReceipts);
            let installationRetired = false;
            const readInstallation = async () => {
              if (installationRetired) throw new Error('Original observer installation reference retired');
              try {
                await assertRetainedRoot();
                await monitor.assertOriginal();
                await assertRetainedRoot();
                return installationValue;
              } catch (error) {
                installationRetired = true;
                monitor.close();
                throw error;
              }
            };
            const installationRef: OriginalGcpObserverClientInstallation = Object.freeze({
              schemaVersion: 1,
              kind: 'original-gcp-observer-client-installation-reference',
            });
            installations.set(installationRef, {
              context: original.callback.original,
              read: readInstallation,
              close: () => {
                installationRetired = true;
                monitor.close();
              },
            });
            try {
              await readInstallation();
            } catch (error) {
              monitor.close();
              throw error;
            }
            return installationRef;
          })();
        return installationPending.then(async (value) => {
          await readOriginalGcpObserverClientInstallation(value);
          return value;
        });
      };
      origins.set(ref, { command, peer: original.peer, callback: original.callback, read, installation });
      await read();
      return ref;
    } catch (error) {
      retired = true;
      receipts?.close();
      try {
        await persist('failure.private.json', {
          schemaVersion: 1,
          errorType: error instanceof Error ? error.name : typeof error,
          complete: false,
          guestClientQualified: false,
        });
      } catch (retention) {
        throw new AggregateError([error, retention], 'Original observer delivery failure retention unresolved');
      }
      throw error;
    }
  };
  const port = Object.freeze({
    deliver(): Promise<OriginalGcpObserverClientDelivery> {
      if (closed || used) return Promise.reject(new Error('Original observer delivery is closed or single-use'));
      used = true;
      pending = run();
      return pending;
    },
    close(): Promise<void> {
      if (!closing)
        closing = (async () => {
          if (pending) await pending.catch(() => undefined);
          retired = true;
          receipts?.close();
          await guard();
          try {
            await lstat(join(root, '.terraform-executor-lock'));
            throw new Error('Original observer delivery lock unresolved; retained');
          } catch (error) {
            if (!(error instanceof Error) || (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          }
          if (producerSeen && !producerClosed)
            throw new Error('Original observer delivery producer closure unresolved');
          closed = true;
        })();
      return closing;
    },
  });
  bindOriginalAccessReaderCapture(port, recorder);
  return port;
}
