import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { decodeEvidenceObject } from '../../../terraform/src/evidence-json';
import { readOwnedInstalledInput } from '../../../terraform/src/installed-runtime';
import { linuxMonotonicMs } from '../../../terraform/src/linux-clock';
import {
  type FinalExecutionCapture,
  type SignalFreeExecutionPolicy,
  signalFreeTerraformExecutor,
} from '../../../terraform/src/signal-free-executor';
import type { GcloudExecApi } from '../gcloud/exec';
import { gcpTeardownResourceObservationArgs } from './deployment-teardown';
import {
  gcpFirewallInsertObservationArgs,
  gcpObserverLiveObservationArgs,
  publicTerraformCloudScope,
} from './terraform-public-ownership';
import type { GcpCeIntent } from './types';
import { validateIntent } from './validation';

interface GcpCaptureCleanupCliOptions {
  readonly intent: GcpCeIntent;
  readonly directory: string;
  readonly diagnosticsDirectory: string;
  readonly python: SignalFreeExecutionPolicy['python'];
  readonly gcloud: SignalFreeExecutionPolicy['executable'];
  readonly account: string;
  readonly configuration: string;
  readonly environment: Record<string, string | undefined>;
  /** Compiled guards over pinned CLI, original selected account and configuration. */
  assertInputs(): Promise<void>;
  /** Independently verify physical closure of every original executor and reader. */
  assertIndependentClosure(): Promise<void>;
}

/** Exact source-owned reads used by interrupted create and reviewed teardown.
 * A read inventory grants neither ownership nor mutation authorization. */
export function gcpCaptureCleanupReadCommands(intent: GcpCeIntent): readonly (readonly string[])[] {
  validateIntent(intent);
  if (intent.engine !== 'terraform') throw new Error('Original Terraform cleanup engine required');
  const scope = publicTerraformCloudScope(intent);
  const commands = scope.map((resource) => gcpTeardownResourceObservationArgs(resource));
  for (const resource of scope.filter((row) => row.kind === 'firewall')) {
    const name = resource.selfLink.split('/').at(-1);
    if (!name) throw new Error('Original cleanup firewall name required');
    commands.push(...gcpFirewallInsertObservationArgs(intent, name, resource.selfLink));
  }
  if (intent.schemaVersion === 2)
    commands.push(gcpObserverLiveObservationArgs(intent, 'disk'), gcpObserverLiveObservationArgs(intent, 'instance'));
  return Object.freeze(commands.map((args) => Object.freeze(args)));
}

async function readCleanupStderr(path: string): Promise<string> {
  const before = await lstat(path, { bigint: true });
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.uid !== BigInt(process.getuid?.() ?? -1) ||
    before.nlink !== 1n ||
    (before.mode & 0o077n) !== 0n ||
    before.size > 1048576n ||
    (await realpath(path)) !== path
  )
    throw new Error('Original bounded private cleanup output required');
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  const same = (value: typeof before) =>
    (['dev', 'ino', 'uid', 'nlink', 'mode', 'size', 'mtimeNs', 'ctimeNs'] as const).every(
      (key) => value[key] === before[key],
    );
  try {
    if (!same(await file.stat({ bigint: true }))) throw new Error('Original cleanup output replaced before read');
    const bytes = await file.readFile();
    if (
      BigInt(bytes.length) !== before.size ||
      !same(await file.stat({ bigint: true })) ||
      !same(await lstat(path, { bigint: true }))
    )
      throw new Error('Original cleanup output changed during read');
    return bytes.toString('utf8');
  } finally {
    await file.close();
  }
}

/** Concrete CLI transport for compiled cleanup composition. It preserves failed
 * claims, original scope and natural child completion without process signals. */
export function createGcpCaptureCleanupCli(options: GcpCaptureCleanupCliOptions): GcloudExecApi {
  const intent = structuredClone(options.intent);
  const allowed = new Set(gcpCaptureCleanupReadCommands(intent).map((args) => JSON.stringify(args)));
  const directory = options.directory,
    diagnosticsDirectory = options.diagnosticsDirectory;
  const account = options.account,
    configuration = options.configuration;
  const environment = { ...options.environment };
  const alternatives = [
    'CLOUDSDK_AUTH_ACCESS_TOKEN',
    'CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE',
    'CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT',
  ];
  if (
    !isAbsolute(directory) ||
    resolve(directory) !== directory ||
    !isAbsolute(diagnosticsDirectory) ||
    resolve(diagnosticsDirectory) !== diagnosticsDirectory ||
    directory === diagnosticsDirectory ||
    diagnosticsDirectory === join(directory, '.terraform-executor-lock') ||
    diagnosticsDirectory.startsWith(`${join(directory, '.terraform-executor-lock')}/`) ||
    typeof account !== 'string' ||
    !account ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_.@+-]{0,253}$/.test(account) ||
    account.startsWith('-') ||
    typeof configuration !== 'string' ||
    !/^[a-z][a-z0-9-]{0,127}$/.test(configuration) ||
    !environment.CLOUDSDK_CONFIG ||
    !isAbsolute(environment.CLOUDSDK_CONFIG) ||
    resolve(environment.CLOUDSDK_CONFIG) !== environment.CLOUDSDK_CONFIG ||
    alternatives.some((key) => environment[key] !== undefined) ||
    (environment.CLOUDSDK_CORE_ACCOUNT !== undefined && environment.CLOUDSDK_CORE_ACCOUNT !== account) ||
    (environment.CLOUDSDK_ACTIVE_CONFIG_NAME !== undefined &&
      environment.CLOUDSDK_ACTIVE_CONFIG_NAME !== configuration) ||
    (environment.CLOUDSDK_CORE_PROJECT !== undefined && environment.CLOUDSDK_CORE_PROJECT !== intent.project) ||
    typeof options.assertInputs !== 'function' ||
    typeof options.assertIndependentClosure !== 'function'
  )
    throw new Error('Original scoped cleanup CLI, private directories and credential guards required');
  Object.assign(environment, {
    CLOUDSDK_CORE_ACCOUNT: account,
    CLOUDSDK_ACTIVE_CONFIG_NAME: configuration,
    CLOUDSDK_CORE_PROJECT: intent.project,
    CLOUDSDK_CORE_DISABLE_PROMPTS: '1',
  });
  Object.freeze(environment);
  const python = Object.freeze({ ...options.python }),
    executable = Object.freeze({ ...options.gcloud });
  const assertInputs = options.assertInputs.bind(options),
    assertIndependentClosure = options.assertIndependentClosure.bind(options);
  const start = linuxMonotonicMs(),
    deadline = start + 7200000;
  let active = false,
    retired = false;
  const inspect = async (path: string) => {
    const value = await lstat(path, { bigint: true });
    if (
      !value.isDirectory() ||
      value.isSymbolicLink() ||
      value.uid !== BigInt(process.getuid?.() ?? -1) ||
      (value.mode & 0o777n) !== 0o700n ||
      (await realpath(path)) !== path
    )
      throw new Error('Original private cleanup observation directory required');
    return value;
  };
  const roots = Promise.all([inspect(directory), inspect(diagnosticsDirectory)]);
  roots.catch(() => {});
  const guard = async () => {
    if (retired) throw new Error('Original cleanup observation transport retired');
    const originals = await roots;
    for (const [index, path] of [directory, diagnosticsDirectory].entries()) {
      const original = originals[index],
        current = await inspect(path);
      if (
        !original ||
        current.dev !== original.dev ||
        current.ino !== original.ino ||
        current.uid !== original.uid ||
        current.mode !== original.mode
      )
        throw new Error('Original cleanup observation directory identity changed');
    }
    await assertInputs();
    await assertIndependentClosure();
    await assertInputs();
  };
  return Object.freeze({
    exec: async (command, supplied, invocation = {}) => {
      const args = [...supplied],
        signal = invocation.signal;
      if (command !== 'gcloud' || !allowed.has(JSON.stringify(args)))
        throw new Error('Cleanup observation escaped exact original read-only argv');
      if (active || retired) throw new Error('Original cleanup observation transport active or retired');
      signal?.throwIfAborted();
      if (linuxMonotonicMs() >= deadline) throw new Error('Original cleanup observation budget exhausted');
      active = true;
      try {
        await guard();
        const commandDirectory = join(diagnosticsDirectory, randomUUID());
        await mkdir(commandDirectory, { mode: 0o700 });
        let capture: FinalExecutionCapture | undefined;
        const execute = signalFreeTerraformExecutor({
          python,
          executable,
          originalStartMs: start,
          originalDeadlineMs: deadline,
          timeoutMs: 60000,
          startupTimeoutMs: 15000,
          maxOutputBytes: 1048576,
          assertOriginal: guard,
          finalCapture: async (current) => {
            capture = current;
            await writeFile(
              join(commandDirectory, 'cleanup-observation-partial.private.json'),
              JSON.stringify(current),
              { flag: 'wx', mode: 0o400 },
            );
          },
        });
        const result = await execute({
          cwd: commandDirectory,
          args: [...args, `--account=${account}`, `--configuration=${configuration}`],
          env: environment,
          signal,
        });
        if (!capture) throw new Error('Original cleanup observation final capture missing');
        const completion = await readOwnedInstalledInput(
          join(dirname(capture.stdoutPath), 'completion.private.json'),
          1048576,
        );
        const final = decodeEvidenceObject(completion.bytes);
        if (
          JSON.stringify(final.identity) !== JSON.stringify(capture.identity) ||
          final.originalDeadlineMs !== deadline ||
          final.originalGroupClosed !== true ||
          final.signalsSent !== false ||
          final.finalStartedMs !== capture.finalStartedMs ||
          final.finalDeadlineMs !== capture.finalDeadlineMs
        )
          throw new Error('Original cleanup observation completion binding differs');
        await writeFile(
          join(commandDirectory, 'cleanup-observation-final.private.json'),
          JSON.stringify({ ...final, completionInput: completion.binding }),
          { flag: 'wx', mode: 0o400 },
        );
        await guard();
        signal?.throwIfAborted();
        if (final.reason || final.captureClosed !== true) throw new Error('Original cleanup observation incomplete');
        const stderr = await readCleanupStderr(capture.stderrPath);
        await guard();
        signal?.throwIfAborted();
        return { stdout: result.stdout, stderr, exitCode: result.code };
      } catch (error) {
        retired = true;
        throw error;
      } finally {
        active = false;
      }
    },
  } satisfies GcloudExecApi);
}
