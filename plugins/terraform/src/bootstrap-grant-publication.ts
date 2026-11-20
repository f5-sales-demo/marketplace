import { createHash, randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { join } from 'node:path';
import sources from './gcp-capture-source-pins.json';
import type { InstalledCaptureContext } from './installed-capture-context';
import pins from './installed-runtime-pins.json';
import type { Executor } from './runner';
import { type SignalFreeExecutionPolicy, signalFreeTerraformExecutor } from './signal-free-executor';

export interface BootstrapGrantPublicationOptions {
  /** Explicit offline fixture only. Installed execution uses the signal-free runner. */
  executorFactory?: (policy: SignalFreeExecutionPolicy) => Executor;
}
export interface BootstrapGrantDirectory {
  directory: string;
  identity: Readonly<{ dev: bigint; ino: bigint; uid: bigint; mode: bigint }>;
}
const hash = (raw: Uint8Array) => createHash('sha256').update(raw).digest('hex');

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
    finalCapture: async (capture) => {
      await retainBootstrapGrantFile(
        original.directory,
        `publication-${nonce}.json`,
        Buffer.from(JSON.stringify(capture)),
      );
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
  const execute = options.executorFactory ? options.executorFactory(policy) : signalFreeTerraformExecutor(policy);
  const result = await execute({
    cwd: original.directory,
    args: [
      '-I',
      '-B',
      script.path,
      original.directory,
      name,
      nonce,
      sha256,
      ...(['dev', 'ino', 'uid', 'mode'] as const).map((key) => original.identity[key].toString()),
    ],
    env: { PATH: '/usr/bin:/bin' },
  });
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
