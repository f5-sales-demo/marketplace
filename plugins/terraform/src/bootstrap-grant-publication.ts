import { createHash, randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { basename, join } from 'node:path';
import sources from './gcp-capture-source-pins.json';
import type { InstalledCaptureContext } from './installed-capture-context';
import { readOwnedInstalledInput } from './installed-runtime';
import pins from './installed-runtime-pins.json';
import { monitorOriginalInputs, type OriginalInputBinding } from './original-input-monitor';
import { collectOriginalReaderGroupClosure, type OriginalReaderSourceClosure } from './original-reader-group-closure';
import type { Executor } from './runner';
import {
  collectOriginalSignalFreeUnspawnedExecutions,
  type FinalExecutionCapture,
  type SignalFreeExecutionPolicy,
  signalFreeBootstrapSource,
  signalFreeTerraformExecutor,
} from './signal-free-executor';

export interface BootstrapGrantPublicationOptions {
  /** Explicit offline fixture only. Installed execution uses the signal-free runner. */
  executorFactory?: (policy: SignalFreeExecutionPolicy) => Executor;
}
export interface BootstrapGrantDirectory {
  directory: string;
  identity: Readonly<{ dev: bigint; ino: bigint; uid: bigint; mode: bigint }>;
}
const hash = (raw: Uint8Array) => createHash('sha256').update(raw).digest('hex');
type Attempt = {
  nonce: string;
  started: boolean;
  terminal: boolean;
  offline: boolean;
  request?: OriginalInputBinding;
  claim?: OriginalInputBinding;
  admission?: OriginalInputBinding;
  capture?: OriginalInputBinding;
  final?: FinalExecutionCapture;
  unspawned?: OriginalInputBinding;
};
const directories = new WeakMap<
  object,
  { context: InstalledCaptureContext; attempts: Attempt[]; guard(): Promise<void> }
>();
/** Internal source directory ownership. A copied directory is not a publisher source. */
export async function ownOriginalBootstrapPublisherDirectory(
  context: InstalledCaptureContext,
  input: BootstrapGrantDirectory,
) {
  if (
    context.owner.provider !== 'gcp' ||
    context.owner.engine !== 'terraform' ||
    !/^[a-f0-9]{64}$/.test(basename(input.directory)) ||
    input.directory !== join(context.executionDirectory, '.xcsh-original-bootstrap', basename(input.directory))
  )
    throw new Error('Original bootstrap publisher context and directory required');
  const original = Object.freeze({ directory: input.directory, identity: Object.freeze({ ...input.identity }) });
  const guard = async () => {
    const current = await lstat(original.directory, { bigint: true });
    if (
      (await realpath(original.directory)) !== original.directory ||
      !current.isDirectory() ||
      current.isSymbolicLink() ||
      (current.mode & 0o777n) !== 0o700n ||
      (['dev', 'ino', 'uid', 'mode'] as const).some((key) => current[key] !== original.identity[key])
    )
      throw new Error('Original bootstrap publisher directory changed');
  };
  await guard();
  directories.set(original, { context, attempts: [], guard });
  return original;
}
export async function collectOriginalBootstrapPublisherSource(value: unknown): Promise<OriginalReaderSourceClosure> {
  const source = value && typeof value === 'object' ? directories.get(value) : undefined;
  if (!source) throw new Error('Original source-issued bootstrap publisher directory required');
  const original = value as BootstrapGrantDirectory;
  await source.guard();
  const invoked = source.attempts.filter((attempt) => attempt.started);
  const started = invoked.filter((attempt) => !attempt.unspawned);
  const outcomes = await Promise.allSettled(
    started.map(async (attempt) => {
      if (attempt.offline) throw new Error('Original native bootstrap publisher required');
      if (!attempt.terminal || !attempt.request || !attempt.claim || !attempt.capture || !attempt.final)
        throw new Error('Original bootstrap publisher terminal capture and source bindings required');
      const monitor = await monitorOriginalInputs({
        request: attempt.request,
        claim: attempt.claim,
        capture: attempt.capture,
        ...(attempt.admission ? { admission: attempt.admission } : {}),
      });
      try {
        const witness = await collectOriginalReaderGroupClosure({
          directory: original.directory,
          capture: attempt.final,
          originalBudget: source.context.budget,
          pythonSha256: source.context.inputs.python.sha256,
          executableSha256: source.context.inputs.python.sha256,
          gateSha256: hash(Buffer.from(signalFreeBootstrapSource)),
          captureBinding: attempt.capture,
          origin: {
            schemaVersion: 1,
            kind: 'original-bootstrap-publisher-origin',
            owner: source.context.owner,
            executionDirectory: source.context.executionDirectory,
            planSha256: basename(original.directory),
            nonce: attempt.nonce,
            request: attempt.request,
            claim: attempt.claim,
            admissionRecorded: !!attempt.admission,
            ...(attempt.admission ? { admission: attempt.admission } : {}),
          },
        });
        await monitor.assertOriginal();
        return witness;
      } finally {
        monitor.close();
      }
    }),
  );
  const failures = outcomes.flatMap((outcome) => (outcome.status === 'rejected' ? [outcome.reason] : []));
  if (failures.length) throw new AggregateError(failures, 'Original bootstrap publisher source coverage incomplete');
  const unspawned = invoked
    .filter((attempt) => !!attempt.unspawned)
    .map((attempt) => {
      if (!attempt.request || !attempt.unspawned) throw new Error('Original unspawned publisher source required');
      return Object.freeze({ request: attempt.request, evidence: attempt.unspawned });
    });
  return Object.freeze({
    name: 'bootstrap-publisher',
    attemptCount: started.length,
    invocationCount: invoked.length,
    unspawned: Object.freeze(unspawned),
    witnesses: Object.freeze(outcomes.flatMap((outcome) => (outcome.status === 'fulfilled' ? [outcome.value] : []))),
  });
}

/** Write once and flush before exposure. Failed writes retain the exclusive file. */
export async function retainBootstrapGrantFile(directory: string, name: string, raw: Uint8Array): Promise<void> {
  const file = await open(
    join(directory, name),
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o400,
  );
  try {
    await file.writeFile(raw);
    await file.sync();
  } finally {
    await file.close();
  }
  const parent = await open(directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try {
    await parent.sync();
  } finally {
    await parent.close();
  }
}

/** Filesystem publication only; the owning signer supplies all authorization checks. */
export async function publishSignedBootstrapGrant(
  context: InstalledCaptureContext,
  original: BootstrapGrantDirectory,
  nonce: string,
  raw: Uint8Array,
  guard: () => Promise<void>,
  options: BootstrapGrantPublicationOptions,
) {
  if (process.platform !== 'linux' || !/^[a-f0-9]{32}$/.test(nonce) || raw.length < 1 || raw.length > 16384)
    throw new Error('Bounded original bootstrap grant required');
  const source = directories.get(original);
  if (!source || source.context !== context) throw new Error('Original bootstrap publisher source/context required');
  if (source.attempts.some((attempt) => attempt.nonce === nonce))
    throw new Error('Original bootstrap publisher nonce already claimed');
  const factory = options.executorFactory;
  const attempt: Attempt = { nonce, started: false, terminal: false, offline: !!factory };
  source.attempts.push(attempt);
  const python = context.inputs.python,
    script = context.inputs['script:publish_bootstrap_grant.py'];
  if (
    !python ||
    python.sha256 !== pins.pythonSha256 ||
    !script ||
    script.sha256 !== sources.files['publish_bootstrap_grant.py']
  )
    throw new Error('Qualified original grant publisher inputs required');
  await guard();
  const name = `.grant-${nonce}-${randomBytes(16).toString('hex')}.partial`,
    sha256 = hash(raw);
  await retainBootstrapGrantFile(original.directory, name, raw);
  await guard();
  attempt.claim = (await readOwnedInstalledInput(join(original.directory, `claim-${nonce}.json`))).binding;
  const args = [
    '-I',
    '-B',
    script.path,
    original.directory,
    name,
    nonce,
    sha256,
    ...(['dev', 'ino', 'uid', 'mode'] as const).map((key) => original.identity[key].toString()),
  ];
  const requestPath = join(original.directory, `publisher-${nonce}-request.json`);
  await retainBootstrapGrantFile(
    original.directory,
    `publisher-${nonce}-request.json`,
    Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        kind: 'original-bootstrap-publisher-request',
        owner: context.owner,
        planSha256: basename(original.directory),
        nonce,
        grantSha256: sha256,
        budget: context.budget,
        python,
        script,
        args,
        claim: attempt.claim,
      }),
    ),
  );
  attempt.request = (await readOwnedInstalledInput(requestPath)).binding;
  let closed = false;
  const policy: SignalFreeExecutionPolicy = {
    python: { path: python.path, sha256: python.sha256 },
    executable: { path: python.path, sha256: python.sha256 },
    originalStartMs: context.budget.start,
    originalDeadlineMs: context.budget.deadline,
    timeoutMs: 60000,
    startupTimeoutMs: 15000,
    maxOutputBytes: 16384,
    assertOriginal: guard,
    beforeRelease: async (admission) => {
      await source.guard();
      await retainBootstrapGrantFile(
        original.directory,
        `publisher-${nonce}-admission-entered.json`,
        Buffer.from(
          JSON.stringify({
            schemaVersion: 1,
            kind: 'original-bootstrap-publisher-admission-entered',
            identity: admission.identity,
            requestSha256: attempt.request?.sha256,
            args: admission.args,
            budget: context.budget,
          }),
        ),
      );
      await guard();
      if (
        admission.directory !== original.directory ||
        JSON.stringify(admission.args) !== JSON.stringify(args) ||
        admission.originalStartMs !== context.budget.start ||
        admission.originalDeadlineMs !== context.budget.deadline
      )
        throw new Error('Original bootstrap publisher admission differs');
      await retainBootstrapGrantFile(
        original.directory,
        `publisher-${nonce}-admission.json`,
        Buffer.from(
          JSON.stringify({
            schemaVersion: 1,
            kind: 'original-bootstrap-publisher-admission',
            requestSha256: attempt.request?.sha256,
            identity: admission.identity,
            args,
            budget: context.budget,
          }),
        ),
      );
      attempt.admission = (
        await readOwnedInstalledInput(join(original.directory, `publisher-${nonce}-admission.json`))
      ).binding;
    },
    finalCapture: async (capture) => {
      await retainBootstrapGrantFile(
        original.directory,
        `publication-${nonce}.json`,
        Buffer.from(JSON.stringify(capture)),
      );
      attempt.final = Object.freeze(structuredClone(capture));
      attempt.capture = (await readOwnedInstalledInput(join(original.directory, `publication-${nonce}.json`))).binding;
      if (
        capture.actualExitCode !== 0 ||
        !capture.originalGroupClosed ||
        capture.signalsSent !== false ||
        capture.reason
      )
        throw new Error('Original bootstrap publisher closure incomplete; reconcile without replay');
      await guard();
      closed = true;
    },
  };
  const execute = factory ? factory(policy) : signalFreeTerraformExecutor(policy);
  attempt.started = true;
  let result: Awaited<ReturnType<typeof execute>>;
  try {
    result = await execute({
      cwd: original.directory,
      args,
      env: { PATH: '/usr/bin:/bin' },
    });
  } finally {
    attempt.terminal = true;
    if (!factory && !attempt.final) {
      const unspawned = await collectOriginalSignalFreeUnspawnedExecutions(execute);
      if (unspawned.length === 1) attempt.unspawned = unspawned[0];
    }
  }
  await guard();
  if (result.code !== 0 || !closed)
    throw new Error('Original bootstrap publication uncertain; reconcile without replay');
  const expected = JSON.stringify({
    schemaVersion: 1,
    kind: 'original-bootstrap-grant-published',
    name: `grant-${nonce}.json`,
    sha256,
    executionAuthorized: false,
  });
  // The shipped Python writer emits exactly one bounded metadata record.
  if (result.stdout.trim() !== expected) throw new Error('Original bootstrap publication receipt differs');
  return Object.freeze({ name: `grant-${nonce}.json`, sha256 });
}
