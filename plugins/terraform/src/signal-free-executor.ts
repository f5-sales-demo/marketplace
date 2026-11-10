import { createHash, randomUUID } from 'node:crypto';
import { constants, watch } from 'node:fs';
import { lstat, mkdir, open, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { acquireProcessLock, assertExecutorGroupClosed } from '../../platform/src/ce/process-lock';
import { type TerraformFailureCategory, terraformFailureCategories } from './failure';
import { originalLoaderAlternatives } from './installed-gcp-invocation';
import { linuxMonotonicMs } from './linux-clock';
import { bindOriginalExecutionOutput, type OriginalExecutionOutput } from './original-output-stream';
import {
  assertFinalReaderReserve,
  type FinalReaderReserve,
  type FinalReaderReserveSnapshot,
  inspectFinalReaderReserve,
} from './reader-final-reserve';
import type { Executor } from './runner';

type Reason = 'startup' | 'deadline' | 'cancelled' | 'input-changed' | 'output-limit';
export interface ExecutionCaptureAdmission {
  readonly output: OriginalExecutionOutput;
  readonly directory: string;
  readonly args: readonly string[];
  readonly identity: Readonly<{ pid: number; group: number; start: string; boot: string }>;
  readonly stdoutPath: string;
  readonly stderrPath: string;
  readonly originalStartMs: number;
  readonly originalDeadlineMs: number;
  readonly startupDeadlineMs: number;
}
export interface FinalExecutionCapture {
  readonly inheritedReaderReserve?: FinalReaderReserveSnapshot;
  readonly identity?: ExecutionCaptureAdmission['identity'];
  invocationStartedMs: number;
  finalStartedMs: number;
  finalDeadlineMs: number;
  finishedMs: number;
  originalDeadlineMs: number;
  stdoutPath: string;
  stderrPath: string;
  pid?: number;
  submitted: boolean;
  actualExitCode: number | null;
  originalGroupClosed: boolean;
  signalsSent: false;
  reason?: Reason;
  readonly inputFailureEvidence?: Readonly<{ schemaVersion: 1; path: string; sha256: string }>;
}
interface ExecutableBinding {
  path: string;
  sha256: string;
}
export interface SignalFreeExecutionPolicy {
  python: ExecutableBinding;
  executable: ExecutableBinding;
  originalStartMs: number;
  originalDeadlineMs: number;
  /** Server-owned lifetime guard; must retain the original input monitor and owner. */
  assertOriginal(): Promise<void>;
  /** Start trusted readers against the verified gated identity before command release.
   * Failure or late completion prevents submission. Pending startup must settle
   * before final capture can prove reader closure; its original reserve cannot reset.
   */
  beforeRelease?(admission: ExecutionCaptureAdmission): Promise<void>;
  /** Retain final evidence and independently close original readers before resolving.
   * Returning does not itself establish guest/cloud acceptance.
   */
  finalCapture(capture: FinalExecutionCapture): Promise<void>;
  timeoutMs?: number;
  startupTimeoutMs?: number;
  maxOutputBytes?: number;
}
const hash = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
const now = linuxMonotonicMs;
const pause = () => Bun.sleep(25);
export const signalFreeBootstrapSource = `import hashlib,json,os,sys,time
import psutil
os.umask(0o077)
os.setsid()
pid=os.getpid()
raw=open('/proc/self/stat').read()
fields=raw[raw.rfind(')')+2:].split()
boot=open('/proc/sys/kernel/random/boot_id').read().strip()
process=psutil.Process(pid)
exe=os.readlink('/proc/self/exe')
ticks=os.sysconf('SC_CLK_TCK')
btime=int(next(line.split()[1] for line in open('/proc/stat') if line.startswith('btime ')))
birth=btime+int(fields[19])/ticks
if process.pid!=pid or process.ppid()!=int(fields[1]) or process.uids().real!=os.getuid() or abs(process.create_time()-birth)>1/ticks:
 raise RuntimeError('Independent original process identity differs')
value={'pid':pid,'group':int(fields[2]),'start':fields[19],'boot':boot,'ppid':int(fields[1]),'pythonSha256':hashlib.sha256(open(exe,'rb').read()).hexdigest(),'sdkCreateTime':process.create_time(),'monotonicMs':time.monotonic_ns()//1000000}
partial=sys.argv[1]+'.partial'
with open(partial,'x') as out:
 json.dump(value,out);out.flush();os.fsync(out.fileno())
os.chmod(partial,0o400)
os.link(partial,sys.argv[1])
os.unlink(partial)
if sys.stdin.buffer.readline(4)!=b'go\\n' or sys.stdin.buffer.read(1)!=b'': sys.exit(73)
os.execve(sys.argv[2],[sys.argv[2],*sys.argv[3:]],dict(os.environ))
`;

async function pinned(binding: ExecutableBinding) {
  if (
    !binding ||
    !isAbsolute(binding.path) ||
    resolve(binding.path) !== binding.path ||
    !/^[a-f0-9]{64}$/.test(binding.sha256)
  )
    throw new Error('Reviewed original executable binding required');
  const canonical = await realpath(binding.path);
  const original = await stat(canonical, { bigint: true });
  const link = await lstat(binding.path, { bigint: true });
  if (
    !original.isFile() ||
    original.uid !== BigInt(process.getuid?.() ?? -1) ||
    original.nlink !== 1n ||
    (original.mode & 0o022n) !== 0n ||
    (original.mode & 0o111n) === 0n ||
    hash(await readFile(canonical)) !== binding.sha256
  )
    throw new Error('Owned pinned original executable required');
  let changed = false;
  const watcher = watch(canonical, { persistent: false }, () => {
    changed = true;
  });
  const parent = watch(dirname(binding.path), { persistent: false }, (_event, name) => {
    if (!name || name.toString() === binding.path.split('/').at(-1)) changed = true;
  });
  watcher.on('error', () => {
    changed = true;
  });
  parent.on('error', () => {
    changed = true;
  });
  return {
    canonical,
    async require() {
      const current = await stat(canonical, { bigint: true });
      const currentLink = await lstat(binding.path, { bigint: true });
      if (
        changed ||
        (await realpath(binding.path)) !== canonical ||
        ['dev', 'ino', 'uid', 'mode', 'size', 'mtimeNs', 'ctimeNs'].some(
          (key) => current[key as keyof typeof current] !== original[key as keyof typeof original],
        ) ||
        currentLink.ino !== link.ino ||
        currentLink.ctimeNs !== link.ctimeNs
      )
        throw new Error('Original executable lifetime changed');
    },
    close() {
      watcher.close();
      parent.close();
    },
  };
}

/** Signal-free execution for a trusted server policy. Never resumes or replaces an original child. */
export function signalFreeTerraformExecutor(input: SignalFreeExecutionPolicy): Executor {
  return originalExecutor(input);
}

/** Only isolated Python readers can consume an already admitted parent's final reserve.
 * The caller must bind its shipped reader sources and request through assertOriginal.
 * This is a compiled capture adapter, never a Terraform tool argument or budget renewal.
 */
export function signalFreeFinalReaderExecutor(input: SignalFreeExecutionPolicy, reserve: FinalReaderReserve): Executor {
  const original = inspectFinalReaderReserve(reserve);
  if (input.python.path !== input.executable.path || input.python.sha256 !== input.executable.sha256)
    throw new Error('Original final readers require the same pinned interpreter');
  if (input.originalStartMs !== original.originalStartMs || input.originalDeadlineMs !== original.originalDeadlineMs)
    throw new Error('Original parent reader operation budget differs');
  if (input.timeoutMs !== undefined && input.timeoutMs > 60_000)
    throw new Error('Final reader commands have a sixty-second limit');
  const execute = originalExecutor({ ...input, timeoutMs: input.timeoutMs ?? 60_000 }, reserve);
  return async (invocation) => {
    if (
      invocation.args.length < 3 ||
      invocation.args[0] !== '-I' ||
      invocation.args[1] !== '-B' ||
      !isAbsolute(invocation.args[2])
    )
      throw new Error('Exact isolated final reader script arguments required');
    return execute(invocation);
  };
}

function originalExecutor(input: SignalFreeExecutionPolicy, reserve?: FinalReaderReserve): Executor {
  const policy = { ...input, python: { ...input.python }, executable: { ...input.executable } };
  const inherited = reserve ? inspectFinalReaderReserve(reserve) : undefined;
  const executionDeadline = inherited?.finalDeadlineMs ?? policy.originalDeadlineMs;
  const assertOriginal = async () => {
    await policy.assertOriginal();
    if (reserve) await assertFinalReaderReserve(reserve);
  };
  const beforeRelease = policy.beforeRelease;
  if (
    process.platform !== 'linux' ||
    !Number.isSafeInteger(policy.originalStartMs) ||
    !Number.isSafeInteger(policy.originalDeadlineMs) ||
    policy.originalStartMs < 0 ||
    policy.originalDeadlineMs !== policy.originalStartMs + 7_200_000 ||
    typeof policy.assertOriginal !== 'function' ||
    (beforeRelease !== undefined && typeof beforeRelease !== 'function') ||
    typeof policy.finalCapture !== 'function'
  )
    throw new Error('Original Linux operation budget and trusted lifetime policy required');
  const timeout = policy.timeoutMs ?? 7_200_000;
  const startup = policy.startupTimeoutMs ?? 15_000;
  const maximum = policy.maxOutputBytes ?? 64 * 1024 * 1024;
  if (![timeout, startup, maximum].every((value) => Number.isSafeInteger(value) && value > 0) || startup > 15_000)
    throw new Error('Bounded original execution limits required');
  return async ({ cwd, args: inputArgs, env: inputEnvironment, signal }) => {
    const args = [...inputArgs];
    const env = { ...inputEnvironment };
    if (originalLoaderAlternatives.some((key) => env[key] !== undefined))
      throw new Error('Original execution loader substitution refused');
    const began = now();
    if (began < policy.originalStartMs || began >= executionDeadline)
      throw new Error('Original operation deadline exhausted');
    signal?.throwIfAborted();
    await assertOriginal();
    const directory = await lstat(cwd);
    if (
      !directory.isDirectory() ||
      directory.isSymbolicLink() ||
      directory.uid !== process.getuid?.() ||
      (directory.mode & 0o077) !== 0 ||
      !args.length ||
      args.some((arg) => typeof arg !== 'string' || arg.includes('\0'))
    )
      throw new Error('Original private command workspace and exact arguments required');
    const python = await pinned(policy.python);
    let executable: Awaited<ReturnType<typeof pinned>>;
    try {
      executable = await pinned(policy.executable);
    } catch (error) {
      python.close();
      throw error;
    }
    const root = join(cwd, 'executor-diagnostics', randomUUID());
    await mkdir(root, { recursive: true, mode: 0o700 });
    const script = join(root, 'gate.py');
    const bootstrap = join(root, 'bootstrap.json');
    await writeFile(script, signalFreeBootstrapSource, { flag: 'wx', mode: 0o400 });
    const stdoutPath = join(root, 'stdout.private');
    const stderrPath = join(root, 'stderr.private');
    const stdout = await open(
      stdoutPath,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
      0o600,
    );
    const stderr = await open(
      stderrPath,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
      0o600,
    );
    const outIdentity = await stdout.stat({ bigint: true });
    const errIdentity = await stderr.stat({ bigint: true });
    const lock = join(cwd, '.terraform-executor-lock');
    let release: (() => Promise<void>) | undefined;
    let child: Bun.Subprocess<'pipe', number, number> | undefined;
    let submitted = false;
    let originalIdentity: ExecutionCaptureAdmission['identity'] | undefined;
    let reason: Reason | undefined;
    let inputFailureEvidence: FinalExecutionCapture['inputFailureEvidence'];
    let inputFailureObserved = false;
    const inputPersistenceErrors: unknown[] = [];
    let finalStarted: number | undefined;
    let actualExitCode: number | null = null;
    let groupClosed = false;
    let captureClosed = false;
    let captureStartup: Promise<void> | undefined;
    let originalOutput: Awaited<ReturnType<typeof bindOriginalExecutionOutput>> | undefined;
    const fail = (value: Reason) => {
      if (!reason) reason = value;
      finalStarted ??= now();
    };
    const retainInputFailure = async (phase: string, error: unknown) => {
      fail('input-changed');
      if (inputFailureObserved) return;
      inputFailureObserved = true;
      const path = join(root, 'input-failure.private.json');
      const raw = JSON.stringify({
        schemaVersion: 1,
        kind: 'original-executor-input-failure',
        phase,
        identity: originalIdentity,
        pid: child?.pid,
        originalStartMs: policy.originalStartMs,
        originalDeadlineMs: policy.originalDeadlineMs,
        invocationStartedMs: began,
        finalStartedMs: finalStarted,
        observedMs: now(),
        error:
          error instanceof Error
            ? { name: error.name, message: error.message, stack: error.stack }
            : { type: typeof error, value: typeof error === 'string' ? error : undefined },
        signalsSent: false,
      });
      try {
        await writeFile(path, raw, { mode: 0o400, flag: 'wx' });
        inputFailureEvidence = Object.freeze({ schemaVersion: 1, path, sha256: hash(Buffer.from(raw)) });
      } catch (persistenceError) {
        inputPersistenceErrors.push(
          new AggregateError([error, persistenceError], 'Original input failure and persistence unresolved'),
        );
      }
    };
    const check = async () => {
      if (signal?.aborted) fail('cancelled');
      if (now() >= Math.min(began + timeout, executionDeadline)) fail('deadline');
      let inputPhase = 'python-executable-check';
      try {
        await python.require();
        inputPhase = 'command-executable-check';
        await executable.require();
        inputPhase = 'original-input-check';
        await assertOriginal();
      } catch (error) {
        await retainInputFailure(inputPhase, error);
      }
      for (const [path, original] of [
        [stdoutPath, outIdentity],
        [stderrPath, errIdentity],
      ] as const) {
        let current: typeof original;
        try {
          current = await lstat(path, { bigint: true });
        } catch (error) {
          // Persist the cause without suppressing the original final reserve.
          await retainInputFailure(path === stdoutPath ? 'stdout-path-inspection' : 'stderr-path-inspection', error);
          continue;
        }
        if (
          current.ino !== original.ino ||
          current.dev !== original.dev ||
          current.uid !== original.uid ||
          current.nlink !== 1n
        )
          await retainInputFailure(
            path === stdoutPath ? 'stdout-identity-check' : 'stderr-identity-check',
            new Error('Original output file identity changed'),
          );
        if (current.size > maximum) fail('output-limit');
      }
    };
    try {
      child = Bun.spawn([policy.python.path, '-I', '-B', script, bootstrap, policy.executable.path, ...args], {
        cwd,
        env: { ...env },
        stdin: 'pipe',
        stdout: stdout.fd,
        stderr: stderr.fd,
      });
      const childDone = child.exited.then((code) => {
        actualExitCode = code;
      });
      const startupDeadline = Math.min(began + startup, executionDeadline);
      while (!(await Bun.file(bootstrap).exists()) && actualExitCode === null && !reason) {
        await check();
        if (now() >= startupDeadline) fail('startup');
        await pause();
      }
      if (!reason && actualExitCode === null) {
        const evidence = JSON.parse(await readFile(bootstrap, 'utf8')) as {
          pid: number;
          group: number;
          ppid: number;
          pythonSha256: string;
          start: string;
          boot: string;
          monotonicMs: number;
        };
        const raw = await readFile(`/proc/${child.pid}/stat`, 'utf8');
        const fields = raw
          .slice(raw.lastIndexOf(') ') + 2)
          .trim()
          .split(/\s+/);
        if (
          evidence.pid !== child.pid ||
          evidence.group !== child.pid ||
          evidence.ppid !== process.pid ||
          evidence.pythonSha256 !== policy.python.sha256 ||
          evidence.start !== fields[19] ||
          evidence.boot !== (await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim() ||
          !Number.isSafeInteger(evidence.monotonicMs) ||
          evidence.monotonicMs > now() ||
          now() - evidence.monotonicMs >= 15_000
        )
          fail('startup');
        else {
          originalIdentity = Object.freeze({
            pid: evidence.pid,
            group: evidence.group,
            start: evidence.start,
            boot: evidence.boot,
          });
          release = await acquireProcessLock(lock, child.pid, { trackProcessGroup: true });
          await check();
          if (now() >= startupDeadline) fail('startup');
          if (!reason && beforeRelease) {
            captureStartup = Promise.resolve().then(async () => {
              if (!originalIdentity) throw new Error('Original execution identity unavailable');
              originalOutput = await bindOriginalExecutionOutput({
                identity: originalIdentity,
                stdout: { path: stdoutPath, writer: stdout },
                stderr: { path: stderrPath, writer: stderr },
                maximum,
                assertInputs: async () => {
                  await python.require();
                  await executable.require();
                  await assertOriginal();
                  const readerDeadline =
                    inherited?.finalDeadlineMs ??
                    (finalStarted === undefined ? executionDeadline : finalStarted + 300_000);
                  if (now() >= readerDeadline) throw new Error('Original output capture deadline exhausted');
                },
                originalGroupClosed: async () => {
                  if (actualExitCode === null) return false;
                  try {
                    await assertExecutorGroupClosed(lock);
                    return true;
                  } catch (error) {
                    if (error instanceof Error && error.message === 'Original executor process group remains live')
                      return false;
                    throw error;
                  }
                },
              });
              const admission: ExecutionCaptureAdmission = Object.freeze({
                output: originalOutput.output,
                directory: cwd,
                args: Object.freeze([...args]),
                identity: Object.freeze({
                  pid: evidence.pid,
                  group: evidence.group,
                  start: evidence.start,
                  boot: evidence.boot,
                }),
                stdoutPath,
                stderrPath,
                originalStartMs: policy.originalStartMs,
                originalDeadlineMs: policy.originalDeadlineMs,
                startupDeadlineMs: startupDeadline,
              });
              await beforeRelease(admission);
            });
            let startupTimer: ReturnType<typeof setTimeout> | undefined;
            try {
              await Promise.race([
                captureStartup,
                new Promise<never>((_resolve, reject) => {
                  startupTimer = setTimeout(
                    () => reject(new Error('Original capture startup deadline exhausted')),
                    Math.max(0, startupDeadline - now()),
                  );
                }),
              ]);
            } catch {
              fail('startup');
            } finally {
              if (startupTimer) clearTimeout(startupTimer);
            }
            await check();
            if (now() >= startupDeadline || actualExitCode !== null) fail('startup');
          }
        }
      } else if (!reason) fail('startup');
      if (!reason) {
        await writeFile(
          join(root, 'submission.private.json'),
          JSON.stringify({
            schemaVersion: 1,
            pid: child.pid,
            originalStartMs: policy.originalStartMs,
            originalDeadlineMs: policy.originalDeadlineMs,
            args,
            executable: policy.executable,
          }),
          { mode: 0o400, flag: 'wx' },
        );
        submitted = true; // A failed write/flush is ambiguous and must never authorize resubmission.
        child.stdin?.write('go\n');
        await child.stdin?.flush();
      }
      await child.stdin?.end(); // EOF also closes an unreleased bootstrap without any signal.
      while (actualExitCode === null && !reason) {
        await check();
        if (finalStarted !== undefined && now() >= finalStarted + 300_000) break;
        await pause();
      }
      if (actualExitCode !== null) await childDone;
      finalStarted ??= now();
      await check();
      // Capture starts at the original failure boundary. A live group cannot
      // spend the five-minute reserve before the collector is invoked.
      if (release && actualExitCode !== null) {
        try {
          await assertExecutorGroupClosed(lock);
          groupClosed = true;
        } catch (error) {
          if (!(error instanceof Error) || error.message !== 'Original executor process group remains live')
            await retainInputFailure('original-group-closure', error);
        }
      } else if (!release && actualExitCode !== null) groupClosed = true;
      const capture: FinalExecutionCapture = {
        invocationStartedMs: began,
        finalStartedMs: inherited?.finalStartedMs ?? finalStarted,
        finalDeadlineMs: inherited?.finalDeadlineMs ?? finalStarted + 300_000,
        ...(inherited ? { inheritedReaderReserve: inherited } : {}),
        originalDeadlineMs: policy.originalDeadlineMs,
        finishedMs: now(),
        stdoutPath,
        stderrPath,
        pid: child.pid,
        identity: originalIdentity,
        submitted,
        actualExitCode,
        originalGroupClosed: groupClosed,
        signalsSent: false,
        reason,
        ...(inputFailureEvidence ? { inputFailureEvidence } : {}),
      };
      const finalErrors: unknown[] = [];
      try {
        await writeFile(join(root, 'final.private.json'), JSON.stringify(capture), { mode: 0o400, flag: 'wx' });
      } catch (error) {
        // Missing durable metadata is a refusal, but cannot suppress the
        // matching collector's original final capture reserve.
        finalErrors.push(error);
      }
      let captureTimer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          (async () => {
            // An abandoned startup callback can still open readers later. Do not
            // accept closure evidence until that same callback has finished.
            await captureStartup?.catch(() => undefined);
            if (now() >= capture.finalDeadlineMs) throw new Error('Original final capture deadline exhausted');
            await policy.finalCapture(Object.freeze(capture));
          })(),
          new Promise<never>((_resolve, reject) => {
            captureTimer = setTimeout(
              () => reject(new Error('Original final capture deadline exhausted')),
              Math.max(0, capture.finalDeadlineMs - now()),
            );
          }),
        ]);
        captureClosed = true;
      } catch (error) {
        finalErrors.push(error);
      } finally {
        if (captureTimer) clearTimeout(captureTimer);
      }
      // Observe natural completion only after the collector had its original
      // reserve. Neither action completion nor capture completion resets it.
      while (!groupClosed && now() < capture.finalDeadlineMs) {
        await check();
        if (actualExitCode !== null) {
          await childDone;
          if (release) {
            try {
              await assertExecutorGroupClosed(lock);
              groupClosed = true;
            } catch (error) {
              if (!(error instanceof Error) || error.message !== 'Original executor process group remains live') {
                finalErrors.push(error);
                break;
              }
            }
          } else groupClosed = true;
        }
        if (!groupClosed) await pause();
      }
      try {
        await writeFile(
          join(root, 'completion.private.json'),
          JSON.stringify({
            ...capture,
            finishedMs: now(),
            actualExitCode,
            originalGroupClosed: groupClosed,
            captureClosed,
            reason,
            ...(inputFailureEvidence ? { inputFailureEvidence } : {}),
          }),
          { mode: 0o400, flag: 'wx' },
        );
      } catch (error) {
        finalErrors.push(error);
      }
      finalErrors.push(...inputPersistenceErrors);
      if (!groupClosed || actualExitCode === null) {
        const closureError = new Error('Original executor closure unresolved; lock remains held');
        if (finalErrors.length)
          throw new AggregateError([...finalErrors, closureError], 'Original final capture evidence unresolved');
        throw closureError;
      }
      if (finalErrors.length === 1) throw finalErrors[0];
      if (finalErrors.length) throw new AggregateError(finalErrors, 'Original final capture evidence unresolved');
      if (release) {
        await release();
        release = undefined;
      }
      if (reason) return { code: 1, stdout: '', failureCategory: 'unknown' };
      const stderrBytes = await readFile(stderrPath);
      const categories = new Set(terraformFailureCategories(stderrBytes.toString('utf8')));
      const category: TerraformFailureCategory = categories.size === 1 ? [...categories][0] : 'unknown';
      return {
        code: actualExitCode,
        stdout: await readFile(stdoutPath, 'utf8'),
        ...(actualExitCode ? { failureCategory: category } : {}),
      };
    } catch (error) {
      const failures: unknown[] = [error];
      if (child && !submitted && actualExitCode === null) {
        try {
          await child.stdin.end();
        } catch (closureError) {
          failures.push(closureError);
        }
      }
      if (release) {
        try {
          await writeFile(
            join(lock, 'capture-unresolved.json'),
            JSON.stringify({
              schemaVersion: 1,
              pid: child?.pid,
              originalStartMs: policy.originalStartMs,
              originalDeadlineMs: policy.originalDeadlineMs,
              finalStartedMs: finalStarted,
              errorType: error instanceof Error ? error.name : 'unknown',
            }),
            { mode: 0o400, flag: 'wx' },
          );
        } catch (persistenceError) {
          failures.push(persistenceError);
        }
      }
      if (failures.length > 1) throw new AggregateError(failures, 'Original executor evidence unresolved');
      throw error;
    } finally {
      // Only the verified path above releases the claim. Errors retain it even
      // when readers and the original group closed but required receipts did not.
      await originalOutput?.close();
      await stdout.close();
      await stderr.close();
      python.close();
      executable.close();
    }
  };
}
