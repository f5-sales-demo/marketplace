import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, open, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { decodeEvidenceObject } from './evidence-json';
import {
  assertOriginalGcpObserverClientAbiInputs,
  readOriginalGcpObserverClientAbiCommand,
} from './gcp-observer-client-abi-command';
import { assertOriginalGcpObserverClientDeliveryContext } from './gcp-observer-client-delivery';
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
} from './original-output-stream';
import {
  type ExecutionCaptureAdmission,
  type FinalExecutionCapture,
  type SignalFreeExecutionPolicy,
  signalFreeGcpObserverClientAbiExecutor,
} from './signal-free-executor';

const hash = (raw: Uint8Array) => createHash('sha256').update(raw).digest('hex');
const same = (a: ExecutionCaptureAdmission['identity'], b: ExecutionCaptureAdmission['identity']) =>
  (['pid', 'group', 'start', 'boot'] as const).every((key) => a[key] === b[key]);
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Original observer ABI object framing differs');
  return value as Record<string, unknown>;
};
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
type ClientName = (typeof mappings)[number]['client'];
export interface GcpObserverAbiProcess {
  readonly client: ClientName;
  readonly args: readonly string[];
  readonly pid: number;
  readonly identity: Readonly<Record<string, string | number>>;
  readonly executableSha256: string;
  readonly stdoutSha256: string;
  readonly stderrSha256: string;
  readonly stdoutBase64: string;
  readonly stderrBase64: string;
  readonly exitCode: number;
  readonly originalDeadlineMs: number;
  readonly startedMs: number;
  readonly finishedMs: number;
  readonly originalGroupClosed: true;
  readonly signalsSent: false;
}
export interface GcpObserverClientAbiEvidence {
  readonly instanceId: string;
  readonly nonce: string;
  readonly receiptSha256: string;
  readonly clientRoot: string;
  readonly uid: number;
  readonly bootId: string;
  readonly pythonPath: string;
  readonly pythonSha256: string;
  readonly archiveSha256: string;
  readonly deliveryNonce: string;
  readonly deliveryReceiptSha256: string;
  readonly deliveryFinishedMs: number;
  readonly startedMs: number;
  readonly finishedMs: number;
  readonly originalDeadlineMs: number;
  readonly processes: readonly Readonly<GcpObserverAbiProcess>[];
  readonly abiVerified: true;
  readonly guestClientQualified: false;
}
export interface QualifiedGcpObserverClients extends Omit<GcpObserverClientAbiEvidence, 'guestClientQualified'> {
  readonly guestClientQualified: true;
  readonly cloudOperationalQualified: false;
}
function output(value: Record<string, unknown>, channel: 'stdout' | 'stderr') {
  const encoded = value[`${channel}Base64`];
  if (typeof encoded !== 'string' || encoded.length > 90000)
    throw new Error('Original observer ABI output bound differs');
  const raw = Buffer.from(encoded, 'base64');
  if (raw.length > 65536 || raw.toString('base64') !== encoded || hash(raw) !== value[`${channel}Sha256`])
    throw new Error('Original observer ABI output framing, bytes or hash differs');
  return raw;
}
/** Consistency only. Caller packets cannot issue a qualified client reference. */
export function inspectGcpObserverClientAbi(raw: Uint8Array, request: Readonly<Record<string, unknown>>) {
  if (raw.length > 65536) throw new Error('Original observer ABI proof exceeds bound');
  const value = decodeEvidenceObject(raw);
  const fields = [
    'schemaVersion',
    'kind',
    'instanceId',
    'nonce',
    'clientRoot',
    'uid',
    'bootId',
    'pythonPath',
    'pythonSha256',
    'archiveSha256',
    'deliveryNonce',
    'deliveryReceiptSha256',
    'deliveryFinishedMs',
    'startedMs',
    'finishedMs',
    'originalDeadlineMs',
    'processes',
    'abiVerified',
    'guestClientQualified',
  ];
  if (
    !exact(value, fields) ||
    value.schemaVersion !== 1 ||
    value.kind !== 'original-observer-client-abi-proof' ||
    [
      'instanceId',
      'nonce',
      'uid',
      'bootId',
      'pythonPath',
      'pythonSha256',
      'archiveSha256',
      'deliveryNonce',
      'deliveryReceiptSha256',
      'deliveryFinishedMs',
    ].some((key) => value[key] !== request[key]) ||
    value.archiveSha256 !== pins.archiveSha256 ||
    value.clientRoot !== `/home/ubuntu/.local/share/xcsh/gcp-observer-clients/${request.instanceId}` ||
    !integer(value.uid) ||
    value.uid <= 0 ||
    value.abiVerified !== true ||
    value.guestClientQualified !== false
  )
    throw new Error('Original observer ABI delivery, guest identity or framing differs');
  if (
    !integer(value.startedMs) ||
    !integer(value.finishedMs) ||
    !integer(value.originalDeadlineMs) ||
    !integer(value.deliveryFinishedMs) ||
    value.startedMs < value.deliveryFinishedMs ||
    value.finishedMs < value.startedMs ||
    value.finishedMs - value.startedMs > 60000 ||
    value.originalDeadlineMs !== request.guestDeadlineMs ||
    value.finishedMs >= value.originalDeadlineMs
  )
    throw new Error('Original observer ABI clock or deadline differs');
  if (!Array.isArray(value.processes) || value.processes.length !== 3)
    throw new Error('Original observer ABI requires all three original client processes');
  const pids = new Set<number>();
  let previous = value.startedMs;
  const processes = value.processes.map((item, index): Readonly<GcpObserverAbiProcess> => {
    const row = object(item),
      identity = object(row.identity),
      mapping = mappings[index];
    if (
      !exact(row, [
        'client',
        'args',
        'pid',
        'identity',
        'exitCode',
        'executableSha256',
        'stdoutSha256',
        'stderrSha256',
        'stdoutBase64',
        'stderrBase64',
        'originalDeadlineMs',
        'originalGroupClosed',
        'startedMs',
        'finishedMs',
        'signalsSent',
      ]) ||
      row.client !== mapping.client ||
      JSON.stringify(row.args) !== JSON.stringify(mapping.args) ||
      row.exitCode !== mapping.exitCode ||
      row.executableSha256 !== pins.files[mapping.client].sha256 ||
      row.originalGroupClosed !== true ||
      row.signalsSent !== false ||
      !integer(row.pid) ||
      row.pid <= 0 ||
      pids.has(row.pid)
    )
      throw new Error('Original observer ABI client command, producer or closure differs');
    pids.add(row.pid);
    if (
      !exact(identity, [
        'pid',
        'group',
        'start',
        'bootId',
        'uid',
        'pythonPath',
        'pythonSha256',
        'clientFd',
        'clientSha256',
        'clientSeals',
        'clientBytes',
        'clientDev',
        'clientIno',
      ]) ||
      identity.pid !== row.pid ||
      identity.group !== row.pid ||
      ['uid', 'bootId', 'pythonPath', 'pythonSha256'].some((key) => identity[key] !== request[key]) ||
      typeof identity.start !== 'string' ||
      !/^[1-9][0-9]*$/.test(identity.start) ||
      !integer(identity.clientFd) ||
      identity.clientFd <= 2 ||
      identity.clientSeals !== 15 ||
      !integer(identity.clientBytes) ||
      identity.clientBytes <= 0 ||
      identity.clientBytes > 16 * 1024 * 1024 ||
      identity.clientSha256 !== pins.files[mapping.client].sha256 ||
      ['clientDev', 'clientIno'].some(
        (key) => typeof identity[key] !== 'string' || !/^(?:0|[1-9][0-9]*)$/.test(identity[key] as string),
      )
    )
      throw new Error('Original observer ABI gated identity or sealed executable differs');
    if (
      !integer(row.startedMs) ||
      !integer(row.finishedMs) ||
      row.startedMs < previous ||
      row.finishedMs < row.startedMs ||
      row.finishedMs > (value.finishedMs as number) ||
      row.originalDeadlineMs !== value.originalDeadlineMs ||
      row.finishedMs >= (value.originalDeadlineMs as number)
    )
      throw new Error('Original observer ABI serial process clocks differ');
    previous = row.finishedMs;
    const stdout = output(row, 'stdout'),
      stderr = output(row, 'stderr');
    if (stdout.length !== 0 || !stderr.toString('utf8').includes(mapping.marker))
      throw new Error('Original observer ABI client output content differs');
    return Object.freeze({
      client: mapping.client,
      args: Object.freeze([...mapping.args]),
      pid: row.pid,
      identity: Object.freeze({ ...identity }) as GcpObserverAbiProcess['identity'],
      executableSha256: row.executableSha256 as string,
      stdoutSha256: hash(stdout),
      stderrSha256: hash(stderr),
      stdoutBase64: stdout.toString('base64'),
      stderrBase64: stderr.toString('base64'),
      exitCode: mapping.exitCode,
      originalDeadlineMs: row.originalDeadlineMs as number,
      startedMs: row.startedMs,
      finishedMs: row.finishedMs,
      originalGroupClosed: true,
      signalsSent: false,
    });
  });
  return Object.freeze({
    instanceId: value.instanceId as string,
    nonce: value.nonce as string,
    receiptSha256: hash(raw),
    clientRoot: value.clientRoot as string,
    uid: value.uid,
    bootId: value.bootId as string,
    pythonPath: value.pythonPath as string,
    pythonSha256: value.pythonSha256 as string,
    archiveSha256: value.archiveSha256 as string,
    deliveryNonce: value.deliveryNonce as string,
    deliveryReceiptSha256: value.deliveryReceiptSha256 as string,
    deliveryFinishedMs: value.deliveryFinishedMs,
    startedMs: value.startedMs,
    finishedMs: value.finishedMs,
    originalDeadlineMs: value.originalDeadlineMs,
    processes: Object.freeze(processes),
    abiVerified: true,
    guestClientQualified: false,
  } satisfies GcpObserverClientAbiEvidence);
}

export interface OriginalGcpObserverClientAbi {
  readonly schemaVersion: 1;
  readonly kind: 'original-gcp-observer-client-abi-reference';
}
const origins = new WeakMap<
  OriginalGcpObserverClientAbi,
  {
    readonly command: unknown;
    readonly peer: unknown;
    readonly delivery: unknown;
    readonly callback: OriginalApplyCallbackContext;
    read(): Promise<Readonly<QualifiedGcpObserverClients>>;
  }
>();
export async function readOriginalGcpObserverClientAbi(value: unknown) {
  const origin = value && typeof value === 'object' ? origins.get(value as OriginalGcpObserverClientAbi) : undefined;
  if (!origin) throw new Error('Original observer client delivery provenance required');
  return origin.read();
}
/** Only the original successful delivery and the same actual callback can
 * hand the verified peer to the independent ABI command. */
export async function assertOriginalGcpObserverClientAbiContext(
  value: unknown,
  callback: OriginalApplyCallbackContext,
) {
  const origin = value && typeof value === 'object' ? origins.get(value as OriginalGcpObserverClientAbi) : undefined;
  if (!origin || origin.callback !== callback) throw new Error('Original observer ABI and actual callback required');
  const clients = await origin.read();
  await assertOriginalGcpObserverClientDeliveryContext(origin.delivery, callback);
  const peer = await assertOriginalVerifiedGcpObserverPeerContext(origin.peer, callback);
  if (peer.peer.instanceId !== clients.instanceId || peer.peer.clock.bootId !== clients.bootId)
    throw new Error('Original observer ABI peer identity differs');
  return Object.freeze({ clients, delivery: origin.delivery, peer: origin.peer, command: origin.command, callback });
}
/** Real original native SSH execution/output only. No executor or reply override. */
export async function openGcpObserverClientAbi(command: unknown) {
  const original = await readOriginalGcpObserverClientAbiCommand(command);
  const root = join(original.callback.original.executionDirectory, `gcp-observer-abi-captures-${randomUUID()}`);
  await mkdir(root, { mode: 0o700 });
  const directory = await lstat(root, { bigint: true });
  let closed = false,
    used = false,
    producerSeen = false,
    producerClosed = false;
  let pending: Promise<OriginalGcpObserverClientAbi> | undefined, closing: Promise<void> | undefined;
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
      throw new Error('Original observer ABI capture directory changed or closed');
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
  const run = async (): Promise<OriginalGcpObserverClientAbi> => {
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
          JSON.stringify(value.args) !== JSON.stringify(original.args) ||
          value.stdin !== undefined
        )
          throw new Error('Original observer ABI admission differs');
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
            throw new Error('Original observer ABI producer or stdin differs');
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
                throw new Error('Original observer ABI output chunk differs');
              offset = record.endOffset;
              parts.push(record.bytes);
              if (channel === 'stdout') stdout = Buffer.concat(parts);
              else stderr = Buffer.concat(parts);
            }
          }
          if (!value.originalGroupClosed) throw new Error('Original observer ABI producer closure unresolved');
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
            throw new Error('Original observer ABI completion differs');
          producerClosed = true;
        } catch (error) {
          failure = error;
        }
        await persist('capture.private.json', {
          schemaVersion: 1,
          kind: 'original-observer-client-abi-capture',
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
      const execute = await signalFreeGcpObserverClientAbiExecutor(policy, command);
      const result = await execute({ cwd: root, args: [...original.args], env: { LC_ALL: 'C' } });
      await assertOriginalGcpObserverClientAbiInputs(command);
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
        throw new Error('Original observer ABI not verified; private diagnostics retained');
      const candidate = inspectGcpObserverClientAbi(stdout, original.request);
      const sourceStartedMs = capture.invocationStartedMs;
      const value = Object.freeze({
        ...candidate,
        guestClientQualified: true as const,
        cloudOperationalQualified: false as const,
      });
      await persist('proof.private.json', {
        schemaVersion: 1,
        kind: 'original-observer-client-abi-proof',
        ...value,
        stdoutSha256: hash(stdout),
      });
      const read = async () => {
        if (retired) throw new Error('Original observer ABI reference retired');
        try {
          await guard();
          if (linuxMonotonicMs() - sourceStartedMs > 300000) throw new Error('Original observer ABI evidence is stale');
          await assertOriginalGcpObserverClientDeliveryContext(original.delivery, original.callback);
          await assertOriginalGcpObserverClientAbiInputs(command);
          const peer = await assertOriginalVerifiedGcpObserverPeerContext(original.peer, original.callback);
          if (peer.peer.instanceId !== value.instanceId || peer.peer.clock.bootId !== value.bootId)
            throw new Error('Original observer ABI peer identity differs');
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
      const ref: OriginalGcpObserverClientAbi = Object.freeze({
        schemaVersion: 1,
        kind: 'original-gcp-observer-client-abi-reference',
      });
      origins.set(ref, {
        command,
        delivery: original.delivery,
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
        throw new AggregateError([error, retention], 'Original observer ABI failure retention unresolved');
      }
      throw error;
    }
  };
  return Object.freeze({
    verify(): Promise<OriginalGcpObserverClientAbi> {
      if (closed || used) return Promise.reject(new Error('Original observer ABI is closed or single-use'));
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
            throw new Error('Original observer ABI lock unresolved; retained');
          } catch (error) {
            if (!(error instanceof Error) || (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          }
          if (producerSeen && !producerClosed) throw new Error('Original observer ABI producer closure unresolved');
          closed = true;
        })();
      return closing;
    },
  });
}
