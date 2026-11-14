import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, open, realpath } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { decodeEvidenceObject } from './evidence-json';
import sources from './gcp-capture-source-pins.json';
import { freezeAdmittedCaptureInputs, type InstalledCaptureContext } from './installed-capture-context';
import { readOwnedInstalledInput } from './installed-runtime';
import pins from './installed-runtime-pins.json';
import { linuxMonotonicMs } from './linux-clock';
import { assertSameOriginalInput, monitorOriginalInputs } from './original-input-monitor';
import {
  assertPreparedCreationScopeContext,
  assertPreparedCreationScopeInputs,
  inspectPreparedCreationScope,
} from './prepared-creation-scope';
import type { Executor } from './runner';
import {
  type ExecutionCaptureAdmission,
  type FinalExecutionCapture,
  type SignalFreeExecutionPolicy,
  signalFreeTerraformExecutor,
} from './signal-free-executor';

type Identity = ExecutionCaptureAdmission['identity'];
type Json = Record<string, unknown>;
const hash = (raw: Uint8Array) => createHash('sha256').update(raw).digest('hex');
const terraformHash = 'dbfef0be43ba2117481be510d3b83a2d8cdfa6ae7ec69c5aeb04b3947956ff7e';
const providerHash = '542d99d1905fe03fadce8a889390751b3ad1531f367ef678cf03d97204ef7cc1';
const origins = new WeakMap<object, () => Promise<Buffer>>();
const openings = new WeakSet<object>();
const object = (value: unknown): Json => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed original xcsh evidence');
  return value as Json;
};
const sameKeys = (value: Json, keys: readonly string[]) =>
  Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const sameActor = (value: unknown, actor: Identity | undefined) => {
  if (!value || typeof value !== 'object' || !actor) return false;
  const row = object(value);
  return (
    sameKeys(row, ['pid', 'group', 'start', 'boot']) &&
    ['pid', 'group', 'start', 'boot'].every((key) => row[key] === actor[key as keyof Identity])
  );
};
export interface InstalledXcshCreationReady {
  readonly kind: 'original-xcsh-creation-ready';
  readonly executor: Identity;
  readonly reader: Identity;
  readonly windowStartedMs: number;
  readonly windowDeadlineMs: number;
  readonly evidencePath: string;
  readonly evidenceSha256: string;
}
export interface InstalledXcshCreationResult {
  readonly kind: 'original-xcsh-creation-result';
  readonly executor: Identity;
  readonly reader: Identity;
  readonly complete: boolean;
  readonly targetCount: number;
  readonly evidencePath: string;
  readonly evidenceSha256: string;
}
/** Private raw evidence is readable only through its actual source-issued result. */
export async function readOriginalInstalledXcshCreation(result: InstalledXcshCreationResult): Promise<Buffer> {
  const read = origins.get(result);
  if (!read) throw new Error('An original installed xcsh result is required');
  return read();
}
export interface InstalledXcshReaderOptions {
  /** Offline fixture seam only. Production uses the actual signal-free executor. */
  executorFactory?: (policy: SignalFreeExecutionPolicy) => Executor;
  clock?: () => number;
}

/** One source-owned original creation reader; its evidence grants no apply authority. */
export async function openInstalledXcshCreationReader(
  context: InstalledCaptureContext,
  input: ExecutionCaptureAdmission,
  packet: unknown,
  options: InstalledXcshReaderOptions = {},
) {
  if (options.clock && !options.executorFactory) throw new Error('Offline clock requires explicit fixture executor');
  assertPreparedCreationScopeContext(packet, context);
  const clock = options.clock ?? linuxMonotonicMs;
  const admission = Object.freeze({
    ...input,
    identity: Object.freeze({ ...input.identity }),
    args: Object.freeze([...input.args]),
  });
  if (
    context.schemaVersion !== 2 ||
    context.kind !== 'original-installed-gcp-capture-context' ||
    context.owner.provider !== 'gcp' ||
    context.owner.engine !== 'terraform' ||
    input.directory !== context.executionDirectory ||
    input.args[0] !== 'apply' ||
    input.originalStartMs !== context.budget.start ||
    input.originalDeadlineMs !== context.budget.deadline ||
    context.budget.deadline - context.budget.start !== 7200000 ||
    !Number.isSafeInteger(input.identity.pid) ||
    input.identity.pid <= 0 ||
    input.identity.group !== input.identity.pid ||
    !/^[1-9][0-9]*$/.test(input.identity.start) ||
    !/^[a-f0-9-]{36}$/.test(input.identity.boot)
  )
    throw new Error('Trusted original xcsh capture admission required');
  // Claim before the first await: concurrent callers cannot duplicate the original reader.
  // Failure remains claimed; a changed plan needs its own source-issued scope.
  if (openings.has(packet as object)) throw new Error('Original xcsh reader scope already opened');
  openings.add(packet as object);
  await context.assertWithinDeadline();
  await context.assertInputs();
  const scope = await inspectPreparedCreationScope(packet);
  if (
    !scope.scope ||
    !scope.provider ||
    !scope.scopeFile ||
    !scope.directory ||
    !scope.resources.length ||
    scope.provider.sha256 !== providerHash ||
    context.inputs.python?.sha256 !== pins.pythonSha256 ||
    context.inputs.terraform?.sha256 !== terraformHash
  )
    throw new Error('Qualified original xcsh creation scope and binaries required');
  const scopeBinding = scope.scope;
  const inputs = freezeAdmittedCaptureInputs({
    ...context.inputs,
    ...(await context.readProviderInputs()),
    'prepared:scope': scope.scope,
  });
  const entry = inputs['script:xcsh_creation_reader.py'];
  if (
    !entry ||
    Object.entries(sources.files).some(
      ([name, expected]) =>
        inputs[`script:${name}`]?.path !== join(dirname(entry.path), name) ||
        inputs[`script:${name}`]?.sha256 !== expected,
    )
  )
    throw new Error('All shipped original xcsh reader sources required');
  const root = join(context.executionDirectory, `xcsh-creation-readers-${randomUUID()}`);
  await mkdir(root, { mode: 0o700 });
  const rootIdentity = await lstat(root, { bigint: true });
  const monitors: Array<Awaited<ReturnType<typeof monitorOriginalInputs>>> = [];
  let retired = false;
  let readerActor: Identity | undefined;
  let closure: FinalExecutionCapture | undefined;
  const assertDirectory = async () => {
    const actual = await lstat(root, { bigint: true });
    if (
      !actual.isDirectory() ||
      actual.dev !== rootIdentity.dev ||
      actual.ino !== rootIdentity.ino ||
      actual.uid !== rootIdentity.uid ||
      actual.mode !== rootIdentity.mode ||
      (await realpath(root)) !== root
    )
      throw new Error('Original xcsh reader directory changed');
  };
  const assertOriginal = async () => {
    if (retired) throw new Error('Original xcsh reader retired');
    assertPreparedCreationScopeContext(packet, context);
    await assertPreparedCreationScopeInputs(packet);
    await context.assertInputs();
    await assertDirectory();
    for (const monitor of monitors) await monitor.assertOriginal();
    const nowProviders = freezeAdmittedCaptureInputs({
      ...context.inputs,
      ...(await context.readProviderInputs()),
      'prepared:scope': scopeBinding,
    });
    if (JSON.stringify(nowProviders) !== JSON.stringify(inputs))
      throw new Error('Original xcsh reader input set changed');
    await context.assertInputs();
  };
  const guard = async () => {
    await assertOriginal();
    await context.assertWithinDeadline();
    if (clock() < context.budget.start || clock() >= context.budget.deadline)
      throw new Error('Original xcsh reader budget exhausted');
  };
  const persist = async (path: string, raw: Uint8Array) => {
    const handle = await open(path, 'wx', 0o400);
    try {
      await handle.writeFile(raw);
      await handle.sync();
    } finally {
      await handle.close();
    }
    const directory = await open(dirname(path), 'r');
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
    return (await readOwnedInstalledInput(path, 65536)).binding;
  };
  const startupDeadline = Math.min(admission.startupDeadlineMs, clock() + 15000, context.budget.deadline);
  const request = {
    schemaVersion: 1,
    kind: 'original-xcsh-creation-window',
    originalStartMs: context.budget.start,
    deadlineMs: context.budget.deadline,
    windowMs: 45000,
    startupDeadlineMs: startupDeadline,
    executor: admission.identity,
    executables: {
      bootstrap: { path: inputs.python.path, sha256: pins.pythonSha256 },
      terraform: { path: inputs.terraform.path, sha256: terraformHash },
      xcsh: { path: scope.provider.path, sha256: providerHash },
    },
    inputs,
    scope: {
      path: scope.scopeFile,
      sha256: scope.scope.sha256,
      planSha256: scope.planSha256,
      targets: scope.resources,
    },
  };
  const bytes = Buffer.from(JSON.stringify(request)),
    requestHash = hash(bytes),
    requestPath = join(root, 'request.private.json');
  const requestBinding = await persist(requestPath, bytes);
  monitors.push(await monitorOriginalInputs({ request: requestBinding }));
  const readyState = Promise.withResolvers<InstalledXcshCreationReady>();
  readyState.promise.catch(() => {});
  const baseKeys = [
    'schemaVersion',
    'requestSha256',
    'executor',
    'reader',
    'scopeSha256',
    'scopeFileSha256',
    'windowStartedMs',
    'windowDeadlineMs',
    'executionAuthorized',
    'signalsSent',
    'cloudSubmissions',
  ];
  const inspectBase = (value: Json, reader: Identity, ready?: InstalledXcshCreationReady) => {
    const began = value.windowStartedMs,
      ended = value.windowDeadlineMs;
    if (
      value.schemaVersion !== 1 ||
      value.requestSha256 !== requestHash ||
      !sameActor(value.executor, admission.identity) ||
      !sameActor(value.reader, reader) ||
      value.scopeSha256 !== scope.planSha256 ||
      value.scopeFileSha256 !== scopeBinding.sha256 ||
      !Number.isSafeInteger(began) ||
      (began as number) < context.budget.start ||
      (began as number) > clock() ||
      ended !== Math.min((began as number) + 45000, context.budget.deadline) ||
      (ready && (began !== ready.windowStartedMs || ended !== ready.windowDeadlineMs)) ||
      value.executionAuthorized !== false ||
      value.signalsSent !== false ||
      value.cloudSubmissions !== 0
    )
      throw new Error('Original xcsh reader attribution differs');
  };
  const policy: SignalFreeExecutionPolicy = {
    python: { path: inputs.python.path, sha256: pins.pythonSha256 },
    executable: { path: inputs.python.path, sha256: pins.pythonSha256 },
    originalStartMs: context.budget.start,
    originalDeadlineMs: context.budget.deadline,
    timeoutMs: 60000,
    assertOriginal: guard,
    beforeRelease: async (admitted) => {
      readerActor = Object.freeze({ ...admitted.identity });
    },
    finalCapture: async (capture) => {
      await persist(join(root, 'reader-capture.private.json'), Buffer.from(JSON.stringify(capture)));
      if (
        !sameActor(capture.identity, readerActor) ||
        capture.pid !== readerActor?.pid ||
        capture.actualExitCode !== 0 ||
        !capture.originalGroupClosed ||
        capture.reason ||
        capture.signalsSent !== false ||
        capture.originalDeadlineMs !== context.budget.deadline
      )
        throw new Error('Original xcsh reader closure incomplete');
      closure = capture;
      await guard();
    },
  };
  let terminal = false;
  // Own synchronous factory and invocation failures through the same terminal path.
  const pending = Promise.resolve().then(() => {
    const execute = options.executorFactory ? options.executorFactory(policy) : signalFreeTerraformExecutor(policy);
    return execute({
      cwd: root,
      args: ['-I', '-B', entry.path, '--request', requestPath, '--sha256', requestHash],
      env: { PATH: '/usr/bin:/bin' },
    });
  });
  pending.then(
    () => {
      terminal = true;
    },
    () => {
      terminal = true;
    },
  );
  const completed = (async (): Promise<InstalledXcshCreationResult> => {
    try {
      const path = join(root, 'xcsh-ready.private.json');
      while (
        !(await readOwnedInstalledInput(path, 65536).then(
          () => true,
          (error) => {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
            throw error;
          },
        ))
      ) {
        await guard();
        if (terminal) {
          await pending; // Preserve an original execution failure rather than replacing its attribution.
          throw new Error('Original xcsh reader startup incomplete');
        }
        if (clock() >= startupDeadline) throw new Error('Original xcsh reader startup incomplete');
        await Bun.sleep(25);
      }
      await guard();
      const readyFile = await readOwnedInstalledInput(path, 65536),
        readyValue = decodeEvidenceObject(readyFile.bytes);
      if (
        !readerActor ||
        !sameKeys(readyValue, [...baseKeys, 'kind']) ||
        readyValue.kind !== 'original-xcsh-creation-ready' ||
        Number(readyFile.binding.expectedIdentity?.mode) % 512 !== 0o400 ||
        clock() >= startupDeadline
      )
        throw new Error('Original private xcsh readiness required');
      inspectBase(readyValue, readerActor);
      monitors.push(await monitorOriginalInputs({ ready: readyFile.binding }));
      const ready = Object.freeze({
        kind: 'original-xcsh-creation-ready' as const,
        executor: admission.identity,
        reader: readerActor,
        windowStartedMs: readyValue.windowStartedMs as number,
        windowDeadlineMs: readyValue.windowDeadlineMs as number,
        evidencePath: path,
        evidenceSha256: hash(readyFile.bytes),
      });
      readyState.resolve(ready);
      const outcome = await pending;
      if (outcome.code !== 0 || !closure) throw new Error('Original xcsh reader did not close successfully');
      await guard();
      const resultPath = join(root, 'xcsh-result.private.json'),
        resultFile = await readOwnedInstalledInput(resultPath, 65536);
      const value = decodeEvidenceObject(resultFile.bytes);
      if (
        !sameKeys(value, [
          ...baseKeys,
          'kind',
          'finishedMs',
          'complete',
          'targetCount',
          'witnessCount',
          'incompletePids',
          'receipts',
        ]) ||
        value.kind !== 'original-xcsh-creation-result' ||
        Number(resultFile.binding.expectedIdentity?.mode) % 512 !== 0o400 ||
        typeof value.complete !== 'boolean' ||
        value.targetCount !== scope.resources.length ||
        !Number.isSafeInteger(value.witnessCount) ||
        (value.witnessCount as number) < 0 ||
        (value.witnessCount as number) > 128 ||
        !Number.isSafeInteger(value.finishedMs) ||
        (value.finishedMs as number) < ready.windowStartedMs ||
        (value.finishedMs as number) > clock() ||
        (value.finishedMs as number) > ready.windowDeadlineMs + 15000 ||
        !Array.isArray(value.incompletePids) ||
        value.incompletePids.length > 128 ||
        value.incompletePids.some((pid) => !Number.isSafeInteger(pid) || pid <= 0) ||
        new Set(value.incompletePids).size !== value.incompletePids.length ||
        !Array.isArray(value.receipts) ||
        (value.complete ? value.receipts.length !== scope.resources.length : value.receipts.length !== 0)
      )
        throw new Error('Original xcsh creation result incomplete or malformed');
      inspectBase(value, readerActor, ready);
      const targets = new Set(
        scope.resources.map((target) => JSON.stringify([target.type_name, target.namespace, target.name])),
      );
      const identities = new Set<string>(),
        nonces = new Set<string>();
      for (const raw of value.receipts) {
        const receipt = object(raw),
          target = object(receipt.target),
          actor = object(receipt.process);
        const key = JSON.stringify([target.type_name, target.namespace, target.name]);
        if (
          !sameKeys(receipt, [
            'schema_version',
            'scope_sha256',
            'scope_file_sha256',
            'target',
            'process',
            'nonce',
            'creation_identity_sha256',
          ]) ||
          receipt.schema_version !== 1 ||
          receipt.scope_sha256 !== scope.planSha256 ||
          receipt.scope_file_sha256 !== scopeBinding.sha256 ||
          !sameKeys(target, ['type_name', 'namespace', 'name']) ||
          !targets.delete(key) ||
          typeof receipt.nonce !== 'string' ||
          !/^[a-f0-9]{32}$/.test(receipt.nonce) ||
          nonces.has(receipt.nonce) ||
          typeof receipt.creation_identity_sha256 !== 'string' ||
          !/^[a-f0-9]{64}$/.test(receipt.creation_identity_sha256) ||
          identities.has(receipt.creation_identity_sha256) ||
          !sameKeys(actor, [
            'pid',
            'parent_pid',
            'start_ticks',
            'boot_id_sha256',
            'executable_sha256',
            'executable_device',
            'executable_inode',
          ]) ||
          !Number.isSafeInteger(actor.pid) ||
          (actor.pid as number) <= 0 ||
          actor.parent_pid !== admission.identity.pid ||
          typeof actor.start_ticks !== 'string' ||
          !/^[1-9][0-9]*$/.test(actor.start_ticks) ||
          actor.executable_sha256 !== providerHash ||
          actor.boot_id_sha256 !== hash(Buffer.from(`${admission.identity.boot}\n`)) ||
          !Number.isSafeInteger(actor.executable_device) ||
          (actor.executable_device as number) <= 0 ||
          !Number.isSafeInteger(actor.executable_inode) ||
          (actor.executable_inode as number) <= 0
        )
          throw new Error('Original xcsh creation receipt join differs');
        identities.add(receipt.creation_identity_sha256);
        nonces.add(receipt.nonce);
      }
      if (value.complete && targets.size) throw new Error('Original xcsh scope target coverage differs');
      monitors.push(await monitorOriginalInputs({ result: resultFile.binding }));
      await assertOriginal();
      const result = Object.freeze({
        kind: 'original-xcsh-creation-result' as const,
        executor: admission.identity,
        reader: readerActor,
        complete: value.complete,
        targetCount: scope.resources.length,
        evidencePath: resultPath,
        evidenceSha256: hash(resultFile.bytes),
      });
      origins.set(result, async () => {
        await assertOriginal();
        const current = await readOwnedInstalledInput(resultPath, 65536);
        assertSameOriginalInput(resultFile.binding, current.binding);
        if (hash(current.bytes) !== result.evidenceSha256) throw new Error('Original xcsh evidence bytes changed');
        await assertOriginal();
        return Buffer.from(current.bytes);
      });
      return result;
    } catch (error) {
      readyState.reject(error);
      await pending.catch(() => {});
      retired = true;
      try {
        await assertDirectory();
        await persist(
          join(root, 'bridge-failure.private.json'),
          Buffer.from(
            JSON.stringify({
              schemaVersion: 1,
              kind: 'original-xcsh-bridge-failure',
              requestSha256: requestHash,
              executor: admission.identity,
              reader: readerActor,
              originalStartMs: context.budget.start,
              originalDeadlineMs: context.budget.deadline,
              finishedMs: clock(),
              complete: false,
              executionAuthorized: false,
              signalsSent: false,
              cloudSubmissions: 0,
              error:
                error instanceof Error
                  ? { name: error.name, message: error.message, stack: error.stack }
                  : { type: typeof error },
            }),
          ),
        );
        await assertDirectory();
      } catch (retention) {
        throw new AggregateError([error, retention], 'Original xcsh bridge failure and retention unresolved');
      }
      throw error;
    }
  })();
  completed.catch(() => {});
  return Object.freeze({
    ready: readyState.promise,
    completed,
    assertOriginal,
    closeAfterExecutorExit: async () => {
      await completed;
      if (!closure?.originalGroupClosed) throw new Error('Original xcsh reader closure unresolved');
      retired = true;
      for (const monitor of monitors.splice(0)) monitor.close();
    },
  });
}
