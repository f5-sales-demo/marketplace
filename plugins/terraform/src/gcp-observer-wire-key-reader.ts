import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import {
  bindOriginalGcpObserverKeyScanCommand,
  type OriginalGcpKeyScanCommand,
  readOriginalGcpKeyScanCommand,
} from './gcp-keyscan-command';
import type { OriginalGcpSshClientProfile } from './gcp-ssh-client-profile';
import type { OriginalApplyCallbackContext } from './installed-apply-controller';
import { assertSameOriginalInput, type OriginalInputBinding } from './original-input-monitor';
import {
  type OriginalOutputCompletion,
  readOriginalExecutionChunk,
  readOriginalExecutionCompletion,
  readOriginalExecutionPrefix,
} from './original-output-stream';
import type { Executor } from './runner';
import {
  type ExecutionCaptureAdmission,
  type FinalExecutionCapture,
  type SignalFreeExecutionPolicy,
  signalFreeGcpKeyScanExecutor,
} from './signal-free-executor';

const maximum = 65536;
const hash = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
const sameIdentity = (left: ExecutionCaptureAdmission['identity'], right: ExecutionCaptureAdmission['identity']) =>
  (['pid', 'group', 'start', 'boot'] as const).every((key) => left[key] === right[key]);
export interface OriginalGcpObserverWireKeys {
  readonly schemaVersion: 1;
  readonly kind: 'original-gcp-observer-wire-key-reference';
}
interface WireKeyView {
  readonly project: string;
  readonly zone: string;
  readonly nodeName: string;
  readonly instanceId: string;
  readonly address: string;
  readonly knownHostsLine: string;
  readonly fingerprint: string;
  readonly algorithm: 'ssh-ed25519';
  readonly startedAt: number;
  readonly finishedAt: number;
  readonly stdoutSha256: string;
  readonly stderrSha256: string;
  readonly originalStartMs: number;
  readonly originalDeadlineMs: number;
  readonly finalStartedMs: number;
  readonly finalDeadlineMs: number;
  readonly originalGroupClosed: true;
  readonly sshTrustQualified: false;
}
const origins = new WeakMap<
  OriginalGcpObserverWireKeys,
  {
    readonly vm: unknown;
    readonly callback: OriginalApplyCallbackContext;
    read(): Promise<Readonly<WireKeyView>>;
  }
>();
export async function readOriginalGcpObserverWireKeys(value: unknown) {
  const origin = value && typeof value === 'object' ? origins.get(value as OriginalGcpObserverWireKeys) : undefined;
  if (!origin) throw new Error('Original observer wire-key source required');
  return origin.read();
}
/** A source for an equivalent-looking VM or copied callback cannot cross this join. */
export async function assertOriginalGcpObserverWireKeysOrigin(
  value: unknown,
  vm: unknown,
  callback: OriginalApplyCallbackContext,
) {
  const origin = value && typeof value === 'object' ? origins.get(value as OriginalGcpObserverWireKeys) : undefined;
  if (!origin || origin.vm !== vm || origin.callback !== callback)
    throw new Error('Original wire-key VM and actual callback pairing required');
  return origin.read();
}
export interface GcpObserverWireKeyReaderOptions {
  /** Explicit offline executor seam. Installed callers use the qualified native mapping. */
  readonly executorFactory?: (
    policy: SignalFreeExecutionPolicy,
    command: OriginalGcpKeyScanCommand,
  ) => Executor | Promise<Executor>;
}
function key(stdout: Buffer, address: string) {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(stdout);
  if (
    !text.endsWith('\n') ||
    text.indexOf('\n') !== text.length - 1 ||
    Array.from(text.slice(0, -1)).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  )
    throw new Error('One complete original observer wire key required');
  const line = text.slice(0, -1);
  const fields = line.split(' ');
  if (
    fields.length !== 3 ||
    fields[0] !== address ||
    fields[1] !== 'ssh-ed25519' ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(fields[2])
  )
    throw new Error('Original observer address and supported host-key algorithm required');
  const bytes = Buffer.from(fields[2], 'base64');
  if (
    bytes.toString('base64') !== fields[2] ||
    bytes.length !== 51 ||
    bytes.readUInt32BE(0) !== 11 ||
    bytes.subarray(4, 15).toString() !== 'ssh-ed25519' ||
    bytes.readUInt32BE(15) !== 32
  )
    throw new Error('Complete canonical original Ed25519 wire key required');
  return {
    knownHostsLine: line,
    fingerprint: `SHA256:${createHash('sha256').update(bytes).digest('base64').replace(/=+$/, '')}`,
  };
}
/** One read, owned by the original VM/callback/client capability. Wire keys are
 * untrusted until independently joined to that VM's original serial source. */
export async function openGcpObserverWireKeyReader(
  vm: unknown,
  callback: OriginalApplyCallbackContext,
  profile: OriginalGcpSshClientProfile,
  options: GcpObserverWireKeyReaderOptions = {},
) {
  const executorFactory = options.executorFactory;
  const command = await bindOriginalGcpObserverKeyScanCommand(vm, callback, profile);
  const original = await readOriginalGcpKeyScanCommand(command);
  const root = join(callback.original.executionDirectory, `gcp-wire-key-readers-${randomUUID()}`);
  await mkdir(root, { mode: 0o700 });
  const directory = await lstat(root, { bigint: true });
  let retired = false;
  let once = false;
  let pending: Promise<OriginalGcpObserverWireKeys> | undefined;
  let closure: Promise<void> | undefined;
  let originalProducerSeen = false;
  let originalProducerClosed = false;
  const assertRoot = async () => {
    const current = await lstat(root, { bigint: true });
    if (
      !current.isDirectory() ||
      current.isSymbolicLink() ||
      (await realpath(root)) !== root ||
      (['dev', 'ino', 'uid', 'mode'] as const).some((field) => current[field] !== directory[field]) ||
      current.uid !== BigInt(process.getuid?.() ?? -1) ||
      (current.mode & 0o777n) !== 0o700n
    )
      throw new Error('Original private wire-key directory changed');
  };
  const guard = async () => {
    if (retired) throw new Error('Original observer wire-key reader retired');
    await assertRoot();
    await readOriginalGcpKeyScanCommand(command);
  };
  // Retained logs may be empty. This admission is confined to this owned capture
  // directory and never changes executable or installed-input admission.
  const readRetained = async (path: string) => {
    await assertRoot();
    const before = await lstat(path, { bigint: true });
    const fields = ['dev', 'ino', 'uid', 'nlink', 'mode', 'size', 'mtimeNs', 'ctimeNs'] as const;
    if (
      !before.isFile() ||
      before.isSymbolicLink() ||
      before.uid !== directory.uid ||
      before.nlink !== 1n ||
      (before.mode & 0o777n) !== 0o400n ||
      before.size > BigInt(maximum) ||
      (await realpath(path)) !== path
    )
      throw new Error('Original owned bounded capture file required');
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    let bytes: Buffer;
    try {
      const opened = await file.stat({ bigint: true });
      if (fields.some((field) => opened[field] !== before[field]))
        throw new Error('Original capture descriptor changed');
      bytes = await file.readFile();
      const after = await file.stat({ bigint: true });
      if (fields.some((field) => after[field] !== before[field]))
        throw new Error('Original capture bytes changed during read');
    } finally {
      await file.close();
    }
    const current = await lstat(path, { bigint: true });
    if (fields.some((field) => current[field] !== before[field]) || BigInt(bytes.length) !== before.size)
      throw new Error('Original capture file changed during read');
    await assertRoot();
    const binding: OriginalInputBinding = Object.freeze({
      path,
      sha256: hash(bytes),
      expectedIdentity: Object.freeze(
        Object.fromEntries(fields.map((field) => [field, String(before[field])])) as NonNullable<
          OriginalInputBinding['expectedIdentity']
        >,
      ),
      expectedParentIdentity: Object.freeze({
        dev: String(directory.dev),
        ino: String(directory.ino),
        uid: String(directory.uid),
        mode: String(directory.mode),
      }),
    });
    return { bytes, binding };
  };
  const persist = async (name: string, bytes: Buffer): Promise<OriginalInputBinding> => {
    await assertRoot();
    const path = join(root, name);
    const file = await open(
      path,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o400,
    );
    let identity: Awaited<ReturnType<typeof file.stat>>;
    try {
      await file.writeFile(bytes);
      await file.sync();
      identity = await file.stat();
    } finally {
      await file.close();
    }
    const retained = await readRetained(path);
    const actual = await lstat(path);
    if (hash(bytes) !== retained.binding.sha256 || actual.ino !== identity.ino || actual.dev !== identity.dev)
      throw new Error('Original wire-key retained bytes or file identity changed');
    const parent = await open(root, 'r');
    try {
      await parent.sync();
    } finally {
      await parent.close();
    }
    await assertRoot();
    return retained.binding;
  };
  const scanOnce = async (): Promise<OriginalGcpObserverWireKeys> => {
    await guard();
    const startedAt = Date.now();
    let admission: ExecutionCaptureAdmission | undefined;
    let final: FinalExecutionCapture | undefined;
    let completion: OriginalOutputCompletion | undefined;
    let stdout = Buffer.alloc(0),
      stderr = Buffer.alloc(0);
    const bindings: OriginalInputBinding[] = [];
    const policy: SignalFreeExecutionPolicy = {
      python: callback.original.inputs.python,
      executable: original.executable,
      originalStartMs: callback.original.budget.start,
      originalDeadlineMs: callback.original.budget.deadline,
      timeoutMs: 60000,
      startupTimeoutMs: 15000,
      maxOutputBytes: maximum,
      assertOriginal: guard,
      assertOriginalIdentity: guard,
      assertFinalInputs: guard,
      beforeRelease: async (value) => {
        await guard();
        if (
          admission ||
          value.directory !== root ||
          value.originalStartMs !== callback.original.budget.start ||
          value.originalDeadlineMs !== callback.original.budget.deadline
        )
          throw new Error('Original wire-key execution admission differs');
        if (!executorFactory && JSON.stringify(value.args) !== JSON.stringify(original.args))
          throw new Error('Original wire-key command arguments differ');
        const prefix = await readOriginalExecutionPrefix(value.output);
        if (
          prefix.directory !== root ||
          !sameIdentity(prefix.identity, value.identity) ||
          prefix.stdout.bytes ||
          prefix.stderr.bytes
        )
          throw new Error('Original empty executor-issued wire-key output required');
        admission = value;
        originalProducerSeen = true;
      },
      finalCapture: async (capture) => {
        final = capture;
        originalProducerSeen ||= !!capture.identity;
        let failure: unknown;
        try {
          if (
            !admission ||
            !capture.identity ||
            !sameIdentity(capture.identity, admission.identity) ||
            capture.stdoutPath !== admission.stdoutPath ||
            capture.stderrPath !== admission.stderrPath
          )
            throw new Error('Original wire-key producer identity differs');
          for (const channel of ['stdout', 'stderr'] as const) {
            const parts: Buffer[] = [];
            let offset = 0;
            for (;;) {
              const chunk = await admission.output.read(channel);
              if (!chunk) break;
              const record = readOriginalExecutionChunk(admission.output, chunk, channel);
              if (
                !sameIdentity(record.identity, admission.identity) ||
                record.directory !== root ||
                record.offset !== offset ||
                record.endOffset !== offset + record.bytes.length ||
                hash(record.bytes) !== record.sha256 ||
                record.endOffset > maximum
              )
                throw new Error('Original wire-key output record differs');
              offset = record.endOffset;
              parts.push(record.bytes);
              if (channel === 'stdout') stdout = Buffer.concat(parts);
              else stderr = Buffer.concat(parts);
            }
          }
          if (!capture.originalGroupClosed) throw new Error('Original wire-key producer closure unresolved');
          completion = await admission.output.finish();
          const issued = readOriginalExecutionCompletion(admission.output, completion);
          if (
            !sameIdentity(issued.identity, admission.identity) ||
            issued.directory !== root ||
            completion.stdout.bytes !== stdout.length ||
            completion.stderr.bytes !== stderr.length ||
            completion.stdout.sha256 !== hash(stdout) ||
            completion.stderr.sha256 !== hash(stderr)
          )
            throw new Error('Original wire-key output completion differs');
          originalProducerClosed = true;
        } catch (error) {
          failure = error;
        }
        bindings.push(await persist('wire-stdout.private.bin', stdout));
        bindings.push(await persist('wire-stderr.private.bin', stderr));
        bindings.push(
          await persist(
            'wire-capture.private.json',
            Buffer.from(
              JSON.stringify({
                schemaVersion: 1,
                kind: 'original-gcp-observer-wire-capture',
                project: original.vm.project,
                zone: original.vm.zone,
                nodeName: original.vm.name,
                instanceId: original.vm.instanceId,
                address: original.vm.externalAddress,
                startedAt,
                finishedAt: Date.now(),
                capture,
                completion,
                complete: !failure && !!completion,
                sshTrustQualified: false,
                signalsSent: false,
                ...(failure ? { errorType: failure instanceof Error ? failure.name : typeof failure } : {}),
              }),
            ),
          ),
        );
        if (failure) throw failure;
      },
    };
    try {
      const execute = await (executorFactory
        ? executorFactory(policy, command)
        : signalFreeGcpKeyScanExecutor(policy, command));
      const result = await execute({ cwd: root, args: [...original.args], env: { LC_ALL: 'C' } });
      await guard();
      const finishedAt = Date.now();
      if (
        result.code !== 0 ||
        !admission ||
        !final ||
        !completion ||
        !final.submitted ||
        final.reason ||
        final.actualExitCode !== 0 ||
        !final.originalGroupClosed ||
        finishedAt < startedAt ||
        finishedAt - startedAt > 60000
      )
        throw new Error('Complete successful bounded original wire-key capture required');
      const parsed = key(stdout, original.vm.externalAddress);
      const source: Readonly<WireKeyView> = Object.freeze({
        project: original.vm.project,
        zone: original.vm.zone,
        nodeName: original.vm.name,
        instanceId: original.vm.instanceId,
        address: original.vm.externalAddress,
        ...parsed,
        algorithm: 'ssh-ed25519',
        startedAt,
        finishedAt,
        stdoutSha256: hash(stdout),
        stderrSha256: hash(stderr),
        originalStartMs: callback.original.budget.start,
        originalDeadlineMs: callback.original.budget.deadline,
        finalStartedMs: final.finalStartedMs,
        finalDeadlineMs: final.finalDeadlineMs,
        originalGroupClosed: true,
        sshTrustQualified: false,
      });
      const read = async () => {
        try {
          await guard();
          if (Date.now() < source.finishedAt || Date.now() - source.startedAt > 300000)
            throw new Error('Original observer wire keys stale');
          for (const binding of bindings) assertSameOriginalInput(binding, (await readRetained(binding.path)).binding);
          await guard();
          return source;
        } catch (error) {
          retired = true;
          throw error;
        }
      };
      const ref: OriginalGcpObserverWireKeys = Object.freeze({
        schemaVersion: 1,
        kind: 'original-gcp-observer-wire-key-reference',
      });
      origins.set(ref, { read, vm, callback });
      await read();
      return ref;
    } catch (error) {
      try {
        await persist(
          'wire-failure.private.json',
          Buffer.from(
            JSON.stringify({
              schemaVersion: 1,
              kind: 'original-gcp-observer-wire-failure',
              errorType: error instanceof Error ? error.name : typeof error,
              complete: false,
              sshTrustQualified: false,
              signalsSent: false,
            }),
          ),
        );
      } catch (retention) {
        throw new AggregateError([error, retention], 'Original wire-key failure retention unresolved');
      }
      throw error;
    }
  };
  return Object.freeze({
    scan(): Promise<OriginalGcpObserverWireKeys> {
      if (retired) return Promise.reject(new Error('Original observer wire-key reader retired'));
      if (once) return Promise.reject(new Error('Original wire-key scan is single-use'));
      once = true;
      pending = scanOnce();
      return pending;
    },
    close(): Promise<void> {
      if (!closure)
        closure = (async () => {
          if (pending) await pending.catch(() => undefined);
          retired = true;
          await assertRoot();
          try {
            await lstat(join(root, '.terraform-executor-lock'));
            throw new Error('Original wire-key executor closure unresolved; lock preserved');
          } catch (error) {
            if (!(error instanceof Error) || (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          }
          if (originalProducerSeen && !originalProducerClosed)
            throw new Error('Original wire-key producer closure unresolved');
        })();
      return closure;
    },
  });
}
