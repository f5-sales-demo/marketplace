import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, open, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { type GcpObserverClockCandidate, inspectGcpObserverPeerClock } from './gcp-observer-clock';
import { readOriginalGcpObserverSshCommand } from './gcp-observer-ssh-command';
import { readOwnedInstalledInput } from './installed-runtime';
import { linuxMonotonicMs } from './linux-clock';
import { bindOriginalAccessReaderCapture, openOriginalAccessReaderCapture } from './original-access-reader-source';
import { assertSameOriginalInput, type OriginalInputBinding } from './original-input-monitor';
import {
  type OriginalOutputCompletion,
  readOriginalExecutionChunk,
  readOriginalExecutionCompletion,
} from './original-output-stream';
import {
  type ExecutionCaptureAdmission,
  type FinalExecutionCapture,
  type SignalFreeExecutionPolicy,
  signalFreeGcpObserverSshExecutor,
} from './signal-free-executor';

const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const equal = (left: ExecutionCaptureAdmission['identity'], right: ExecutionCaptureAdmission['identity']) =>
  (['pid', 'group', 'start', 'boot'] as const).every((key) => left[key] === right[key]);
export interface OriginalVerifiedGcpObserverPeer {
  readonly schemaVersion: 1;
  readonly kind: 'original-verified-gcp-observer-peer-reference';
}
const origins = new WeakMap<
  OriginalVerifiedGcpObserverPeer,
  {
    readonly callback: Awaited<ReturnType<typeof readOriginalGcpObserverSshCommand>>['callback'];
    readonly command: unknown;
    read(): Promise<
      Readonly<{
        instanceId: string;
        challengeMatched: true;
        clock: Readonly<GcpObserverClockCandidate>;
        cloudOperationalQualified: false;
      }>
    >;
  }
>();
export async function readOriginalVerifiedGcpObserverPeer(value: unknown) {
  const origin = value && typeof value === 'object' ? origins.get(value as OriginalVerifiedGcpObserverPeer) : undefined;
  if (!origin) throw new Error('Original verified observer SSH peer required');
  return origin.read();
}
export async function assertOriginalVerifiedGcpObserverPeerContext(
  value: unknown,
  callback: Awaited<ReturnType<typeof readOriginalGcpObserverSshCommand>>['callback'],
) {
  const origin = value && typeof value === 'object' ? origins.get(value as OriginalVerifiedGcpObserverPeer) : undefined;
  if (!origin || origin.callback !== callback)
    throw new Error('Original verified observer peer and actual callback required');
  const peer = await origin.read();
  const command = await readOriginalGcpObserverSshCommand(origin.command);
  if (command.callback !== callback || command.instanceId !== peer.instanceId)
    throw new Error('Original verified observer command/callback join differs');
  return Object.freeze({ peer, command: origin.command, callback });
}
/** Real SSH only. A zero exit code, receipt or arbitrary executable stdout is
 * insufficient without the original command, challenge and closure issuer. */
export async function openGcpObserverSshPeer(command: unknown) {
  const original = await readOriginalGcpObserverSshCommand(command);
  const root = join(original.callback.original.executionDirectory, `gcp-observer-peers-${randomUUID()}`);
  await mkdir(root, { mode: 0o700 });
  const directory = await lstat(root, { bigint: true });
  const recorder = await openOriginalAccessReaderCapture({
    callback: original.callback,
    family: 'observer',
    role: 'peer',
    instanceId: original.instanceId,
    directory: root,
    python: original.python,
    executable: original.executable,
    args: original.args,
  });
  let retired = false,
    used = false,
    producerSeen = false,
    producerClosed = false;
  let pending: Promise<OriginalVerifiedGcpObserverPeer> | undefined, closure: Promise<void> | undefined;
  const retained: OriginalInputBinding[] = [];
  const guardRoot = async () => {
    const current = await lstat(root, { bigint: true });
    if (
      (await realpath(root)) !== root ||
      !current.isDirectory() ||
      current.isSymbolicLink() ||
      (['dev', 'ino', 'uid', 'mode'] as const).some((key) => current[key] !== directory[key]) ||
      (current.mode & 0o777n) !== 0o700n
    )
      throw new Error('Original observer SSH capture directory changed');
  };
  const guard = async () => {
    if (retired) throw new Error('Original observer SSH peer retired');
    await guardRoot();
  };
  const persist = async (name: string, value: Record<string, unknown>) => {
    await guardRoot();
    const file = await open(join(root, name), 'wx', 0o400);
    try {
      await file.writeFile(JSON.stringify(value));
      await file.sync();
    } finally {
      await file.close();
    }
    const input = await readOwnedInstalledInput(join(root, name));
    retained.push(input.binding);
    const parent = await open(root, 'r');
    try {
      await parent.sync();
    } finally {
      await parent.close();
    }
    await guardRoot();
  };
  const probe = async (): Promise<OriginalVerifiedGcpObserverPeer> => {
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
        if (admission || value.directory !== root || JSON.stringify(value.args) !== JSON.stringify(original.args))
          throw new Error('Original observer SSH admission differs');
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
            !equal(value.identity, admission.identity) ||
            value.stdoutPath !== admission.stdoutPath ||
            value.stderrPath !== admission.stderrPath
          )
            throw new Error('Original observer SSH producer differs');
          for (const channel of ['stdout', 'stderr'] as const) {
            const pieces: Buffer[] = [];
            let offset = 0;
            for (;;) {
              const chunk = await admission.output.read(channel);
              if (!chunk) break;
              const record = readOriginalExecutionChunk(admission.output, chunk, channel);
              if (
                !equal(record.identity, admission.identity) ||
                record.directory !== root ||
                record.offset !== offset ||
                record.endOffset !== offset + record.bytes.length ||
                record.endOffset > 65536 ||
                hash(record.bytes) !== record.sha256
              )
                throw new Error('Original observer SSH output differs');
              offset = record.endOffset;
              pieces.push(record.bytes);
              if (channel === 'stdout') stdout = Buffer.concat(pieces);
              else stderr = Buffer.concat(pieces);
            }
          }
          if (!value.originalGroupClosed) throw new Error('Original observer SSH closure unresolved');
          completion = await admission.output.finish();
          const issued = readOriginalExecutionCompletion(admission.output, completion);
          if (
            !equal(issued.identity, admission.identity) ||
            issued.directory !== root ||
            completion.stdout.bytes !== stdout.length ||
            completion.stderr.bytes !== stderr.length ||
            completion.stdout.sha256 !== hash(stdout) ||
            completion.stderr.sha256 !== hash(stderr)
          )
            throw new Error('Original observer SSH completion differs');
          producerClosed = true;
        } catch (error) {
          failure = error;
        }
        await persist('ssh-capture.private.json', {
          schemaVersion: 1,
          kind: 'original-observer-ssh-capture',
          capture: value,
          completion,
          stdoutSha256: hash(stdout),
          stderrSha256: hash(stderr),
          complete: !failure && !!completion,
          cloudOperationalQualified: false,
          ...(failure ? { errorType: failure instanceof Error ? failure.name : typeof failure } : {}),
        });
        if (failure) throw failure;
      },
    };
    try {
      const execute = await signalFreeGcpObserverSshExecutor(policy, command);
      await recorder.begin();
      let result: Awaited<ReturnType<typeof execute>>;
      try {
        result = await execute({ cwd: root, args: [...original.args], env: { LC_ALL: 'C' } });
      } finally {
        recorder.finished(execute);
      }
      await readOriginalGcpObserverSshCommand(command);
      if (
        result.code !== 0 ||
        !capture ||
        !completion ||
        !capture.submitted ||
        capture.actualExitCode !== 0 ||
        capture.reason ||
        !producerClosed
      )
        throw new Error('Original observer SSH peer not verified; private diagnostics retained');
      let clock: Readonly<GcpObserverClockCandidate>;
      try {
        clock = inspectGcpObserverPeerClock(stdout, {
          challenge: original.challenge,
          instanceId: original.instanceId,
          sourceStartedMs: capture.invocationStartedMs,
          sourceFinishedMs: capture.finishedMs,
        });
      } catch (cause) {
        throw new Error('Original observer SSH peer not verified; clock diagnostics retained', { cause });
      }
      await persist('ssh-proof.private.json', {
        schemaVersion: 1,
        kind: 'original-observer-ssh-proof',
        instanceId: original.instanceId,
        stdoutSha256: hash(stdout),
        challengeMatched: true,
        clock,
        cloudOperationalQualified: false,
      });
      const read = async () => {
        try {
          await guard();
          if (linuxMonotonicMs() - clock.sourceStartedMs > 300000)
            throw new Error('Original observer clock evidence is stale');
          await readOriginalGcpObserverSshCommand(command);
          for (const input of retained)
            assertSameOriginalInput(input, (await readOwnedInstalledInput(input.path)).binding);
          return Object.freeze({
            instanceId: original.instanceId,
            challengeMatched: true as const,
            clock,
            cloudOperationalQualified: false as const,
          });
        } catch (error) {
          retired = true;
          throw error;
        }
      };
      const reference: OriginalVerifiedGcpObserverPeer = Object.freeze({
        schemaVersion: 1,
        kind: 'original-verified-gcp-observer-peer-reference',
      });
      origins.set(reference, { read, command, callback: original.callback });
      await read();
      return reference;
    } catch (error) {
      try {
        await persist('ssh-failure.private.json', {
          schemaVersion: 1,
          kind: 'original-observer-ssh-failure',
          errorType: error instanceof Error ? error.name : typeof error,
          cloudOperationalQualified: false,
        });
      } catch (retention) {
        throw new AggregateError([error, retention], 'Original SSH failure retention unresolved');
      }
      throw error;
    }
  };
  const port = Object.freeze({
    probe(): Promise<OriginalVerifiedGcpObserverPeer> {
      if (retired) return Promise.reject(new Error('Original observer SSH peer retired'));
      if (used) return Promise.reject(new Error('Original observer SSH probe is single-use'));
      used = true;
      pending = probe();
      return pending;
    },
    close(): Promise<void> {
      if (!closure)
        closure = (async () => {
          if (pending) await pending.catch(() => undefined);
          retired = true;
          await guardRoot();
          try {
            await lstat(join(root, '.terraform-executor-lock'));
            throw new Error('Original observer SSH closure unresolved; lock preserved');
          } catch (error) {
            if (!(error instanceof Error) || (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          }
          if (producerSeen && !producerClosed) throw new Error('Original observer SSH producer closure unresolved');
        })();
      return closure;
    },
  });
  bindOriginalAccessReaderCapture(port, recorder);
  return port;
}
