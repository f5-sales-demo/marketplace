import { createHash } from 'node:crypto';
import { lstat, open, realpath } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import {
  assertOriginalApplyCallback,
  assertOriginalApplyLifetime,
  type OriginalApplyCallbackContext,
} from './installed-apply-controller';
import { readOwnedInstalledInput } from './installed-runtime';
import { monitorOriginalInputs, type OriginalInputBinding } from './original-input-monitor';
import {
  assertOriginalAccessReaderStdin,
  assertOriginalUnspawnedSource,
  collectOriginalReaderGroupClosure,
  type OriginalAccessReaderOrigin,
  type OriginalReaderSourceClosure,
  originalAccessReaderPrefix,
} from './original-reader-group-closure';
import { inspectFinalReaderReserve } from './reader-final-reserve';
import type { Executor } from './runner';
import {
  collectOriginalSignalFreeUnspawnedExecutions,
  type ExecutionCaptureAdmission,
  type FinalExecutionCapture,
  signalFreeBootstrapSource,
} from './signal-free-executor';

type Recorder = Readonly<{
  begin(args?: readonly string[]): Promise<void>;
  admit(value: ExecutionCaptureAdmission): Promise<void>;
  capture(value: FinalExecutionCapture): Promise<void>;
  finished(executor?: Executor): void;
}>;
type Source = Readonly<{
  callback: OriginalApplyCallbackContext;
  family: OriginalAccessReaderOrigin['family'];
  role: OriginalAccessReaderOrigin['role'];
  instanceId: string;
  collect(): Promise<OriginalReaderSourceClosure>;
}>;
const issued = new WeakMap<object, Source>();
const ports = new WeakMap<object, Source>();
const collections = new WeakMap<object, () => Promise<readonly OriginalReaderSourceClosure[]>>();
const collectionOpenings = new WeakSet<object>();
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** Internal owner registration. The installed runtime exports only the collector. */
export function bindOriginalAccessReaderCapture(port: object, recorder: Recorder) {
  const source = issued.get(recorder);
  if (!source || ports.has(port)) throw new Error('Original access recorder and unclaimed source port required');
  ports.set(port, source);
}
export async function collectInstalledOriginalAccessReaderSource(value: unknown): Promise<OriginalReaderSourceClosure> {
  const source = value && typeof value === 'object' ? ports.get(value) : undefined;
  if (!source) throw new Error('Original source-issued access reader required');
  return source.collect();
}

/** Exact owned source coverage, including branches which never created a native child. */
export async function bindOriginalAccessReaderCollection(
  port: object,
  input: {
    readonly callback: OriginalApplyCallbackContext;
    readonly family: OriginalAccessReaderOrigin['family'];
    readonly instanceId: string;
    readonly sources: () => Readonly<Record<string, unknown>>;
  },
) {
  if (collectionOpenings.has(port)) throw new Error('Original access collection already claimed');
  collectionOpenings.add(port);
  const { callback, family, instanceId, sources } = input;
  if (callback.phase === 'after') await assertOriginalApplyCallback(callback);
  else await assertOriginalApplyLifetime(callback);
  if (!['observer', 'ce'].includes(family) || !/^[1-9][0-9]{0,19}$/.test(instanceId))
    throw new Error('Original access collection family and resource required');
  const required = family === 'ce' ? ['wire', 'trust'] : ['wire', 'trust', 'peer', 'delivery', 'abi', 'renewal'];
  collections.set(port, async () => {
    const current = sources();
    if (
      !current ||
      typeof current !== 'object' ||
      Array.isArray(current) ||
      Object.keys(current).some((name) => !required.includes(name))
    )
      throw new Error('Original access source coverage differs');
    const outcomes = await Promise.allSettled(
      required.map(async (role) => {
        const value = current[role];
        if (value === undefined)
          return Object.freeze({ name: `${family}-${role}`, attemptCount: 0, witnesses: Object.freeze([]) });
        const source = value && typeof value === 'object' ? ports.get(value) : undefined;
        if (
          !source ||
          source.callback !== callback ||
          source.family !== family ||
          source.role !== role ||
          source.instanceId !== instanceId
        )
          throw new Error('Original access child source, callback, role or resource differs');
        return source.collect();
      }),
    );
    const failures = outcomes.flatMap((outcome) => (outcome.status === 'rejected' ? [outcome.reason] : []));
    if (failures.length) throw new AggregateError(failures, 'Original access source coverage incomplete');
    return Object.freeze(outcomes.flatMap((outcome) => (outcome.status === 'fulfilled' ? [outcome.value] : [])));
  });
}
export async function collectInstalledOriginalAccessReaderSources(value: unknown) {
  const collect = value && typeof value === 'object' ? collections.get(value) : undefined;
  if (!collect) throw new Error('Original source-issued access collection required');
  return collect();
}

/** Native child bookkeeping does not grant SSH, guest, apply or cleanup authority.
 * Immutable declarations survive input retirement; native group absence is checked separately. */
export async function openOriginalAccessReaderCapture(input: {
  readonly callback: OriginalApplyCallbackContext;
  readonly family: OriginalAccessReaderOrigin['family'];
  readonly role: OriginalAccessReaderOrigin['role'];
  readonly instanceId: string;
  readonly directory: string;
  readonly python: Readonly<{ path: string; sha256: string }>;
  readonly executable: Readonly<{ path: string; sha256: string }>;
  readonly args?: readonly string[];
  readonly stdin?: OriginalInputBinding;
  readonly offline?: boolean;
}): Promise<Recorder> {
  if (input.callback.phase === 'after') await assertOriginalApplyCallback(input.callback);
  else await assertOriginalApplyLifetime(input.callback);
  const callback = input.callback;
  const offline = input.offline === true;
  const declaration = Object.freeze(
    structuredClone({
      schemaVersion: 1,
      kind: 'original-installed-gcp-access-reader-request',
      owner: callback.original.owner,
      family: input.family,
      role: input.role,
      phase: callback.phase,
      instanceId: input.instanceId,
      parent: callback.execution.identity,
      executionDirectory: callback.original.executionDirectory,
      budget: callback.original.budget,
      ...(callback.phase === 'after'
        ? { finalReserve: inspectFinalReaderReserve(callback.reserve as NonNullable<typeof callback.reserve>) }
        : {}),
      python: input.python,
      executable: input.executable,
      args: [...(input.args ?? [])],
      ...(input.stdin ? { stdin: input.stdin } : {}),
    }),
  );
  const prefix = originalAccessReaderPrefix(input.family, input.role);
  if (
    dirname(input.directory) !== declaration.executionDirectory ||
    !input.directory.startsWith(join(declaration.executionDirectory, prefix))
  )
    throw new Error('Original access reader directory required');
  const initial = await lstat(input.directory, { bigint: true });
  const assertRoot = async () => {
    const actual = await lstat(input.directory, { bigint: true });
    if (
      !actual.isDirectory() ||
      actual.isSymbolicLink() ||
      (await realpath(input.directory)) !== input.directory ||
      (actual.mode & 0o777n) !== 0o700n ||
      (['dev', 'ino', 'uid', 'mode'] as const).some((key) => actual[key] !== initial[key])
    )
      throw new Error('Original access reader directory changed');
  };
  await assertRoot();
  const persist = async (name: string, value: unknown) => {
    await assertRoot();
    const path = join(input.directory, name),
      file = await open(path, 'wx', 0o400);
    try {
      await file.writeFile(JSON.stringify(value));
      await file.sync();
    } finally {
      await file.close();
    }
    const parent = await open(input.directory, 'r');
    try {
      await parent.sync();
    } finally {
      await parent.close();
    }
    await assertRoot();
    return (await readOwnedInstalledInput(path, 1024 * 1024)).binding;
  };
  let starts = 0,
    began = false,
    terminal = false;
  let args: readonly string[] = declaration.args;
  let request: OriginalInputBinding | undefined,
    admission: OriginalInputBinding | undefined,
    capture: OriginalInputBinding | undefined;
  let final: FinalExecutionCapture | undefined;
  let originalExecutor: Executor | undefined;
  const recorder: Recorder = Object.freeze({
    async begin(commandArgs = args) {
      if (began) throw new Error('Original access native attempt is single-use');
      began = true;
      args = Object.freeze([...commandArgs]);
      request = await persist('reader-source.private.json', { ...declaration, args });
      starts = 1;
    },
    async admit(value) {
      if (
        !request ||
        admission ||
        terminal ||
        value.directory !== input.directory ||
        !isDeepStrictEqual(value.args, args) ||
        value.originalStartMs !== declaration.budget.start ||
        value.originalDeadlineMs !== declaration.budget.deadline
      )
        throw new Error('Original access admission differs');
      assertOriginalAccessReaderStdin(declaration.stdin, value.stdin);
      admission = await persist('reader-admission.private.json', {
        schemaVersion: 1,
        kind: 'original-installed-gcp-access-reader-admission',
        requestSha256: request.sha256,
        identity: value.identity,
        args: value.args,
        budget: declaration.budget,
        ...(value.stdin ? { stdin: value.stdin } : {}),
      });
    },
    async capture(value) {
      if (!request || capture || terminal) throw new Error('Original access final capture differs');
      final = Object.freeze(structuredClone(value));
      capture = await persist('reader-final.private.json', final);
    },
    finished(executor) {
      if (terminal && originalExecutor !== executor)
        throw new Error('Original access executor source cannot be replaced');
      originalExecutor = executor;
      terminal = true;
    },
  });
  issued.set(recorder, {
    callback,
    family: declaration.family,
    role: declaration.role,
    instanceId: declaration.instanceId,
    collect: async () => {
      if (offline) throw new Error('Original native access reader required; offline execution is not closure evidence');
      const name = `${declaration.family}-${declaration.role}`;
      if (!starts) return Object.freeze({ name, attemptCount: 0, witnesses: Object.freeze([]) });
      if (!terminal || !request) throw new Error('Original access terminal execution and immutable capture required');
      await assertRoot();
      if (!capture && !final && originalExecutor) {
        const values = await collectOriginalSignalFreeUnspawnedExecutions(originalExecutor);
        if (values.length !== 1) throw new Error('One original access unspawned execution required');
        const unspawned = Object.freeze({ request, evidence: values[0] });
        await assertOriginalUnspawnedSource(unspawned, declaration.owner);
        return Object.freeze({
          name,
          attemptCount: 0,
          invocationCount: starts,
          witnesses: Object.freeze([]),
          unspawned: Object.freeze([unspawned]),
        });
      }
      if (!capture || !final) throw new Error('Original access terminal execution and immutable capture required');
      const monitor = await monitorOriginalInputs({ request, capture, ...(admission ? { admission } : {}) });
      try {
        const witness = await collectOriginalReaderGroupClosure({
          directory: input.directory,
          capture: final,
          originalBudget: declaration.budget,
          pythonSha256: declaration.python.sha256,
          executableSha256: declaration.executable.sha256,
          gateSha256: hash(Buffer.from(signalFreeBootstrapSource)),
          captureBinding: capture,
          origin: {
            schemaVersion: 1,
            kind: 'original-installed-gcp-access-reader-origin',
            owner: declaration.owner,
            family: declaration.family,
            role: declaration.role,
            phase: declaration.phase,
            instanceId: declaration.instanceId,
            parent: declaration.parent,
            executionDirectory: declaration.executionDirectory,
            request,
            admissionRecorded: !!admission,
            ...(admission ? { admission } : {}),
          },
        });
        await monitor.assertOriginal();
        return Object.freeze({ name, attemptCount: starts, witnesses: Object.freeze([witness]) });
      } finally {
        monitor.close();
      }
    },
  });
  return recorder;
}
