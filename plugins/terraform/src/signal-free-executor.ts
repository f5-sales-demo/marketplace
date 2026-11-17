import { createHash, randomUUID } from 'node:crypto';
import { constants, watch } from 'node:fs';
import { lstat, mkdir, open, readFile, readlink, realpath, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { acquireProcessLock, assertExecutorGroupClosed } from '../../platform/src/ce/process-lock';
import { type TerraformFailureCategory, terraformFailureCategories } from './failure';
import { type OriginalGcpKeyScanCommand, readOriginalGcpKeyScanCommand } from './gcp-keyscan-command';
import {
  assertOriginalGcpObserverClientDeliveryIdentity,
  assertOriginalGcpObserverClientDeliveryInputs,
  checkoutOriginalGcpObserverClientDeliveryCommand,
  readOriginalGcpObserverClientDeliveryCommand,
} from './gcp-observer-client-delivery-command';
import {
  assertOriginalGcpObserverSshCommandIdentity,
  assertOriginalGcpObserverSshCommandInputs,
  readOriginalGcpObserverSshCommand,
} from './gcp-observer-ssh-command';
import { freezeAdmittedCaptureInputs } from './installed-capture-context';
import { originalLoaderAlternatives } from './installed-gcp-invocation';
import { readOwnedInstalledInput } from './installed-runtime';
import { linuxMonotonicMs } from './linux-clock';
import { assertSameOriginalInput, monitorOriginalInputs, type OriginalInputBinding } from './original-input-monitor';
import { bindOriginalExecutionOutput, type OriginalExecutionOutput } from './original-output-stream';
import {
  assertFinalReaderReserve,
  type FinalReaderReserve,
  type FinalReaderReserveSnapshot,
  inspectFinalReaderReserve,
} from './reader-final-reserve';
import type { Executor } from './runner';

type Reason = 'startup' | 'deadline' | 'cancelled' | 'input-changed' | 'output-limit';
export interface OriginalExecutionStdinSnapshot {
  readonly schemaVersion: 1;
  readonly kind: 'sealed-original-file-stdin';
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly sealed: true;
  readonly snapshotFd: number;
  readonly dev: string;
  readonly ino: string;
}
export interface ExecutionCaptureAdmission {
  readonly stdin?: OriginalExecutionStdinSnapshot;
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
export interface StartupFailureEvidence {
  readonly schemaVersion: 1;
  readonly phase: 'callback' | 'deadline';
  readonly path: string;
  readonly sha256: string;
}
export interface FinalExecutionCapture {
  readonly stdin?: OriginalExecutionStdinSnapshot;
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
  readonly startupFailureEvidence?: readonly StartupFailureEvidence[];
}
interface ExecutableBinding {
  path: string;
  sha256: string;
}
export interface SignalFreeExecutionPolicy {
  /** Server-owned, complete original input binding. Command data never shares
   * the release-control stream and cannot be selected through tool arguments. */
  readonly stdin?: OriginalInputBinding;
  python: ExecutableBinding;
  executable: ExecutableBinding;
  originalStartMs: number;
  originalDeadlineMs: number;
  /** Server-owned lifetime guard; must retain the original input monitor and owner. */
  assertOriginal(): Promise<void>;
  /** Compiled polling guard over the same admitted inputs. Full release checks stay mandatory. */
  assertOriginalIdentity?(): Promise<void>;
  /** Full byte check independent of the expired operation clock; required with identity polling. */
  assertFinalInputs?(): Promise<void>;
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
export const signalFreeBootstrapSource = `import fcntl,hashlib,json,os,stat,sys,time
import psutil
# Stable Linux UAPI: linux/fcntl.h, F_LINUX_SPECIFIC_BASE (1024) + 9/+10.
LINUX_F_ADD_SEALS=1033
LINUX_F_GET_SEALS=1034
LINUX_ALL_INPUT_SEALS=0x0001|0x0002|0x0004|0x0008
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
snapshot_fd=None
stdin_value=None
stdin_spec=sys.argv[1]+'.stdin-binding.json'
if os.path.lexists(stdin_spec):
 meta=os.lstat(stdin_spec)
 if not stat.S_ISREG(meta.st_mode) or meta.st_uid!=os.getuid() or meta.st_nlink!=1 or meta.st_mode&0o777!=0o400 or not 0<meta.st_size<=65536:
  raise RuntimeError('Original stdin metadata ownership differs')
 with open(stdin_spec,'rb') as source:
  binding=json.load(source)
 path=binding['path']
 expected=binding['expectedIdentity']
 parent_expected=binding['expectedParentIdentity']
 if not os.path.isabs(path) or os.path.realpath(path)!=path:
  raise RuntimeError('Canonical original stdin file required')
 parent=os.stat(os.path.dirname(path))
 if any(str(getattr(parent,'st_'+key))!=parent_expected[key] for key in ('dev','ino','uid','mode')):
  raise RuntimeError('Original stdin parent differs')
 source_fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
 try:
  source_stat=os.fstat(source_fd)
  def same_source(value):
   fields={'dev':value.st_dev,'ino':value.st_ino,'uid':value.st_uid,'nlink':value.st_nlink,'mode':value.st_mode,'size':value.st_size,'mtimeNs':value.st_mtime_ns,'ctimeNs':value.st_ctime_ns}
   return all(str(fields[key])==expected[key] for key in fields)
  if not stat.S_ISREG(source_stat.st_mode) or source_stat.st_uid!=os.getuid() or source_stat.st_nlink!=1 or source_stat.st_mode&0o777!=0o400 or not 0<source_stat.st_size<=16777216 or not same_source(source_stat):
   raise RuntimeError('Original stdin file identity differs')
  snapshot_fd=os.memfd_create('xcsh-original-stdin',os.MFD_CLOEXEC|os.MFD_ALLOW_SEALING)
  digest=hashlib.sha256()
  total=0
  while chunk:=os.read(source_fd,65536):
   total+=len(chunk)
   if total>16777216: raise RuntimeError('Original stdin snapshot exceeds bound')
   digest.update(chunk)
   offset=0
   while offset<len(chunk): offset+=os.write(snapshot_fd,chunk[offset:])
  parent_after=os.stat(os.path.dirname(path))
  if total!=source_stat.st_size or digest.hexdigest()!=binding['sha256'] or not same_source(os.fstat(source_fd)) or not same_source(os.lstat(path)) or any(str(getattr(parent_after,'st_'+key))!=parent_expected[key] for key in ('dev','ino','uid','mode')):
   raise RuntimeError('Original stdin bytes or parent changed during snapshot')
  seals=LINUX_ALL_INPUT_SEALS
  fcntl.fcntl(snapshot_fd,LINUX_F_ADD_SEALS,seals)
  if fcntl.fcntl(snapshot_fd,LINUX_F_GET_SEALS)!=seals:
   raise RuntimeError('Original stdin snapshot is not sealed')
  os.lseek(snapshot_fd,0,os.SEEK_SET)
  snapshot_stat=os.fstat(snapshot_fd)
  stdin_value={'schemaVersion':1,'kind':'sealed-original-file-stdin','path':path,'sha256':digest.hexdigest(),'bytes':total,'sealed':True,'snapshotFd':snapshot_fd,'dev':str(snapshot_stat.st_dev),'ino':str(snapshot_stat.st_ino)}
 finally:
  os.close(source_fd)
value={'pid':pid,'group':int(fields[2]),'start':fields[19],'boot':boot,'ppid':int(fields[1]),'pythonSha256':hashlib.sha256(open(exe,'rb').read()).hexdigest(),'sdkCreateTime':process.create_time(),'monotonicMs':time.monotonic_ns()//1000000}
if stdin_value is not None: value['stdin']=stdin_value
partial=sys.argv[1]+'.partial'
with open(partial,'x') as out:
 json.dump(value,out);out.flush();os.fsync(out.fileno())
os.chmod(partial,0o400)
os.link(partial,sys.argv[1])
os.unlink(partial)
if sys.stdin.buffer.readline(4)!=b'go\\n' or sys.stdin.buffer.read(1)!=b'': sys.exit(73)
if snapshot_fd is not None:
 os.dup2(snapshot_fd,0,inheritable=True)
 os.close(snapshot_fd)
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

/** Original guest delivery only. Caller arguments never select another
 * executable, target, input, clock or original submission. */
export async function signalFreeGcpObserverClientDeliveryExecutor(
  input: SignalFreeExecutionPolicy,
  command: unknown,
): Promise<Executor> {
  const source = await readOriginalGcpObserverClientDeliveryCommand(command);
  if (
    input.python.path !== source.python.path ||
    input.python.sha256 !== source.python.sha256 ||
    input.executable.path !== source.executable.path ||
    input.executable.sha256 !== source.executable.sha256 ||
    input.originalStartMs !== source.callback.original.budget.start ||
    input.originalDeadlineMs !== source.callback.original.budget.deadline
  )
    throw new Error('Original observer delivery executable or operation budget differs');
  if (
    (input.timeoutMs ?? 60000) > 60000 ||
    (input.startupTimeoutMs ?? 15000) > 15000 ||
    (input.maxOutputBytes ?? 65536) > 65536
  )
    throw new Error('Original observer delivery limits cannot be extended');
  if (input.stdin) assertSameOriginalInput(source.stdin, input.stdin);
  return async (invocation) => {
    if (JSON.stringify(invocation.args) !== JSON.stringify(source.args))
      throw new Error('Original observer delivery arguments differ');
    await checkoutOriginalGcpObserverClientDeliveryCommand(command);
    const remaining = source.sourceDeadlineMs - now();
    if (remaining <= 0) throw new Error('Original observer delivery deadline exhausted');
    const policy: SignalFreeExecutionPolicy = {
      ...input,
      stdin: source.stdin,
      timeoutMs: Math.min(input.timeoutMs ?? 60000, remaining),
      startupTimeoutMs: input.startupTimeoutMs ?? 15000,
      maxOutputBytes: input.maxOutputBytes ?? 65536,
      assertOriginal: async () => {
        await readOriginalGcpObserverClientDeliveryCommand(command);
        await input.assertOriginal();
      },
      assertOriginalIdentity: async () => {
        await assertOriginalGcpObserverClientDeliveryIdentity(command);
        await (input.assertOriginalIdentity ?? input.assertOriginal)();
      },
      assertFinalInputs: async () => {
        await assertOriginalGcpObserverClientDeliveryInputs(command);
        await (input.assertFinalInputs ?? input.assertOriginal)();
      },
      beforeRelease: async (admission) => {
        await readOriginalGcpObserverClientDeliveryCommand(command);
        if (
          !admission.stdin ||
          admission.stdin.path !== source.stdin.path ||
          admission.stdin.sha256 !== source.stdin.sha256
        )
          throw new Error('Original observer delivery sealed stdin admission differs');
        await input.beforeRelease?.(admission);
      },
      finalCapture: async (capture) => {
        const failures: unknown[] = [];
        try {
          await assertOriginalGcpObserverClientDeliveryInputs(command);
        } catch (error) {
          failures.push(error);
        }
        try {
          await input.finalCapture(capture);
        } catch (error) {
          failures.push(error);
        }
        try {
          await assertOriginalGcpObserverClientDeliveryInputs(command);
        } catch (error) {
          failures.push(error);
        }
        if (failures.length)
          throw new AggregateError(failures, 'Original observer delivery final capture or input retention failed');
      },
    };
    let reserve: FinalReaderReserve | undefined;
    if (source.callback.phase === 'after') {
      reserve = source.callback.reserve;
      if (!reserve) throw new Error('Original final observer delivery reserve required');
      await assertFinalReaderReserve(reserve);
    }
    const execute = originalExecutor(policy, reserve);
    const result = await execute(invocation);
    await assertOriginalGcpObserverClientDeliveryInputs(command);
    return result;
  };
}

/** Only the original, fixed observer proof command may consume this native
 * SSH mapping. It cannot renew a reserve or execute a caller remote command. */
export async function signalFreeGcpObserverSshExecutor(
  input: SignalFreeExecutionPolicy,
  command: unknown,
): Promise<Executor> {
  if (input.stdin !== undefined) throw new Error('Fixed observer proof does not accept command stdin');
  const source = await readOriginalGcpObserverSshCommand(command);
  if (
    input.python.path !== source.python.path ||
    input.python.sha256 !== source.python.sha256 ||
    input.executable.path !== source.executable.path ||
    input.executable.sha256 !== source.executable.sha256 ||
    input.originalStartMs !== source.callback.original.budget.start ||
    input.originalDeadlineMs !== source.callback.original.budget.deadline
  )
    throw new Error('Original observer SSH executable and operation bindings required');
  if (
    (input.timeoutMs ?? 60000) > 60000 ||
    (input.startupTimeoutMs ?? 15000) > 15000 ||
    (input.maxOutputBytes ?? 65536) > 65536
  )
    throw new Error('Original observer SSH command limits required');
  const policy = {
    ...input,
    timeoutMs: input.timeoutMs ?? 60000,
    startupTimeoutMs: input.startupTimeoutMs ?? 15000,
    maxOutputBytes: input.maxOutputBytes ?? 65536,
    assertOriginal: async () => {
      await assertOriginalGcpObserverSshCommandInputs(command);
      await input.assertOriginal();
    },
    assertOriginalIdentity: async () => {
      await assertOriginalGcpObserverSshCommandIdentity(command);
      await (input.assertOriginalIdentity ?? input.assertOriginal)();
    },
    assertFinalInputs: async () => {
      await assertOriginalGcpObserverSshCommandInputs(command);
      await (input.assertFinalInputs ?? input.assertOriginal)();
    },
    beforeRelease: async (admission: ExecutionCaptureAdmission) => {
      await readOriginalGcpObserverSshCommand(command);
      await input.beforeRelease?.(admission);
    },
    finalCapture: async (capture: FinalExecutionCapture) => {
      const errors: unknown[] = [];
      try {
        await readOriginalGcpObserverSshCommand(command);
      } catch (error) {
        errors.push(error);
      }
      try {
        await input.finalCapture(capture);
      } catch (error) {
        errors.push(error);
      }
      try {
        await readOriginalGcpObserverSshCommand(command);
      } catch (error) {
        errors.push(error);
      }
      if (errors.length === 1) throw errors[0];
      if (errors.length) throw new AggregateError(errors, 'Original SSH final ownership or capture failed');
    },
  };
  const reserve = source.callback.phase === 'after' ? source.callback.reserve : undefined;
  if (source.callback.phase === 'after' && !reserve) throw new Error('Original observer SSH final reserve required');
  if (reserve) {
    const inherited = inspectFinalReaderReserve(reserve);
    if (
      inherited.originalStartMs !== input.originalStartMs ||
      inherited.originalDeadlineMs !== input.originalDeadlineMs ||
      (['pid', 'group', 'start', 'boot'] as const).some(
        (key) => inherited.identity[key] !== source.callback.execution.identity[key],
      )
    )
      throw new Error('Original observer SSH parent reserve differs');
  }
  const execute = originalExecutor(policy, reserve);
  return async (invocation) => {
    if (
      JSON.stringify(invocation.args) !== JSON.stringify(source.args) ||
      Object.keys(invocation.env).length !== 1 ||
      invocation.env.LC_ALL !== 'C'
    )
      throw new Error('Exact original observer SSH arguments and environment required');
    return execute(invocation);
  };
}

/** Specific native read mapping. Only an original VM/client/callback-bound
 * command can consume its actual final reserve. Python reader admission stays
 * unchanged; this cannot execute authentication, a caller target or Terraform. */
export async function signalFreeGcpKeyScanExecutor(
  input: SignalFreeExecutionPolicy,
  command: OriginalGcpKeyScanCommand,
): Promise<Executor> {
  if (input.stdin !== undefined) throw new Error('Fixed key scan does not accept command stdin');
  const original = await readOriginalGcpKeyScanCommand(command);
  const callback = original.callback;
  const python = callback.original.inputs.python;
  const sameBinding = (left: ExecutableBinding, right: ExecutableBinding) =>
    left?.path === right?.path && left?.sha256 === right?.sha256;
  if (!python || !sameBinding(input.python, python) || !sameBinding(input.executable, original.executable))
    throw new Error('Original key-scan executable and interpreter bindings required');
  if (
    input.originalStartMs !== callback.original.budget.start ||
    input.originalDeadlineMs !== callback.original.budget.deadline
  )
    throw new Error('Original key-scan operation clocks differ');
  if (
    (input.timeoutMs ?? 60000) > 60000 ||
    (input.startupTimeoutMs ?? 15000) > 15000 ||
    (input.maxOutputBytes ?? 65536) > 65536
  )
    throw new Error('Original key-scan sixty-second command, fifteen-second startup and output bounds required');
  const policy = {
    ...input,
    timeoutMs: input.timeoutMs ?? 60000,
    startupTimeoutMs: input.startupTimeoutMs ?? 15000,
    maxOutputBytes: input.maxOutputBytes ?? 65536,
    assertOriginal: async () => {
      await readOriginalGcpKeyScanCommand(command);
      await input.assertOriginal();
    },
    assertOriginalIdentity: async () => {
      await readOriginalGcpKeyScanCommand(command);
      await (input.assertOriginalIdentity ?? input.assertOriginal)();
    },
    assertFinalInputs: async () => {
      await readOriginalGcpKeyScanCommand(command);
      await (input.assertFinalInputs ?? input.assertOriginal)();
    },
  };
  const reserve = callback.phase === 'after' ? callback.reserve : undefined;
  if (callback.phase === 'after' && !reserve) throw new Error('Original final key-scan reserve required');
  if (reserve) {
    const inherited = inspectFinalReaderReserve(reserve);
    if (
      inherited.originalStartMs !== input.originalStartMs ||
      inherited.originalDeadlineMs !== input.originalDeadlineMs ||
      ['pid', 'group', 'start', 'boot'].some(
        (key) =>
          inherited.identity[key as keyof typeof inherited.identity] !==
          callback.execution.identity[key as keyof typeof callback.execution.identity],
      )
    )
      throw new Error('Original final key-scan parent reserve differs');
  }
  const execute = originalExecutor(policy, reserve);
  return async (invocation) => {
    await readOriginalGcpKeyScanCommand(command);
    if (
      invocation.args.length !== original.args.length ||
      invocation.args.some((value, index) => value !== original.args[index])
    )
      throw new Error('Exact original VM-bound key-scan arguments required');
    if (Object.keys(invocation.env).length !== 1 || invocation.env.LC_ALL !== 'C')
      throw new Error('Exact credential-free key-scan environment required');
    return execute(invocation);
  };
}

/** Only isolated Python readers can consume an already admitted parent's final reserve.
 * The caller must bind its shipped reader sources and request through assertOriginal.
 * This is a compiled capture adapter, never a Terraform tool argument or budget renewal.
 */
export function signalFreeFinalReaderExecutor(input: SignalFreeExecutionPolicy, reserve: FinalReaderReserve): Executor {
  if (input.stdin !== undefined) throw new Error('Isolated final reader does not accept command stdin');
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
  const stdin = input.stdin === undefined ? undefined : freezeAdmittedCaptureInputs({ stdin: input.stdin }).stdin;
  const policy = { ...input, stdin, python: { ...input.python }, executable: { ...input.executable } };
  const inherited = reserve ? inspectFinalReaderReserve(reserve) : undefined;
  const executionDeadline = inherited?.finalDeadlineMs ?? policy.originalDeadlineMs;
  const assertOriginalPolicy = async () => {
    await policy.assertOriginal();
    if (reserve) await assertFinalReaderReserve(reserve);
  };
  const assertOriginalIdentityPolicy = async () => {
    await (policy.assertOriginalIdentity ?? policy.assertOriginal)();
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
    (policy.assertOriginalIdentity !== undefined && typeof policy.assertOriginalIdentity !== 'function') ||
    (policy.assertFinalInputs !== undefined && typeof policy.assertFinalInputs !== 'function') ||
    (policy.assertOriginalIdentity !== undefined) !== (policy.assertFinalInputs !== undefined) ||
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
    let generatedInputs: Awaited<ReturnType<typeof monitorOriginalInputs>> | undefined;
    const assertOriginal = async () => {
      await generatedInputs?.assertOriginal();
      await assertOriginalPolicy();
    };
    const assertOriginalIdentity = async () => {
      await generatedInputs?.assertOriginalIdentity();
      await assertOriginalIdentityPolicy();
    };
    let stdinSnapshot: OriginalExecutionStdinSnapshot | undefined;
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
    const generatedBindings: Record<string, OriginalInputBinding> = {};
    const gate = await readOwnedInstalledInput(script);
    if (gate.binding.sha256 !== hash(Buffer.from(signalFreeBootstrapSource)))
      throw new Error('Original generated gate bytes changed before admission');
    generatedBindings.gate = gate.binding;
    if (stdin) {
      const source = await readOwnedInstalledInput(stdin.path, 16 * 1024 * 1024);
      assertSameOriginalInput(stdin, source.binding);
      if ((BigInt(source.binding.expectedIdentity?.mode ?? '-1') & 0o777n) !== 0o400n)
        throw new Error('Original command stdin must be a read-only owned file');
      generatedBindings.stdin = source.binding;
      const metadata = JSON.stringify(stdin);
      const path = `${bootstrap}.stdin-binding.json`;
      await writeFile(path, metadata, { flag: 'wx', mode: 0o400 });
      const control = await readOwnedInstalledInput(path);
      if (control.binding.sha256 !== hash(Buffer.from(metadata)))
        throw new Error('Original stdin metadata bytes changed before admission');
      generatedBindings.stdinControl = control.binding;
    }
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
    let finalCaptureActive = false;
    let captureStartup: Promise<void> | undefined;
    let originalOutput: Awaited<ReturnType<typeof bindOriginalExecutionOutput>> | undefined;
    const fail = (value: Reason) => {
      if (!reason) reason = value;
      finalStarted ??= now();
    };

    const startupEvidence: StartupFailureEvidence[] = [];
    const startupPersistenceErrors: unknown[] = [];
    const startupFields = () =>
      startupEvidence.length ? { startupFailureEvidence: Object.freeze([...startupEvidence]) } : {};
    const retainStartupFailure = async (phase: StartupFailureEvidence['phase'], error: unknown) => {
      fail('startup');
      const path = join(root, `startup-${phase}-failure.private.json`);
      const raw = JSON.stringify({
        schemaVersion: 1,
        kind: 'original-executor-startup-failure',
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
        startupEvidence.push(Object.freeze({ schemaVersion: 1, phase, path, sha256: hash(Buffer.from(raw)) }));
      } catch (persistenceError) {
        startupPersistenceErrors.push(
          new AggregateError([error, persistenceError], 'Original startup failure and persistence unresolved'),
        );
      }
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
        await assertOriginalIdentity();
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
      generatedInputs = await monitorOriginalInputs(generatedBindings);
      await generatedInputs.assertOriginal();
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
          stdin?: OriginalExecutionStdinSnapshot;
        };
        if (stdin) {
          const snapshot = evidence.stdin;
          if (
            snapshot?.schemaVersion !== 1 ||
            snapshot.kind !== 'sealed-original-file-stdin' ||
            snapshot.path !== stdin.path ||
            snapshot.sha256 !== stdin.sha256 ||
            snapshot.bytes !== Number(stdin.expectedIdentity?.size) ||
            snapshot.sealed !== true ||
            !Number.isSafeInteger(snapshot.snapshotFd) ||
            snapshot.snapshotFd < 3 ||
            !/^\d+$/.test(snapshot.dev) ||
            !/^\d+$/.test(snapshot.ino)
          )
            throw new Error('Original stdin snapshot admission differs');
          const descriptor = `/proc/${child.pid}/fd/${snapshot.snapshotFd}`;
          const metadata = await stat(descriptor, { bigint: true });
          if (
            (await readlink(descriptor)) !== '/memfd:xcsh-original-stdin (deleted)' ||
            metadata.dev.toString() !== snapshot.dev ||
            metadata.ino.toString() !== snapshot.ino ||
            metadata.uid !== BigInt(process.getuid?.() ?? -1) ||
            metadata.size !== BigInt(snapshot.bytes) ||
            hash(await readFile(descriptor)) !== stdin.sha256
          )
            throw new Error('Original stdin descriptor or sealed bytes differ');
          stdinSnapshot = Object.freeze({ ...snapshot });
        } else if (evidence.stdin !== undefined) throw new Error('Unexpected original command stdin snapshot');
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
            captureStartup = Promise.resolve()
              .then(async () => {
                if (!originalIdentity) throw new Error('Original execution identity unavailable');
                originalOutput = await bindOriginalExecutionOutput({
                  directory: cwd,
                  identity: originalIdentity,
                  stdout: { path: stdoutPath, writer: stdout },
                  stderr: { path: stderrPath, writer: stderr },
                  maximum,
                  assertInputs: async () => {
                    await python.require();
                    await executable.require();
                    await generatedInputs?.assertOriginal();
                    // Final reads retain full original bytes and their own existing
                    // reserve; the expired operation guard cannot authorize them.
                    if (finalCaptureActive && policy.assertFinalInputs) {
                      if (reserve) await assertFinalReaderReserve(reserve);
                      await policy.assertFinalInputs();
                      if (reserve) await assertFinalReaderReserve(reserve);
                    } else await assertOriginal();
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
                  ...(stdinSnapshot ? { stdin: stdinSnapshot } : {}),
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
              })
              .catch(async (error) => {
                await retainStartupFailure('callback', error);
                throw error;
              });
            const startupDeadlineError = new Error('Original capture startup deadline exhausted');
            let startupTimer: ReturnType<typeof setTimeout> | undefined;
            try {
              await Promise.race([
                captureStartup,
                new Promise<never>((_resolve, reject) => {
                  startupTimer = setTimeout(() => reject(startupDeadlineError), Math.max(0, startupDeadline - now()));
                }),
              ]);
            } catch (error) {
              fail('startup');
              if (error === startupDeadlineError) await retainStartupFailure('deadline', error);
            } finally {
              if (startupTimer) clearTimeout(startupTimer);
            }
            await check();
            if (now() >= startupDeadline || actualExitCode !== null) fail('startup');
          }
        }
      } else if (!reason) fail('startup');
      if (!reason && policy.assertOriginalIdentity) {
        try {
          await assertOriginal();
        } catch (error) {
          await retainInputFailure('release-original-input-check', error);
        }
        await check();
        if (now() >= startupDeadline || actualExitCode !== null) fail('startup');
      }
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
            ...(stdinSnapshot ? { stdin: stdinSnapshot } : {}),
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
        ...startupFields(),
        ...(stdinSnapshot ? { stdin: stdinSnapshot } : {}),
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
            const retainFinalCheck = async () => {
              try {
                await generatedInputs?.assertOriginal();
                await policy.assertFinalInputs?.();
              } catch (error) {
                finalErrors.push(error);
              }
            };
            await retainFinalCheck();
            try {
              finalCaptureActive = true;
              await policy.finalCapture(Object.freeze({ ...capture, ...startupFields() }));
            } finally {
              finalCaptureActive = false;
              await retainFinalCheck();
            }
          })(),
          new Promise<never>((_resolve, reject) => {
            captureTimer = setTimeout(
              () => reject(new Error('Original final capture deadline exhausted')),
              Math.max(0, capture.finalDeadlineMs - now()),
            );
          }),
        ]);
        captureClosed = finalErrors.length === 0;
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
            ...startupFields(),
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
      finalErrors.push(...inputPersistenceErrors, ...startupPersistenceErrors);
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
      generatedInputs?.close();
      python.close();
      executable.close();
    }
  };
}

import {
  assertOriginalGcpObserverClientAbiIdentity,
  assertOriginalGcpObserverClientAbiInputs,
  checkoutOriginalGcpObserverClientAbiCommand,
  readOriginalGcpObserverClientAbiCommand,
} from './gcp-observer-client-abi-command';

export async function signalFreeGcpObserverClientAbiExecutor(
  input: SignalFreeExecutionPolicy,
  command: unknown,
): Promise<Executor> {
  const source = await readOriginalGcpObserverClientAbiCommand(command);
  if (
    input.python.path !== source.python.path ||
    input.python.sha256 !== source.python.sha256 ||
    input.executable.path !== source.executable.path ||
    input.executable.sha256 !== source.executable.sha256 ||
    input.originalStartMs !== source.callback.original.budget.start ||
    input.originalDeadlineMs !== source.callback.original.budget.deadline
  )
    throw new Error('Original observer ABI executable or operation budget differs');
  if (
    (input.timeoutMs ?? 60000) > 60000 ||
    (input.startupTimeoutMs ?? 15000) > 15000 ||
    (input.maxOutputBytes ?? 65536) > 65536
  )
    throw new Error('Original observer ABI limits cannot be extended');
  if (input.stdin !== undefined) throw new Error('Original observer ABI command does not accept stdin');
  return async (invocation) => {
    if (JSON.stringify(invocation.args) !== JSON.stringify(source.args))
      throw new Error('Original observer ABI arguments differ');
    await checkoutOriginalGcpObserverClientAbiCommand(command);
    const remaining = source.sourceDeadlineMs - now();
    if (remaining <= 0) throw new Error('Original observer ABI deadline exhausted');
    const policy: SignalFreeExecutionPolicy = {
      ...input,
      timeoutMs: Math.min(input.timeoutMs ?? 60000, remaining),
      startupTimeoutMs: input.startupTimeoutMs ?? 15000,
      maxOutputBytes: input.maxOutputBytes ?? 65536,
      assertOriginal: async () => {
        await readOriginalGcpObserverClientAbiCommand(command);
        await input.assertOriginal();
      },
      assertOriginalIdentity: async () => {
        await assertOriginalGcpObserverClientAbiIdentity(command);
        await (input.assertOriginalIdentity ?? input.assertOriginal)();
      },
      assertFinalInputs: async () => {
        await assertOriginalGcpObserverClientAbiInputs(command);
        await (input.assertFinalInputs ?? input.assertOriginal)();
      },
      beforeRelease: async (admission) => {
        await readOriginalGcpObserverClientAbiCommand(command);
        if (admission.stdin !== undefined) throw new Error('Original observer ABI stdin admission differs');
        await input.beforeRelease?.(admission);
      },
      finalCapture: async (capture) => {
        const failures: unknown[] = [];
        try {
          await assertOriginalGcpObserverClientAbiInputs(command);
        } catch (error) {
          failures.push(error);
        }
        try {
          await input.finalCapture(capture);
        } catch (error) {
          failures.push(error);
        }
        try {
          await assertOriginalGcpObserverClientAbiInputs(command);
        } catch (error) {
          failures.push(error);
        }
        if (failures.length)
          throw new AggregateError(failures, 'Original observer ABI final capture or input retention failed');
      },
    };
    let reserve: FinalReaderReserve | undefined;
    if (source.callback.phase === 'after') {
      reserve = source.callback.reserve;
      if (!reserve) throw new Error('Original final observer ABI reserve required');
      await assertFinalReaderReserve(reserve);
    }
    const execute = originalExecutor(policy, reserve);
    const result = await execute(invocation);
    await assertOriginalGcpObserverClientAbiInputs(command);
    return result;
  };
}
