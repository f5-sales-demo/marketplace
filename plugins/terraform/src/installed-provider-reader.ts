import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, open, realpath } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import sources from './gcp-capture-source-pins.json';
import { freezeAdmittedCaptureInputs, type InstalledCaptureContext } from './installed-capture-context';
import { readOwnedInstalledInput } from './installed-runtime';
import pins from './installed-runtime-pins.json';
import { linuxMonotonicMs } from './linux-clock';
import { monitorOriginalInputs, type OriginalInputBinding } from './original-input-monitor';
import { assertFinalReaderReserve, type FinalReaderReserve, inspectFinalReaderReserve } from './reader-final-reserve';
import type { Executor } from './runner';
import { withFinalCheck } from './session-lifetime';
import {
  type ExecutionCaptureAdmission,
  type FinalExecutionCapture,
  type SignalFreeExecutionPolicy,
  signalFreeFinalReaderExecutor,
  signalFreeTerraformExecutor,
} from './signal-free-executor';

type Identity = ExecutionCaptureAdmission['identity'];
type Json = Record<string, unknown>;
const hash = (raw: Uint8Array) => createHash('sha256').update(raw).digest('hex');
const equalIdentity = (value: unknown, original: Identity | undefined): boolean => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !original) return false;
  const row = value as Json;
  return (
    Object.keys(row).sort().join(',') === 'boot,group,pid,start' &&
    ['pid', 'group', 'start', 'boot'].every((key) => row[key] === original[key as keyof Identity])
  );
};
const object = (value: unknown): Json => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Malformed original provider reader result');
  return value as Json;
};
export interface InstalledProviderCandidate {
  readonly pid: number;
  readonly group: number;
  readonly start: string;
  readonly boot: string;
  readonly parent: number;
  readonly executable_sha256: string;
}
export interface InstalledProviderCohort {
  readonly schemaVersion: 1;
  readonly kind: 'original-provider-cohort';
  readonly executor: Identity;
  readonly reader: Identity;
  readonly candidates: readonly InstalledProviderCandidate[];
  readonly executorAvailable: boolean;
  readonly executorGroupClosed: boolean;
  readonly applyPhaseQualified: false;
  readonly signalsSent: false;
  readonly cloudSubmissions: 0;
  readonly requestSha256: string;
  readonly evidencePath: string;
  readonly evidenceSha256: string;
}
export interface InstalledProviderReaderOptions {
  /** Offline fixture seam only; installed capture uses the real executor by default. */
  executorFactory?: (policy: SignalFreeExecutionPolicy, reserve?: FinalReaderReserve) => Executor;
}
/** Real one-shot source-owned reader, bound to one original installed apply invocation.
 * Results are attributed candidates, never an apply RPC or resource-create authorization.
 */
export async function openInstalledProviderReader(
  context: InstalledCaptureContext,
  input: ExecutionCaptureAdmission,
  options: InstalledProviderReaderOptions = {},
) {
  if (
    context.schemaVersion !== 2 ||
    context.kind !== 'original-installed-gcp-capture-context' ||
    input.directory !== context.executionDirectory ||
    input.args[0] !== 'apply' ||
    input.originalStartMs !== context.budget.start ||
    input.originalDeadlineMs !== context.budget.deadline ||
    !Number.isSafeInteger(input.identity.pid) ||
    input.identity.pid <= 0 ||
    input.identity.group !== input.identity.pid ||
    !/^[0-9]+$/.test(input.identity.start) ||
    !/^[a-f0-9-]{36}$/.test(input.identity.boot)
  )
    throw new Error('Trusted original installed apply reader scope required');
  const admission = Object.freeze({
    ...input,
    identity: Object.freeze({ ...input.identity }),
    args: Object.freeze([...input.args]),
  });
  const inputs = freezeAdmittedCaptureInputs(context.inputs);
  const script = inputs['script:gcp_provider_reader.py'];
  if (
    !script ||
    Object.entries(sources.files).some(
      ([name, expected]) =>
        inputs[`script:${name}`]?.path !== join(dirname(script.path), name) ||
        inputs[`script:${name}`]?.sha256 !== expected,
    ) ||
    inputs.python?.sha256 !== pins.pythonSha256 ||
    inputs.terraform?.sha256 !== pins.terraformSha256
  )
    throw new Error('All original installed provider reader sources and executable pins required');
  const providers = await context.readProviderInputs();
  const google = providers['registry.terraform.io/hashicorp/google:terraform-provider-google_v8.7.0_x5'];
  if (!google || google.sha256 !== pins.googleProviderSha256 || Object.keys(providers).length !== 6)
    throw new Error('All original qualified installed provider inputs required');
  const allInputs = freezeAdmittedCaptureInputs({ ...inputs, ...providers });
  await context.assertInputs();
  const root = join(context.executionDirectory, `gcp-provider-readers-${randomUUID()}`);
  await mkdir(root, { mode: 0o700 });
  const originalRoot = await lstat(root, { bigint: true });
  let retired = false;
  const captures: FinalExecutionCapture[] = [];
  const assertProviderSnapshot = async () => {
    const current = freezeAdmittedCaptureInputs({ ...inputs, ...(await context.readProviderInputs()) });
    if (JSON.stringify(current) !== JSON.stringify(allInputs))
      throw new Error('Original provider reader input admission changed');
  };
  const assertOriginal = async () => {
    await context.assertInputs();
    const actual = await lstat(root, { bigint: true });
    if (
      !actual.isDirectory() ||
      actual.dev !== originalRoot.dev ||
      actual.ino !== originalRoot.ino ||
      actual.uid !== originalRoot.uid ||
      actual.mode !== originalRoot.mode ||
      (await realpath(root)) !== root
    )
      throw new Error('Original provider reader directory changed');
    await context.assertInputs();
  };
  const persist = async (path: string, raw: Uint8Array): Promise<OriginalInputBinding> => {
    const parent = await lstat(dirname(path), { bigint: true });
    let expectedIdentity: OriginalInputBinding['expectedIdentity'];
    const handle = await open(path, 'wx', 0o400);
    try {
      await handle.writeFile(raw);
      await handle.sync();
      const file = await handle.stat({ bigint: true });
      const fields = ['dev', 'ino', 'uid', 'nlink', 'mode', 'size', 'mtimeNs', 'ctimeNs'] as const;
      expectedIdentity = Object.fromEntries(fields.map((field) => [field, String(file[field])])) as NonNullable<
        OriginalInputBinding['expectedIdentity']
      >;
    } finally {
      await handle.close();
    }
    const directory = await open(dirname(path), 'r');
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
    return {
      path,
      sha256: hash(raw),
      expectedIdentity,
      expectedParentIdentity: {
        dev: String(parent.dev),
        ino: String(parent.ino),
        uid: String(parent.uid),
        mode: String(parent.mode),
      },
    };
  };
  return Object.freeze({
    root,
    assertOriginal,
    captures: () => Object.freeze([...captures]),
    async read(reserve?: FinalReaderReserve): Promise<InstalledProviderCohort> {
      if (retired) throw new Error('Original installed provider reader is retired');
      let requestMonitor: Awaited<ReturnType<typeof monitorOriginalInputs>> | undefined;
      let childDirectory: { path: string; identity: Awaited<ReturnType<typeof lstat>> } | undefined;
      const sourceGuard = async () => {
        await assertOriginal();
        if (childDirectory) {
          const actual = await lstat(childDirectory.path);
          const original = childDirectory.identity;
          if (
            !actual.isDirectory() ||
            actual.dev !== original.dev ||
            actual.ino !== original.ino ||
            actual.uid !== original.uid ||
            actual.mode !== original.mode ||
            (await realpath(childDirectory.path)) !== childDirectory.path
          )
            throw new Error('Original provider execution directory changed');
        }
        await requestMonitor?.assertOriginal();
      };
      const guard = async () => {
        await sourceGuard();
        if (reserve) {
          const final = inspectFinalReaderReserve(reserve);
          if (
            !equalIdentity(final.identity, admission.identity) ||
            final.originalStartMs !== context.budget.start ||
            final.originalDeadlineMs !== context.budget.deadline
          )
            throw new Error('Original final reader parent differs');
          await assertFinalReaderReserve(reserve);
        } else if (linuxMonotonicMs() >= context.budget.deadline)
          throw new Error('Original provider operation deadline exhausted');
      };
      try {
        return await withFinalCheck(
          async () => {
            await guard();
            const directory = join(root, randomUUID());
            await mkdir(directory, { mode: 0o700 });
            childDirectory = { path: directory, identity: await lstat(directory) };
            const final = reserve ? inspectFinalReaderReserve(reserve) : undefined;
            const request = {
              schemaVersion: 1,
              inputs: allInputs,
              executables: { bootstrap: inputs.python, terraform: inputs.terraform, provider: google },
              originalStartMs: context.budget.start,
              deadlineMs: context.budget.deadline,
              executor: admission.identity,
              ...(final
                ? { finalCapture: { finalStartedMs: final.finalStartedMs, finalDeadlineMs: final.finalDeadlineMs } }
                : {}),
            };
            const bytes = Buffer.from(JSON.stringify(request)),
              requestPath = join(directory, 'request.private.json');
            const requestBinding = await persist(requestPath, bytes);
            requestMonitor = await monitorOriginalInputs({ request: requestBinding });
            await guard();
            let readerIdentity: Identity | undefined;
            let complete = false;
            const policy: SignalFreeExecutionPolicy = {
              python: { path: inputs.python.path, sha256: pins.pythonSha256 },
              executable: { path: inputs.python.path, sha256: pins.pythonSha256 },
              originalStartMs: context.budget.start,
              originalDeadlineMs: context.budget.deadline,
              timeoutMs: 60_000,
              assertOriginal: reserve ? sourceGuard : guard,
              beforeRelease: async (admitted) => {
                readerIdentity = Object.freeze({ ...admitted.identity });
              },
              finalCapture: async (capture) => {
                captures.push(capture);
                await persist(join(directory, 'capture.private.json'), Buffer.from(JSON.stringify(capture)));
                if (
                  !equalIdentity(capture.identity, readerIdentity) ||
                  capture.pid !== readerIdentity?.pid ||
                  capture.reason ||
                  capture.actualExitCode !== 0 ||
                  !capture.originalGroupClosed ||
                  capture.originalDeadlineMs !== context.budget.deadline ||
                  (final &&
                    (capture.finalStartedMs !== final.finalStartedMs ||
                      capture.finalDeadlineMs !== final.finalDeadlineMs))
                )
                  throw new Error('Original provider SDK reader closure incomplete');
                await guard();
                complete = true;
              },
            };
            const execute = options.executorFactory
              ? options.executorFactory(policy, reserve)
              : reserve
                ? signalFreeFinalReaderExecutor(policy, reserve)
                : signalFreeTerraformExecutor(policy);
            const outcome = await execute({
              cwd: directory,
              args: ['-I', '-B', script.path, '--request', requestPath, '--sha256', hash(bytes)],
              env: { PATH: '/usr/bin:/bin' },
            });
            if (outcome.code !== 0 || !complete) throw new Error('Original provider SDK reader failed');
            const path = join(directory, 'provider-result.private.json');
            const resultInput = await readOwnedInstalledInput(path, 65536);
            const resultIdentity = resultInput.binding.expectedIdentity;
            if (!resultIdentity || (BigInt(resultIdentity.mode) & 0o077n) !== 0n)
              throw new Error('Original private provider result required');
            const raw = resultInput.bytes;
            const value = object(JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(raw)));
            if (
              value.schemaVersion !== 1 ||
              value.kind !== 'original-provider-cohort' ||
              value.requestSha256 !== hash(bytes) ||
              !equalIdentity(value.executor, admission.identity) ||
              !equalIdentity(value.reader, readerIdentity) ||
              !Array.isArray(value.candidates) ||
              typeof value.executorAvailable !== 'boolean' ||
              typeof value.executorGroupClosed !== 'boolean' ||
              (value.executorAvailable && value.executorGroupClosed) ||
              value.applyPhaseQualified !== false ||
              value.signalsSent !== false ||
              value.cloudSubmissions !== 0
            )
              throw new Error('Original provider result attribution differs');
            const seen = new Set<number>();
            const candidates = value.candidates.map((rawCandidate) => {
              const candidate = object(rawCandidate);
              if (
                Object.keys(candidate).sort().join(',') !== 'boot,executable_sha256,group,parent,pid,start' ||
                !Number.isSafeInteger(candidate.pid) ||
                (candidate.pid as number) <= 0 ||
                seen.has(candidate.pid as number) ||
                candidate.parent !== admission.identity.pid ||
                candidate.group !== admission.identity.group ||
                candidate.boot !== admission.identity.boot ||
                typeof candidate.start !== 'string' ||
                !/^[0-9]+$/.test(candidate.start) ||
                candidate.executable_sha256 !== pins.googleProviderSha256
              )
                throw new Error('Original provider candidate ownership differs');
              seen.add(candidate.pid as number);
              return Object.freeze(candidate) as unknown as InstalledProviderCandidate;
            });
            await guard();
            return Object.freeze({
              schemaVersion: 1,
              kind: 'original-provider-cohort',
              requestSha256: hash(bytes),
              executor: admission.identity,
              reader: readerIdentity as Identity,
              candidates: Object.freeze(candidates),
              executorAvailable: value.executorAvailable,
              executorGroupClosed: value.executorGroupClosed,
              applyPhaseQualified: false,
              signalsSent: false,
              cloudSubmissions: 0,
              evidencePath: path,
              evidenceSha256: hash(raw),
            });
          },
          async () => {
            await guard();
            await assertProviderSnapshot();
          },
          'Original provider reader and final input verification failed',
        );
      } catch (error) {
        retired = true;
        throw error;
      } finally {
        requestMonitor?.close();
      }
    },
  });
}
