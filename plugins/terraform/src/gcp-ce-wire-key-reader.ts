import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, open, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { decodeEvidenceObject } from './evidence-json';
import { assertOriginalGcpCeKeyScanInputs, readOriginalGcpCeKeyScanCommand } from './gcp-ce-keyscan-command';
import { assertOriginalQualifiedGcpCeObserverScanContext } from './gcp-ce-sli-target';
import { type GcpObserverGuestProcess, inspectGcpObserverGuestProcess } from './gcp-observer-guest-process';
import pins from './gcp-ssh-client-pins.json';
import { inspectGcpWireHostKey } from './gcp-wire-key';
import type { OriginalApplyCallbackContext } from './installed-apply-controller';
import { readOwnedInstalledInput } from './installed-runtime';
import { linuxMonotonicMs } from './linux-clock';
import { bindOriginalAccessReaderCapture, openOriginalAccessReaderCapture } from './original-access-reader-source';
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
  signalFreeGcpCeKeyScanExecutor,
} from './signal-free-executor';

const hash = (raw: Uint8Array) => createHash('sha256').update(raw).digest('hex');
const same = (a: ExecutionCaptureAdmission['identity'], b: ExecutionCaptureAdmission['identity']) =>
  (['pid', 'group', 'start', 'boot'] as const).every((key) => a[key] === b[key]);
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value);
const requestFields = [
  'schemaVersion',
  'kind',
  'nonce',
  'observerInstanceId',
  'abiNonce',
  'abiReceiptSha256',
  'uid',
  'bootId',
  'pythonPath',
  'pythonSha256',
  'archiveSha256',
  'guestDeadlineMs',
  'targetInstanceId',
  'targetAddress',
  'project',
  'zone',
  'nodeName',
  'network',
  'subnet',
] as const;
export interface GcpCeWireKeyEvidence {
  readonly instanceId: string;
  readonly observerInstanceId: string;
  readonly project: string;
  readonly zone: string;
  readonly nodeName: string;
  readonly address: string;
  readonly network: string;
  readonly subnet: string;
  readonly nonce: string;
  readonly abiNonce: string;
  readonly abiReceiptSha256: string;
  readonly abiSchemaVersion: 1 | 2;
  readonly knownHostsLine: string;
  readonly fingerprint: string;
  readonly algorithm: 'ssh-rsa';
  readonly hostKeyAlgorithms: readonly ['rsa-sha2-512', 'rsa-sha2-256'];
  readonly process: Readonly<GcpObserverGuestProcess>;
  readonly receiptSha256: string;
  readonly startedMs: number;
  readonly finishedMs: number;
  readonly originalDeadlineMs: number;
  readonly sshTrustQualified: false;
  readonly guestAccessQualified: false;
}
/** Inspect consistency only. Parsed packets never issue an original reference. */
export function inspectGcpCeKeyScan(raw: Uint8Array, request: Readonly<Record<string, unknown>>) {
  if (raw.length > 65536) throw new Error('Original CE scan proof exceeds bound');
  const value = decodeEvidenceObject(raw);
  const fields = [
    ...requestFields.filter((key) => key !== 'guestDeadlineMs'),
    'interfaceIndex',
    'role',
    'process',
    'startedMs',
    'finishedMs',
    'originalDeadlineMs',
    'sshTrustQualified',
    'guestAccessQualified',
  ];
  if (
    Object.keys(value).sort().join(',') !== fields.sort().join(',') ||
    ![1, 2].includes(request.schemaVersion as number) ||
    value.schemaVersion !== request.schemaVersion ||
    value.kind !== 'original-observer-ce-keyscan-proof' ||
    requestFields
      .filter((key) => key !== 'kind' && key !== 'guestDeadlineMs')
      .some((key) => value[key] !== request[key]) ||
    value.observerInstanceId === value.targetInstanceId ||
    value.archiveSha256 !== pins.archiveSha256 ||
    value.interfaceIndex !== 1 ||
    value.role !== 'sli' ||
    value.sshTrustQualified !== false ||
    value.guestAccessQualified !== false
  )
    throw new Error('Original CE scan ABI, target or framing differs');
  if (
    !integer(value.startedMs) ||
    value.startedMs < 0 ||
    !integer(value.finishedMs) ||
    value.finishedMs < value.startedMs ||
    value.finishedMs - value.startedMs > 60000 ||
    !integer(value.originalDeadlineMs) ||
    value.originalDeadlineMs !== request.guestDeadlineMs ||
    value.finishedMs >= value.originalDeadlineMs
  )
    throw new Error('Original CE scan operation clocks or deadline differ');
  const process = inspectGcpObserverGuestProcess(
    value.process,
    request,
    {
      client: 'ssh-keyscan',
      args: ['-q', '-T', '15', '-t', 'rsa', '-p', '22', request.targetAddress as string],
      exitCode: 0,
      stdout: 'nonempty',
    },
    { startedMs: value.startedMs, finishedMs: value.finishedMs, originalDeadlineMs: value.originalDeadlineMs },
  );
  const key = inspectGcpWireHostKey(
    Buffer.from(process.stdoutBase64, 'base64'),
    request.targetAddress as string,
    'ssh-rsa',
  );
  return Object.freeze({
    instanceId: request.targetInstanceId as string,
    observerInstanceId: request.observerInstanceId as string,
    project: request.project as string,
    zone: request.zone as string,
    nodeName: request.nodeName as string,
    address: request.targetAddress as string,
    network: request.network as string,
    subnet: request.subnet as string,
    nonce: request.nonce as string,
    abiNonce: request.abiNonce as string,
    abiReceiptSha256: request.abiReceiptSha256 as string,
    abiSchemaVersion: request.schemaVersion as 1 | 2,
    ...key,
    algorithm: 'ssh-rsa',
    hostKeyAlgorithms: Object.freeze(['rsa-sha2-512', 'rsa-sha2-256'] as const),
    process,
    receiptSha256: hash(raw),
    startedMs: value.startedMs,
    finishedMs: value.finishedMs,
    originalDeadlineMs: value.originalDeadlineMs,
    sshTrustQualified: false,
    guestAccessQualified: false,
  } satisfies GcpCeWireKeyEvidence);
}
export interface OriginalGcpCeWireKeys {
  readonly schemaVersion: 1;
  readonly kind: 'original-gcp-ce-wire-key-reference';
}
export interface OriginalGcpCeWireKeyEvidence extends GcpCeWireKeyEvidence {
  readonly startedAt: number;
  readonly finishedAt: number;
}
const origins = new WeakMap<
  OriginalGcpCeWireKeys,
  {
    readonly command: unknown;
    readonly scanContext: unknown;
    readonly callback: OriginalApplyCallbackContext;
    read(): Promise<Readonly<OriginalGcpCeWireKeyEvidence>>;
  }
>();
export async function readOriginalGcpCeWireKeys(value: unknown) {
  const origin = value && typeof value === 'object' ? origins.get(value as OriginalGcpCeWireKeys) : undefined;
  if (!origin) throw new Error('Original CE wire-key provenance required');
  return origin.read();
}
/** The exact command-selected CE/observer context and callback must join. */
export async function assertOriginalGcpCeWireKeysContext(
  value: unknown,
  scanContext: unknown,
  callback: OriginalApplyCallbackContext,
) {
  const origin = value && typeof value === 'object' ? origins.get(value as OriginalGcpCeWireKeys) : undefined;
  if (!origin || origin.callback !== callback || origin.scanContext !== scanContext)
    throw new Error('Original CE wire keys, scan context and actual callback required');
  await assertOriginalQualifiedGcpCeObserverScanContext(scanContext, callback);
  return origin.read();
}
/** Real original native SSH execution/output only. No executor or reply override. */
export async function openGcpCeWireKeyReader(command: unknown) {
  const original = await readOriginalGcpCeKeyScanCommand(command);
  const root = join(original.callback.original.executionDirectory, `gcp-ce-keyscan-captures-${randomUUID()}`);
  await mkdir(root, { mode: 0o700 });
  const directory = await lstat(root, { bigint: true });
  const recorder = await openOriginalAccessReaderCapture({
    callback: original.callback,
    family: 'ce',
    role: 'wire',
    instanceId: String(original.request.targetInstanceId),
    directory: root,
    python: original.python,
    executable: original.executable,
    args: original.args,
  });
  let closed = false,
    used = false,
    producerSeen = false,
    producerClosed = false;
  let pending: Promise<OriginalGcpCeWireKeys> | undefined, closing: Promise<void> | undefined;
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
      throw new Error('Original CE keyscan capture directory changed or closed');
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
  const run = async (): Promise<OriginalGcpCeWireKeys> => {
    await guard();
    const startedAt = Date.now();
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
          throw new Error('Original CE keyscan admission differs');
        const prefix = await readOriginalExecutionPrefix(value.output);
        if (
          prefix.directory !== root ||
          !same(prefix.identity, value.identity) ||
          prefix.stdout.bytes ||
          prefix.stderr.bytes
        )
          throw new Error('Original empty CE keyscan executor output required');
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
            throw new Error('Original CE keyscan producer or stdin differs');
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
                throw new Error('Original CE keyscan output chunk differs');
              offset = record.endOffset;
              parts.push(record.bytes);
              if (channel === 'stdout') stdout = Buffer.concat(parts);
              else stderr = Buffer.concat(parts);
            }
          }
          if (!value.originalGroupClosed) throw new Error('Original CE keyscan producer closure unresolved');
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
            throw new Error('Original CE keyscan completion differs');
          producerClosed = true;
        } catch (error) {
          failure = error;
        }
        await persist('capture.private.json', {
          schemaVersion: 1,
          kind: 'original-ce-keyscan-capture',
          capture: value,
          completion,
          stdoutSha256: hash(stdout),
          stderrSha256: hash(stderr),
          stdoutBase64: stdout.toString('base64'),
          stderrBase64: stderr.toString('base64'),
          complete: !failure && !!completion,
          sshTrustQualified: false,
          ...(failure ? { errorType: failure instanceof Error ? failure.name : typeof failure } : {}),
        });
        if (failure) throw failure;
      },
    };
    try {
      const execute = await signalFreeGcpCeKeyScanExecutor(policy, command);
      await recorder.begin();
      let result: Awaited<ReturnType<typeof execute>>;
      try {
        result = await execute({ cwd: root, args: [...original.args], env: { LC_ALL: 'C' } });
      } finally {
        recorder.finished(execute);
      }
      await assertOriginalGcpCeKeyScanInputs(command);
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
        throw new Error('Original CE keyscan not verified; private diagnostics retained');
      const candidate = inspectGcpCeKeyScan(stdout, original.request);
      const sourceStartedMs = capture.invocationStartedMs;
      const finishedAt = Date.now();
      if (finishedAt < startedAt || finishedAt - startedAt > 60000)
        throw new Error('Original CE keyscan source capture clocks differ');
      const value = Object.freeze({ ...candidate, startedAt, finishedAt });
      await persist('proof.private.json', {
        schemaVersion: 1,
        kind: 'original-ce-keyscan-proof',
        ...value,
        stdoutSha256: hash(stdout),
      });
      const read = async () => {
        if (retired) throw new Error('Original CE keyscan reference retired');
        try {
          await guard();
          if (linuxMonotonicMs() < sourceStartedMs || linuxMonotonicMs() - sourceStartedMs > 300000)
            throw new Error('Original CE keyscan evidence is stale');
          await assertOriginalQualifiedGcpCeObserverScanContext(original.scanContext, original.callback);
          await assertOriginalGcpCeKeyScanInputs(command);
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
      const ref: OriginalGcpCeWireKeys = Object.freeze({
        schemaVersion: 1,
        kind: 'original-gcp-ce-wire-key-reference',
      });
      origins.set(ref, {
        command,
        scanContext: original.scanContext,
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
          sshTrustQualified: false,
        });
      } catch (retention) {
        throw new AggregateError([error, retention], 'Original CE keyscan failure retention unresolved');
      }
      throw error;
    }
  };
  const port = Object.freeze({
    scan(): Promise<OriginalGcpCeWireKeys> {
      if (closed || used) return Promise.reject(new Error('Original CE keyscan is closed or single-use'));
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
            throw new Error('Original CE keyscan lock unresolved; retained');
          } catch (error) {
            if (!(error instanceof Error) || (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          }
          if (producerSeen && !producerClosed) throw new Error('Original CE keyscan producer closure unresolved');
          closed = true;
        })();
      return closing;
    },
  });
  bindOriginalAccessReaderCapture(port, recorder);
  return port;
}
