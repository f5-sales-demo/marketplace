import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, open, realpath } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { decodeEvidenceObject } from './evidence-json';
import sources from './gcp-capture-source-pins.json';
import { freezeAdmittedCaptureInputs, type InstalledCaptureContext } from './installed-capture-context';
import { readOwnedInstalledInput } from './installed-runtime';
import pins from './installed-runtime-pins.json';
import { resolveInstalledGcpExecutableProfile } from './installed-version-profile';
import { linuxMonotonicMs } from './linux-clock';
import { assertSameOriginalInput, monitorOriginalInputs, type OriginalInputBinding } from './original-input-monitor';
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

const windowOrigins = new WeakMap<InstalledProviderWindow, () => Promise<Buffer>>();
export async function readOriginalInstalledProviderWindow(window: InstalledProviderWindow): Promise<Buffer> {
  const read = windowOrigins.get(window);
  if (!read) throw new Error('An original reader-issued provider window is required');
  return read();
}
export interface InstalledProviderClockSample {
  readonly monotonicBeforeMs: number;
  readonly epochMs: number;
  readonly monotonicAfterMs: number;
}
export interface InstalledProviderWindowClock {
  readonly before: InstalledProviderClockSample;
  readonly after: InstalledProviderClockSample;
  readonly offsetLowerMs: number;
  readonly offsetUpperMs: number;
}
const windowClockOrigins = new WeakMap<InstalledProviderWindow, () => Promise<InstalledProviderWindowClock>>();
/** Endpoint clock correspondence from the same original window issuance.
 * This does not prove continuous provider lifetime or unseen clock behavior.
 */
export async function readOriginalInstalledProviderWindowClock(window: InstalledProviderWindow) {
  const read = windowClockOrigins.get(window);
  if (!read) throw new Error('An original reader-issued window clock is required');
  return read();
}
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

export interface InstalledProviderWindowReady {
  readonly schemaVersion: 3 | 4;
  readonly kind: 'original-provider-stderr-ready';
  readonly executor: Identity;
  readonly reader: Identity;
  readonly windowStartedMs: number;
  readonly windowDeadlineMs: number;
  readonly requestSha256: string;
  readonly evidencePath: string;
  readonly evidenceSha256: string;
  readonly applyPhaseQualified: false;
  readonly signalsSent: false;
  readonly cloudSubmissions: 0;
}
export interface InstalledProviderWindowObservation {
  readonly candidate: InstalledProviderCandidate;
  readonly stderr: Readonly<{
    providerFd: 2;
    parentFd: number;
    device: string;
    inode: string;
    providerFlags: number;
    parentFlags: number;
  }>;
  readonly firstObservedMs: number;
  readonly lastObservedMs: number;
  readonly presentAtLastSample: boolean;
}
export interface InstalledProviderWindow
  extends Omit<InstalledProviderCohort, 'schemaVersion' | 'kind' | 'candidates'> {
  readonly schemaVersion: 3 | 4;
  readonly kind: 'original-provider-stderr-coherent-window' | 'original-provider-stderr-verified-window';
  readonly verificationPolicy?: 'completed-before-window-end';
  readonly boundaryAttempts?: number;
  readonly windowStartedMs: number;
  readonly windowDeadlineMs: number;
  readonly finishedMs: number;
  readonly samplingWindowComplete: true;
  readonly observations: readonly InstalledProviderWindowObservation[];
}
interface WindowStartup {
  resolve(value: InstalledProviderWindowReady): void;
  reject(error: unknown): void;
}

export interface InstalledProviderReaderOptions {
  /** Offline fixture seam only; installed capture uses the real executor by default. */
  executorFactory?: (policy: SignalFreeExecutionPolicy, reserve?: FinalReaderReserve) => Executor;
  /** Offline clock seam must be paired with the explicit fixture executor. */
  clock?: () => number;
  /** Paired epoch seam is confined to explicit offline executor fixtures. */
  epochClock?: () => number;
}
/** Real one-shot source-owned reader, bound to one original installed apply invocation.
 * Results are attributed candidates, never an apply RPC or resource-create authorization.
 */
export async function openInstalledProviderReader(
  context: InstalledCaptureContext,
  input: ExecutionCaptureAdmission,
  options: InstalledProviderReaderOptions = {},
) {
  if (options.clock && !options.executorFactory) throw new Error('Offline clock requires explicit fixture executor');
  if (options.epochClock && !options.executorFactory)
    throw new Error('Offline epoch clock requires explicit fixture executor');
  const clock = options.clock ?? linuxMonotonicMs;
  const epochClock = options.epochClock ?? Date.now;
  const captureClock = (): InstalledProviderClockSample => {
    const monotonicBeforeMs = clock();
    const epochMs = epochClock();
    const monotonicAfterMs = clock();
    return Object.freeze({ monotonicBeforeMs, epochMs, monotonicAfterMs });
  };

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
  const providers = await context.readProviderInputs();
  const googleBindings = Object.entries(providers).filter(([name]) =>
    /^registry\.terraform\.io\/hashicorp\/google:terraform-provider-google_v\d+\.\d+\.\d+_x5$/.test(name),
  );
  if (googleBindings.length !== 1) throw new Error('One original Google provider executable binding required');
  const versionProfile = resolveInstalledGcpExecutableProfile(
    inputs.terraform?.sha256 ?? '',
    googleBindings[0][1].sha256,
  );
  const windowVersion = ['8.10.0', '8.11.0'].includes(versionProfile.googleVersion) ? 4 : 3;
  const windowKind =
    windowVersion === 4 ? 'original-provider-stderr-verified-window' : 'original-provider-stderr-coherent-window';
  const script = inputs['script:gcp_provider_reader.py'];
  if (
    !script ||
    Object.entries(sources.files).some(
      ([name, expected]) =>
        inputs[`script:${name}`]?.path !== join(dirname(script.path), name) ||
        inputs[`script:${name}`]?.sha256 !== expected,
    ) ||
    inputs.python?.sha256 !== pins.pythonSha256 ||
    inputs.terraform?.sha256 !== versionProfile.terraformSha256
  )
    throw new Error('All original installed provider reader sources and executable pins required');
  const google =
    providers[`registry.terraform.io/hashicorp/google:terraform-provider-google_v${versionProfile.googleVersion}_x5`];
  if (!google || google.sha256 !== versionProfile.googleProviderSha256 || Object.keys(providers).length !== 6)
    throw new Error('All original qualified installed provider inputs required');
  const allInputs = freezeAdmittedCaptureInputs({ ...inputs, ...providers });
  await context.assertInputs();
  const root = join(context.executionDirectory, `gcp-provider-readers-${randomUUID()}`);
  await mkdir(root, { mode: 0o700 });
  const originalRoot = await lstat(root, { bigint: true });
  let retired = false;
  let windowReadyOnce = false;
  let parentClosed = false;
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
  const readInternal = async (
    reserve?: FinalReaderReserve,
    startup?: WindowStartup,
  ): Promise<InstalledProviderCohort | InstalledProviderWindow> => {
    if (retired) throw new Error('Original installed provider reader is retired');
    let requestMonitor: Awaited<ReturnType<typeof monitorOriginalInputs>> | undefined;
    let readyMonitor: Awaited<ReturnType<typeof monitorOriginalInputs>> | undefined;
    const initialWindow = !windowReadyOnce;
    const beforeClock = captureClock();
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
      await readyMonitor?.assertOriginal();
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
      } else if (clock() >= context.budget.deadline) throw new Error('Original provider operation deadline exhausted');
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
            schemaVersion: startup ? windowVersion : 1,
            ...(startup ? { kind: windowKind, windowMs: 45000 } : {}),
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
          let readerStartupDeadline: number | undefined;
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
              readerStartupDeadline = admitted.startupDeadlineMs;
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
          let terminal = false;
          const pending = execute({
            cwd: directory,
            args: ['-I', '-B', script.path, '--request', requestPath, '--sha256', hash(bytes)],
            env: { PATH: '/usr/bin:/bin' },
          });
          pending.then(
            () => {
              terminal = true;
            },
            () => {
              terminal = true;
            },
          );
          let windowReady: InstalledProviderWindowReady | undefined;
          let startupFailure: unknown;
          if (startup) {
            try {
              const path = join(directory, 'provider-ready.private.json');
              while (!(await Bun.file(path).exists())) {
                await guard();
                if (terminal) throw new Error('Original provider window ended before readiness');
                if (
                  clock() >=
                  Math.min(
                    initialWindow ? admission.startupDeadlineMs : context.budget.deadline,
                    readerStartupDeadline ?? context.budget.deadline,
                  )
                )
                  throw new Error('Original provider window startup exhausted');
                await Bun.sleep(25);
              }
              await guard();
              const input = await readOwnedInstalledInput(path, 65536);
              if (!input.binding.expectedIdentity || (BigInt(input.binding.expectedIdentity.mode) & 0o077n) !== 0n)
                throw new Error('Original private provider readiness required');
              const value = decodeEvidenceObject(input.bytes);
              const keys = [
                'schemaVersion',
                'kind',
                'requestSha256',
                'executor',
                'reader',
                'windowStartedMs',
                'windowDeadlineMs',
                'applyPhaseQualified',
                'signalsSent',
                'cloudSubmissions',
              ]
                .sort()
                .join(',');
              const originalReader = readerIdentity;
              const began = value.windowStartedMs,
                ended = value.windowDeadlineMs;
              if (
                !originalReader ||
                Object.keys(value).sort().join(',') !== keys ||
                value.schemaVersion !== windowVersion ||
                value.kind !== 'original-provider-stderr-ready' ||
                value.requestSha256 !== hash(bytes) ||
                !equalIdentity(value.executor, admission.identity) ||
                !equalIdentity(value.reader, readerIdentity) ||
                !Number.isSafeInteger(began) ||
                !Number.isSafeInteger(ended) ||
                (began as number) < context.budget.start ||
                (began as number) > clock() ||
                clock() - (began as number) >= 15000 ||
                ended !== Math.min((began as number) + 45000, context.budget.deadline) ||
                (initialWindow && clock() >= admission.startupDeadlineMs) ||
                value.applyPhaseQualified !== false ||
                value.signalsSent !== false ||
                value.cloudSubmissions !== 0
              )
                throw new Error('Original provider window readiness attribution differs');
              readyMonitor = await monitorOriginalInputs({ ready: input.binding });
              windowReady = Object.freeze({
                ...value,
                executor: admission.identity,
                reader: originalReader,
                evidencePath: path,
                evidenceSha256: hash(input.bytes),
              }) as unknown as InstalledProviderWindowReady;
              await guard();
              windowReadyOnce = true;
              startup.resolve(windowReady);
            } catch (error) {
              startupFailure = error;
              startup.reject(error);
            }
          }
          const outcome = await pending;
          if (startupFailure) throw startupFailure;
          if (outcome.code !== 0 || !complete) throw new Error('Original provider SDK reader failed');
          const path = join(directory, 'provider-result.private.json');
          const resultInput = await readOwnedInstalledInput(path, 65536);
          const resultIdentity = resultInput.binding.expectedIdentity;
          if (!resultIdentity || (BigInt(resultIdentity.mode) & 0o077n) !== 0n)
            throw new Error('Original private provider result required');
          const raw = resultInput.bytes;
          const value = decodeEvidenceObject(raw);
          const originalReader = readerIdentity;
          if (!originalReader) throw new Error('Original provider reader identity absent');
          if (
            value.schemaVersion !== (startup ? windowVersion : 1) ||
            value.kind !== (startup ? windowKind : 'original-provider-cohort') ||
            value.requestSha256 !== hash(bytes) ||
            !equalIdentity(value.executor, admission.identity) ||
            !equalIdentity(value.reader, readerIdentity) ||
            (!startup && !Array.isArray(value.candidates)) ||
            typeof value.executorAvailable !== 'boolean' ||
            typeof value.executorGroupClosed !== 'boolean' ||
            (value.executorAvailable && value.executorGroupClosed) ||
            value.applyPhaseQualified !== false ||
            value.signalsSent !== false ||
            value.cloudSubmissions !== 0
          )
            throw new Error('Original provider result attribution differs');
          const seen = new Set<number>();
          const candidateFrom = (rawCandidate: unknown) => {
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
              candidate.executable_sha256 !== versionProfile.googleProviderSha256
            )
              throw new Error('Original provider candidate ownership differs');
            seen.add(candidate.pid as number);
            return Object.freeze(candidate) as unknown as InstalledProviderCandidate;
          };
          if (startup) {
            const keys = [
              'schemaVersion',
              'kind',
              'requestSha256',
              'executor',
              'reader',
              'executorAvailable',
              'executorGroupClosed',
              'applyPhaseQualified',
              'signalsSent',
              'cloudSubmissions',
              'windowStartedMs',
              'windowDeadlineMs',
              'finishedMs',
              'samplingWindowComplete',
              'observations',
              ...(windowVersion === 4 ? ['verificationPolicy', 'boundaryAttempts'] : []),
            ]
              .sort()
              .join(',');
            if (
              !windowReady ||
              Object.keys(value).sort().join(',') !== keys ||
              value.windowStartedMs !== windowReady.windowStartedMs ||
              value.windowDeadlineMs !== windowReady.windowDeadlineMs ||
              value.samplingWindowComplete !== true ||
              (windowVersion === 4 &&
                (value.verificationPolicy !== 'completed-before-window-end' ||
                  !Number.isSafeInteger(value.boundaryAttempts) ||
                  (value.boundaryAttempts as number) < 0 ||
                  (value.boundaryAttempts as number) > 1 ||
                  (value.finishedMs as number) - windowReady.windowStartedMs >= 60000 ||
                  !Array.isArray(value.observations) ||
                  value.observations.length === 0)) ||
              !Number.isSafeInteger(value.finishedMs) ||
              (value.finishedMs as number) < windowReady.windowStartedMs ||
              (value.finishedMs as number) > clock() ||
              (!value.executorGroupClosed && (value.finishedMs as number) < windowReady.windowDeadlineMs) ||
              !Array.isArray(value.observations) ||
              value.observations.length > 64
            )
              throw new Error('Original provider window incomplete or premature');
            const ready = windowReady;
            const observations = value.observations.map((rawObservation) => {
              const observation = object(rawObservation);
              if (
                Object.keys(observation).sort().join(',') !==
                  'candidate,firstObservedMs,lastObservedMs,presentAtLastSample,stderr' ||
                !Number.isSafeInteger(observation.firstObservedMs) ||
                !Number.isSafeInteger(observation.lastObservedMs) ||
                (observation.firstObservedMs as number) < ready.windowStartedMs ||
                (observation.lastObservedMs as number) < (observation.firstObservedMs as number) ||
                (observation.lastObservedMs as number) > ready.windowDeadlineMs ||
                (windowVersion === 4 && (observation.lastObservedMs as number) >= ready.windowDeadlineMs) ||
                typeof observation.presentAtLastSample !== 'boolean'
              )
                throw new Error('Original provider window observation differs');
              const candidate = candidateFrom(observation.candidate),
                pipe = object(observation.stderr);
              if (
                Object.keys(pipe).sort().join(',') !== 'device,inode,parentFd,parentFlags,providerFd,providerFlags' ||
                pipe.providerFd !== 2 ||
                !Number.isSafeInteger(pipe.parentFd) ||
                (pipe.parentFd as number) < 0 ||
                typeof pipe.device !== 'string' ||
                !/^(?:0|[1-9][0-9]*)$/.test(pipe.device) ||
                typeof pipe.inode !== 'string' ||
                !/^[1-9][0-9]*$/.test(pipe.inode) ||
                !Number.isSafeInteger(pipe.providerFlags) ||
                !Number.isSafeInteger(pipe.parentFlags) ||
                (pipe.providerFlags as number) < 0 ||
                (pipe.parentFlags as number) < 0 ||
                ((pipe.providerFlags as number) & 3) !== 1 ||
                ((pipe.parentFlags as number) & 3) !== 0
              )
                throw new Error('Original provider stderr FIFO attribution differs');
              return Object.freeze({
                ...observation,
                candidate,
                stderr: Object.freeze({ ...pipe }),
              }) as unknown as InstalledProviderWindowObservation;
            });
            await guard();
            parentClosed = value.executorGroupClosed;
            const window = Object.freeze({
              ...value,
              executor: admission.identity,
              reader: originalReader,
              observations: Object.freeze(observations),
              evidencePath: path,
              evidenceSha256: hash(raw),
            }) as unknown as InstalledProviderWindow;
            const afterClock = captureClock();
            let clockRefused = false;
            windowClockOrigins.set(window, async () => {
              if (clockRefused) throw new Error('Original window clock correspondence was refused');
              try {
                await readOriginalInstalledProviderWindow(window);
                const samples = [beforeClock, afterClock];
                for (const sample of samples)
                  if (
                    !Object.values(sample).every((value) => Number.isSafeInteger(value) && value >= 0) ||
                    sample.monotonicAfterMs < sample.monotonicBeforeMs ||
                    sample.monotonicAfterMs - sample.monotonicBeforeMs > 100
                  )
                    throw new Error('Original paired window clock sample differs');
                const lower = samples.map((sample) => sample.epochMs - sample.monotonicAfterMs);
                const upper = samples.map((sample) => sample.epochMs - sample.monotonicBeforeMs);
                if (
                  afterClock.monotonicBeforeMs < beforeClock.monotonicAfterMs ||
                  afterClock.epochMs < beforeClock.epochMs ||
                  Math.max(...lower) - Math.min(...upper) > 100 ||
                  window.windowStartedMs < beforeClock.monotonicBeforeMs ||
                  window.finishedMs > afterClock.monotonicAfterMs
                )
                  throw new Error('Original window clocks changed offset or do not bracket sampling');
                await readOriginalInstalledProviderWindow(window);
                return Object.freeze({
                  before: beforeClock,
                  after: afterClock,
                  offsetLowerMs: Math.min(...lower),
                  offsetUpperMs: Math.max(...upper),
                });
              } catch (error) {
                clockRefused = true;
                throw error;
              }
            });
            windowOrigins.set(window, async () => {
              if (retired) throw new Error('Original provider window source retired');
              await assertOriginal();
              await assertProviderSnapshot();
              const current = await readOwnedInstalledInput(path, 65536);
              assertSameOriginalInput(resultInput.binding, current.binding);
              if (hash(current.bytes) !== window.evidenceSha256)
                throw new Error('Original provider window bytes changed');
              await assertOriginal();
              const final = await readOwnedInstalledInput(path, 65536);
              assertSameOriginalInput(resultInput.binding, final.binding);
              return Buffer.from(current.bytes);
            });
            return window;
          }
          const candidates = (value.candidates as unknown[]).map(candidateFrom);
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
      startup?.reject(error);
      retired = true;
      throw error;
    } finally {
      readyMonitor?.close();
      requestMonitor?.close();
    }
  };
  return Object.freeze({
    root,
    assertOriginal,
    captures: () => Object.freeze([...captures]),
    async read(reserve?: FinalReaderReserve) {
      const result = await readInternal(reserve);
      if (result.kind !== 'original-provider-cohort') throw new Error('Original legacy provider cohort required');
      return result;
    },
    startStderrWindow() {
      if (parentClosed) throw new Error('Original provider window parent already closed');
      let resolveReady!: (value: InstalledProviderWindowReady) => void;
      let rejectReady!: (error: unknown) => void;
      const ready = new Promise<InstalledProviderWindowReady>((resolve, reject) => {
        resolveReady = resolve;
        rejectReady = reject;
      });
      const complete = readInternal(undefined, { resolve: resolveReady, reject: rejectReady }).then((result) => {
        if (result.kind === 'original-provider-cohort') throw new Error('Original provider window required');
        return result;
      });
      complete.catch(rejectReady);
      return Object.freeze({ ready, complete });
    },
  });
}
