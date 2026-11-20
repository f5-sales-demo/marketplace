import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, open, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { decodeEvidenceObject } from './evidence-json';
import {
  assertOriginalGcpObserverClientAbiRenewalInputs,
  readOriginalGcpObserverClientAbiRenewalCommand,
} from './gcp-observer-client-abi-renewal-command';
import { assertOriginalGcpObserverClientInstallationContext } from './gcp-observer-client-delivery';
import { type GcpObserverGuestProcess, inspectGcpObserverGuestProcess } from './gcp-observer-guest-process';
import { assertOriginalVerifiedGcpObserverPeerContext } from './gcp-observer-ssh-peer';
import pins from './gcp-ssh-client-pins.json';
import type { OriginalApplyCallbackContext } from './installed-apply-controller';
import { readOwnedInstalledInput } from './installed-runtime';
import { linuxMonotonicMs } from './linux-clock';
import { monitorOriginalInputs, type OriginalInputBinding } from './original-input-monitor';
import {
  type OriginalOutputCompletion,
  readOriginalExecutionChunk,
  readOriginalExecutionCompletion,
  readOriginalExecutionPrefix,
} from './original-output-stream';
import {
  type ExecutionCaptureAdmission,
  type FinalExecutionCapture,
  type SignalFreeExecutionPolicy,
  signalFreeGcpObserverClientAbiRenewalExecutor,
} from './signal-free-executor';

const hash = (raw: Uint8Array) => createHash('sha256').update(raw).digest('hex');
const same = (a: ExecutionCaptureAdmission['identity'], b: ExecutionCaptureAdmission['identity']) =>
  (['pid', 'group', 'start', 'boot'] as const).every((key) => a[key] === b[key]);
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value);
const requestFields = [
  'instanceId',
  'nonce',
  'uid',
  'bootId',
  'pythonPath',
  'pythonSha256',
  'archiveSha256',
  'installationNonce',
  'installationReceiptSha256',
  'installationFinishedMs',
  'peerChallenge',
  'peerMonotonicMs',
] as const;
const mappings = [
  { client: 'ssh', args: ['-V'], exitCode: 0, marker: 'OpenSSH_10.6p2,' },
  { client: 'ssh-keyscan', args: [], exitCode: 1, marker: 'usage: ssh-keyscan' },
  {
    client: 'ssh-keygen',
    args: ['-l', '-f', '/dev/null'],
    exitCode: 255,
    marker: '/dev/null is not a public key file.',
  },
] as const;
export interface GcpObserverClientAbiRenewalEvidence {
  readonly instanceId: string;
  readonly nonce: string;
  readonly uid: number;
  readonly bootId: string;
  readonly pythonPath: string;
  readonly pythonSha256: string;
  readonly archiveSha256: string;
  readonly clientRoot: string;
  readonly installationNonce: string;
  readonly installationReceiptSha256: string;
  readonly installationFinishedMs: number;
  readonly peerChallenge: string;
  readonly peerMonotonicMs: number;
  readonly startedMs: number;
  readonly finishedMs: number;
  readonly originalDeadlineMs: number;
  readonly receiptSha256: string;
  readonly processes: readonly Readonly<GcpObserverGuestProcess>[];
  readonly abiVerified: true;
  readonly installationReplayed: false;
  readonly guestClientQualified: false;
}
export interface QualifiedGcpObserverRenewalClients
  extends Omit<GcpObserverClientAbiRenewalEvidence, 'guestClientQualified'> {
  readonly guestClientQualified: true;
  readonly cloudOperationalQualified: false;
}
/** Consistency only. Original native output is required to issue client provenance. */
export function inspectGcpObserverClientAbiRenewal(raw: Uint8Array, request: Readonly<Record<string, unknown>>) {
  if (raw.length > 65536) throw new Error('Original ABI renewal proof exceeds bound');
  const value = decodeEvidenceObject(raw);
  const fields = [
    'schemaVersion',
    'kind',
    ...requestFields,
    'clientRoot',
    'startedMs',
    'finishedMs',
    'originalDeadlineMs',
    'processes',
    'abiVerified',
    'guestClientQualified',
    'installationReplayed',
  ];
  if (
    Object.keys(value).sort().join(',') !== fields.sort().join(',') ||
    value.schemaVersion !== 2 ||
    value.kind !== 'original-observer-client-abi-renewal-proof' ||
    requestFields.some((key) => value[key] !== request[key]) ||
    value.clientRoot !== `/home/ubuntu/.local/share/xcsh/gcp-observer-clients/${request.instanceId}` ||
    value.archiveSha256 !== pins.archiveSha256 ||
    value.abiVerified !== true ||
    value.guestClientQualified !== false ||
    value.installationReplayed !== false ||
    !integer(value.uid) ||
    value.uid <= 0
  )
    throw new Error('Original ABI renewal installation, peer, identity or framing differs');
  if (
    !integer(value.startedMs) ||
    !integer(value.finishedMs) ||
    !integer(value.originalDeadlineMs) ||
    !integer(value.installationFinishedMs) ||
    !integer(value.peerMonotonicMs) ||
    value.installationFinishedMs <= 0 ||
    value.installationFinishedMs > value.peerMonotonicMs ||
    value.startedMs < value.peerMonotonicMs ||
    value.startedMs - value.peerMonotonicMs > 300000 ||
    value.finishedMs < value.startedMs ||
    value.finishedMs - value.peerMonotonicMs > 300000 ||
    value.finishedMs - value.startedMs > 60000 ||
    value.originalDeadlineMs !== request.guestDeadlineMs ||
    value.finishedMs >= value.originalDeadlineMs
  )
    throw new Error('Original ABI renewal clocks, freshness or deadline differ');
  if (!Array.isArray(value.processes) || value.processes.length !== 3)
    throw new Error('Original ABI renewal requires three serial processes');
  const pids = new Set<number>();
  let previous = value.startedMs;
  const processes = value.processes.map((item, index) => {
    const process = inspectGcpObserverGuestProcess(
      item,
      request,
      { ...mappings[index], stdout: 'empty' },
      {
        startedMs: previous,
        finishedMs: value.finishedMs as number,
        originalDeadlineMs: value.originalDeadlineMs as number,
      },
    );
    if (pids.has(process.pid)) throw new Error('Original ABI renewal requires distinct processes');
    pids.add(process.pid);
    previous = process.finishedMs;
    return process;
  });
  return Object.freeze({
    instanceId: value.instanceId as string,
    nonce: value.nonce as string,
    uid: value.uid,
    bootId: value.bootId as string,
    pythonPath: value.pythonPath as string,
    pythonSha256: value.pythonSha256 as string,
    archiveSha256: value.archiveSha256 as string,
    clientRoot: value.clientRoot as string,
    installationNonce: value.installationNonce as string,
    installationReceiptSha256: value.installationReceiptSha256 as string,
    installationFinishedMs: value.installationFinishedMs,
    peerChallenge: value.peerChallenge as string,
    peerMonotonicMs: value.peerMonotonicMs,
    startedMs: value.startedMs,
    finishedMs: value.finishedMs,
    originalDeadlineMs: value.originalDeadlineMs,
    receiptSha256: hash(raw),
    processes: Object.freeze(processes),
    abiVerified: true,
    installationReplayed: false,
    guestClientQualified: false,
  } satisfies GcpObserverClientAbiRenewalEvidence);
}
export interface OriginalGcpObserverClientAbiRenewal {
  readonly schemaVersion: 2;
  readonly kind: 'original-gcp-observer-client-abi-renewal-reference';
}
const origins = new WeakMap<
  OriginalGcpObserverClientAbiRenewal,
  {
    readonly command: unknown;
    readonly peer: unknown;
    readonly installation: unknown;
    readonly callback: OriginalApplyCallbackContext;
    read(): Promise<Readonly<QualifiedGcpObserverRenewalClients>>;
  }
>();
export async function readOriginalGcpObserverClientAbiRenewal(value: unknown) {
  const origin =
    value && typeof value === 'object' ? origins.get(value as OriginalGcpObserverClientAbiRenewal) : undefined;
  if (!origin) throw new Error('Original observer client delivery provenance required');
  return origin.read();
}
/** Only the original successful delivery and the same actual callback can
 * hand the verified peer to the independent ABI command. */
export async function assertOriginalGcpObserverClientAbiRenewalContext(
  value: unknown,
  callback: OriginalApplyCallbackContext,
) {
  const origin =
    value && typeof value === 'object' ? origins.get(value as OriginalGcpObserverClientAbiRenewal) : undefined;
  if (!origin || origin.callback !== callback)
    throw new Error('Original observer ABI renewal and actual callback required');
  const clients = await origin.read();
  await assertOriginalGcpObserverClientInstallationContext(origin.installation, callback);
  const peer = await assertOriginalVerifiedGcpObserverPeerContext(origin.peer, callback);
  if (peer.peer.instanceId !== clients.instanceId || peer.peer.clock.bootId !== clients.bootId)
    throw new Error('Original observer ABI renewal peer identity differs');
  return Object.freeze({
    clients,
    installation: origin.installation,
    peer: origin.peer,
    command: origin.command,
    callback,
  });
}
/** Real original native SSH execution/output only. No executor or reply override. */
export async function openGcpObserverClientAbiRenewal(command: unknown) {
  const original = await readOriginalGcpObserverClientAbiRenewalCommand(command);
  const root = join(original.callback.original.executionDirectory, `gcp-observer-abi-renewal-captures-${randomUUID()}`);
  await mkdir(root, { mode: 0o700 });
  const directory = await lstat(root, { bigint: true });
  let closed = false,
    used = false,
    producerSeen = false,
    producerClosed = false;
  let pending: Promise<OriginalGcpObserverClientAbiRenewal> | undefined, closing: Promise<void> | undefined;
  const retained: OriginalInputBinding[] = [];
  let retired = false;
  let receipts: Awaited<ReturnType<typeof monitorOriginalInputs>> | undefined;
  const guard = async () => {
    const current = await lstat(root, { bigint: true });
    if (
      closed ||
      (await realpath(root)) !== root ||
      !current.isDirectory() ||
      (['dev', 'ino', 'uid', 'mode'] as const).some((key) => current[key] !== directory[key])
    )
      throw new Error('Original observer ABI renewal capture directory changed or closed');
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
  const run = async (): Promise<OriginalGcpObserverClientAbiRenewal> => {
    await guard();
    let admission: ExecutionCaptureAdmission | undefined,
      capture: FinalExecutionCapture | undefined,
      completion: OriginalOutputCompletion | undefined;
    let stdout = Buffer.alloc(0),
      stderr = Buffer.alloc(0);
    const policy: SignalFreeExecutionPolicy = {
      python: original.python,
      executable: original.executable,
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
          value.originalStartMs !== original.callback.original.budget.start ||
          value.originalDeadlineMs !== original.callback.original.budget.deadline ||
          JSON.stringify(value.args) !== JSON.stringify(original.args) ||
          value.stdin !== undefined
        )
          throw new Error('Original observer ABI renewal admission differs');
        const prefix = await readOriginalExecutionPrefix(value.output);
        if (
          prefix.directory !== root ||
          !same(prefix.identity, value.identity) ||
          prefix.stdout.bytes ||
          prefix.stderr.bytes
        )
          throw new Error('Original empty ABI renewal output required');
        admission = value;
        producerSeen = true;
      },
      finalCapture: async (value) => {
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
            throw new Error('Original observer ABI renewal producer or stdin differs');
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
                throw new Error('Original observer ABI renewal output chunk differs');
              offset = record.endOffset;
              parts.push(record.bytes);
              if (channel === 'stdout') stdout = Buffer.concat(parts);
              else stderr = Buffer.concat(parts);
            }
          }
          if (!value.originalGroupClosed) throw new Error('Original observer ABI renewal producer closure unresolved');
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
            throw new Error('Original observer ABI renewal completion differs');
          producerClosed = true;
        } catch (error) {
          failure = error;
        }
        await persist('capture.private.json', {
          schemaVersion: 1,
          kind: 'original-observer-client-abi-renewal-capture',
          capture: value,
          completion,
          stdoutSha256: hash(stdout),
          stderrSha256: hash(stderr),
          stdoutBase64: stdout.toString('base64'),
          stderrBase64: stderr.toString('base64'),
          complete: !failure && !!completion,
          guestClientQualified: false,
          ...(failure ? { errorType: failure instanceof Error ? failure.name : typeof failure } : {}),
        });
        if (failure) throw failure;
      },
    };
    try {
      const execute = await signalFreeGcpObserverClientAbiRenewalExecutor(policy, command);
      const result = await execute({ cwd: root, args: [...original.args], env: { LC_ALL: 'C' } });
      await assertOriginalGcpObserverClientAbiRenewalInputs(command);
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
        throw new Error('Original observer ABI renewal not verified; private diagnostics retained');
      const candidate = inspectGcpObserverClientAbiRenewal(stdout, original.request);
      const sourceStartedMs = capture.invocationStartedMs;
      const value = Object.freeze({
        ...candidate,
        guestClientQualified: true as const,
        cloudOperationalQualified: false as const,
      });
      await persist('proof.private.json', {
        schemaVersion: 1,
        kind: 'original-observer-client-abi-renewal-proof',
        ...value,
        stdoutSha256: hash(stdout),
      });
      const read = async () => {
        if (retired) throw new Error('Original observer ABI renewal reference retired');
        try {
          await guard();
          if (linuxMonotonicMs() < sourceStartedMs || linuxMonotonicMs() - sourceStartedMs > 300000)
            throw new Error('Original observer ABI renewal evidence is stale');
          await assertOriginalGcpObserverClientInstallationContext(original.installation, original.callback);
          await assertOriginalGcpObserverClientAbiRenewalInputs(command);
          const peer = await assertOriginalVerifiedGcpObserverPeerContext(original.peer, original.callback);
          if (peer.peer.instanceId !== value.instanceId || peer.peer.clock.bootId !== value.bootId)
            throw new Error('Original observer ABI renewal peer identity differs');
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
      const ref: OriginalGcpObserverClientAbiRenewal = Object.freeze({
        schemaVersion: 2,
        kind: 'original-gcp-observer-client-abi-renewal-reference',
      });
      origins.set(ref, {
        command,
        installation: original.installation,
        peer: original.peer,
        callback: original.callback,
        read,
      });
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
        throw new AggregateError([error, retention], 'Original observer ABI renewal failure retention unresolved');
      }
      throw error;
    }
  };
  return Object.freeze({
    verify(): Promise<OriginalGcpObserverClientAbiRenewal> {
      if (closed || used) return Promise.reject(new Error('Original observer ABI renewal is closed or single-use'));
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
            throw new Error('Original observer ABI renewal lock unresolved; retained');
          } catch (error) {
            if (!(error instanceof Error) || (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          }
          if (producerSeen && !producerClosed)
            throw new Error('Original observer ABI renewal producer closure unresolved');
          closed = true;
        })();
      return closing;
    },
  });
}
