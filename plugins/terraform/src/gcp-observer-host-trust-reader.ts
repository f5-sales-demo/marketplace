import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, open, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { decodeEvidenceObject } from './evidence-json';
import sources from './gcp-capture-source-pins.json';
import {
  assertOriginalGcpCeTrustMaterialContext,
  assertOriginalGcpObserverTrustMaterialContext,
  type TrustMaterial,
} from './gcp-observer-trust-material';
import {
  assertOriginalApplyCallback,
  assertOriginalApplyLifetime,
  type OriginalApplyCallbackContext,
} from './installed-apply-controller';
import { readOwnedInstalledInput } from './installed-runtime';
import { bindOriginalAccessReaderCapture, openOriginalAccessReaderCapture } from './original-access-reader-source';
import { assertSameOriginalInput, monitorOriginalInputs, type OriginalInputBinding } from './original-input-monitor';
import {
  type OriginalOutputCompletion,
  readOriginalExecutionChunk,
  readOriginalExecutionCompletion,
} from './original-output-stream';
import { inspectFinalReaderReserve } from './reader-final-reserve';
import {
  type ExecutionCaptureAdmission,
  type FinalExecutionCapture,
  type SignalFreeExecutionPolicy,
  signalFreeFinalReaderExecutor,
  signalFreeTerraformExecutor,
} from './signal-free-executor';

const maximum = 65536;
const hash = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
const sameIdentity = (left: ExecutionCaptureAdmission['identity'], right: ExecutionCaptureAdmission['identity']) =>
  (['pid', 'group', 'start', 'boot'] as const).every((key) => left[key] === right[key]);
export interface OriginalGcpObserverHostTrust {
  readonly schemaVersion: 1;
  readonly kind: 'original-gcp-observer-host-trust-reference';
}
export interface OriginalGcpCeHostTrust {
  readonly schemaVersion: 1;
  readonly kind: 'original-gcp-ce-host-trust-reference';
}
type TrustFamily = 'observer' | 'ce';
type TrustReference<K extends TrustFamily> = K extends 'ce' ? OriginalGcpCeHostTrust : OriginalGcpObserverHostTrust;
interface HostTrustView {
  readonly originalStartMs: number;
  readonly originalDeadlineMs: number;
  readonly finalStartedMs?: number;
  readonly finalDeadlineMs?: number;
  readonly instanceId: string;
  readonly nodeName: string;
  readonly address: string;
  readonly fingerprint: string;
  readonly knownHosts: OriginalInputBinding;
  readonly serialWireMatched: true;
  readonly liveAccessVerified: false;
}
const origins = new WeakMap<
  OriginalGcpObserverHostTrust | OriginalGcpCeHostTrust,
  {
    readonly family: TrustFamily;
    readonly callback: OriginalApplyCallbackContext;
    read(): Promise<Readonly<HostTrustView>>;
  }
>();
export async function readOriginalGcpObserverHostTrust(value: unknown) {
  const origin = value && typeof value === 'object' ? origins.get(value as OriginalGcpObserverHostTrust) : undefined;
  if (origin?.family !== 'observer') throw new Error('Original observer host trust source required');
  return origin.read();
}
export async function assertOriginalGcpObserverHostTrustContext(
  value: unknown,
  callback: OriginalApplyCallbackContext,
) {
  const origin = value && typeof value === 'object' ? origins.get(value as OriginalGcpObserverHostTrust) : undefined;
  if (origin?.family !== 'observer' || origin.callback !== callback)
    throw new Error('Original host trust and actual capture callback required');
  return origin.read();
}
export async function readOriginalGcpCeHostTrust(value: unknown) {
  const origin = value && typeof value === 'object' ? origins.get(value as OriginalGcpCeHostTrust) : undefined;
  if (origin?.family !== 'ce') throw new Error('Original CE host trust source required');
  return origin.read();
}
export async function assertOriginalGcpCeHostTrustContext(value: unknown, callback: OriginalApplyCallbackContext) {
  const origin = value && typeof value === 'object' ? origins.get(value as OriginalGcpCeHostTrust) : undefined;
  if (origin?.family !== 'ce' || origin.callback !== callback)
    throw new Error('Original CE host trust and actual callback required');
  return origin.read();
}
export async function openGcpCeHostTrustReader(material: unknown, callback: OriginalApplyCallbackContext) {
  return openOriginalHostTrustReader('ce', material, callback, assertOriginalGcpCeTrustMaterialContext);
}
/** Real parser execution over original VM/serial/wire material. A parser's
 * caller-created receipt or matching JSON result cannot mint this capability. */
export async function openGcpObserverHostTrustReader(material: unknown, callback: OriginalApplyCallbackContext) {
  return openOriginalHostTrustReader('observer', material, callback, assertOriginalGcpObserverTrustMaterialContext);
}
async function openOriginalHostTrustReader<K extends TrustFamily>(
  family: K,
  material: unknown,
  callback: OriginalApplyCallbackContext,
  assertContext: (material: unknown, callback: OriginalApplyCallbackContext) => Promise<Readonly<TrustMaterial>>,
) {
  const original = await assertContext(material, callback);
  const script = callback.original.inputs['script:gcp_host_trust.py'];
  const python = callback.original.inputs.python;
  if (!script || !python || script.sha256 !== sources.files['gcp_host_trust.py'])
    throw new Error('Original installed host-trust parser and Python prerequisites required');
  const root = join(callback.original.executionDirectory, `gcp-host-trust-readers-${randomUUID()}`);
  await mkdir(root, { mode: 0o700 });
  const directory = await lstat(root, { bigint: true });
  const recorder = await openOriginalAccessReaderCapture({
    callback: callback,
    family: family,
    role: 'trust',
    instanceId: original.expected.instanceId,
    directory: root,
    python: python,
    executable: python,
  });
  let retired = false,
    used = false,
    producerSeen = false,
    producerClosed = false;
  let pending: Promise<TrustReference<K>> | undefined, closure: Promise<void> | undefined;
  const inputMonitor = await monitorOriginalInputs({ script, python });
  let requestMonitor: Awaited<ReturnType<typeof monitorOriginalInputs>> | undefined;
  const retained: Record<string, OriginalInputBinding> = {};
  const assertRoot = async () => {
    const current = await lstat(root, { bigint: true });
    if (
      !current.isDirectory() ||
      current.isSymbolicLink() ||
      (await realpath(root)) !== root ||
      (['dev', 'ino', 'uid', 'mode'] as const).some((key) => current[key] !== directory[key]) ||
      current.uid !== BigInt(process.getuid?.() ?? -1) ||
      (current.mode & 0o777n) !== 0o700n
    )
      throw new Error('Original private host-trust directory changed');
  };
  const assertLifetime = async () => {
    if (retired) throw new Error('Original observer host-trust reader retired');
    await assertRoot();
    if (callback.phase === 'after') await assertOriginalApplyCallback(callback);
    else await assertOriginalApplyLifetime(callback);
    await inputMonitor.assertOriginalIdentity();
    await requestMonitor?.assertOriginalIdentity();
  };
  const assertInputs = async () => {
    await assertLifetime();
    await inputMonitor.assertOriginal();
    await requestMonitor?.assertOriginal();
    await assertLifetime();
  };
  const assertMaterial = async () => {
    await assertInputs();
    const current = await assertContext(material, callback);
    if (
      !current.serial.equals(original.serial) ||
      !current.wire.equals(original.wire) ||
      JSON.stringify(current.expected) !== JSON.stringify(original.expected) ||
      JSON.stringify(current.receipt) !== JSON.stringify(original.receipt) ||
      JSON.stringify(current.sources) !== JSON.stringify(original.sources)
    )
      throw new Error('Original host-trust material changed');
    await assertInputs();
  };
  const persist = async (name: string, bytes: Buffer) => {
    await assertRoot();
    const path = join(root, name),
      handle = await open(path, 'wx', 0o400);
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    const input = await readOwnedInstalledInput(path, Math.max(maximum, bytes.length));
    if (input.binding.sha256 !== hash(bytes)) throw new Error('Original retained host-trust bytes changed');
    const parent = await open(root, 'r');
    try {
      await parent.sync();
    } finally {
      await parent.close();
    }
    await assertRoot();
    return input.binding;
  };
  const verifyOnce = async (): Promise<TrustReference<K>> => {
    await assertMaterial();
    retained.serial = await persist('serial.private.bin', original.serial);
    retained.wire = await persist('wire.private.bin', original.wire);
    const reserve = callback.phase === 'after' ? callback.reserve : undefined;
    if (callback.phase === 'after' && !reserve) throw new Error('Original host-trust final reserve required');
    const timing = reserve ? inspectFinalReaderReserve(reserve) : undefined;
    const budget = {
      originalStartMs: callback.original.budget.start,
      originalDeadlineMs: callback.original.budget.deadline,
      ...(timing ? { finalStartedMs: timing.finalStartedMs, finalDeadlineMs: timing.finalDeadlineMs } : {}),
    };
    const request = Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        kind: 'original-gcp-observer-trust-parser-request',
        expected: original.expected,
        receipt: original.receipt,
        inputs: { serial: retained.serial, wire: retained.wire },
        budget,
      }),
    );
    retained.request = await persist('request.private.json', request);
    requestMonitor = await monitorOriginalInputs(retained);
    let admission: ExecutionCaptureAdmission | undefined, final: FinalExecutionCapture | undefined;
    let completion: OriginalOutputCompletion | undefined;
    let stdout = Buffer.alloc(0),
      stderr = Buffer.alloc(0);
    const args = ['-I', '-B', script.path, '--request', retained.request.path, '--sha256', retained.request.sha256];
    const policy: SignalFreeExecutionPolicy = {
      python,
      executable: python,
      originalStartMs: budget.originalStartMs,
      originalDeadlineMs: budget.originalDeadlineMs,
      timeoutMs: 60000,
      startupTimeoutMs: 15000,
      maxOutputBytes: maximum,
      assertOriginal: assertInputs,
      assertOriginalIdentity: assertLifetime,
      assertFinalInputs: assertInputs,
      beforeRelease: async (value) => {
        await assertLifetime();
        if (admission || value.directory !== root || JSON.stringify(value.args) !== JSON.stringify(args))
          throw new Error('Original host-trust execution admission differs');
        admission = value;
        producerSeen = true;
        await recorder.admit(value);
      },
      finalCapture: async (capture) => {
        await recorder.capture(capture);
        final = capture;
        producerSeen ||= !!capture.identity;
        let failure: unknown;
        try {
          if (
            !admission ||
            !capture.identity ||
            !sameIdentity(capture.identity, admission.identity) ||
            capture.stdoutPath !== admission.stdoutPath ||
            capture.stderrPath !== admission.stderrPath
          )
            throw new Error('Original host-trust producer identity differs');
          for (const channel of ['stdout', 'stderr'] as const) {
            let offset = 0;
            const parts: Buffer[] = [];
            for (;;) {
              const chunk = await admission.output.read(channel);
              if (!chunk) break;
              const record = readOriginalExecutionChunk(admission.output, chunk, channel);
              if (
                !sameIdentity(record.identity, admission.identity) ||
                record.directory !== root ||
                record.offset !== offset ||
                record.endOffset !== offset + record.bytes.length ||
                record.endOffset > maximum ||
                record.sha256 !== hash(record.bytes)
              )
                throw new Error('Original host-trust output record differs');
              offset = record.endOffset;
              parts.push(record.bytes);
              if (channel === 'stdout') stdout = Buffer.concat(parts);
              else stderr = Buffer.concat(parts);
            }
          }
          if (!capture.originalGroupClosed) throw new Error('Original host-trust producer closure unresolved');
          completion = await admission.output.finish();
          const issued = readOriginalExecutionCompletion(admission.output, completion);
          if (
            !sameIdentity(issued.identity, admission.identity) ||
            issued.directory !== root ||
            completion.stdout.sha256 !== hash(stdout) ||
            completion.stderr.sha256 !== hash(stderr) ||
            completion.stdout.bytes !== stdout.length ||
            completion.stderr.bytes !== stderr.length
          )
            throw new Error('Original host-trust output completion differs');
          producerClosed = true;
        } catch (error) {
          failure = error;
        }
        retained.capture = await persist(
          'parser-capture.private.json',
          Buffer.from(
            JSON.stringify({
              schemaVersion: 1,
              kind: 'original-host-trust-parser-capture',
              capture,
              completion,
              stdoutSha256: hash(stdout),
              stderrSha256: hash(stderr),
              complete: !failure && !!completion,
              liveAccessVerified: false,
              ...(failure ? { errorType: failure instanceof Error ? failure.name : typeof failure } : {}),
            }),
          ),
        );
        if (failure) throw failure;
      },
    };
    try {
      await assertMaterial();
      const execute = reserve ? signalFreeFinalReaderExecutor(policy, reserve) : signalFreeTerraformExecutor(policy);
      await recorder.begin(args);
      let result: Awaited<ReturnType<typeof execute>>;
      try {
        result = await execute({ cwd: root, args, env: { LC_ALL: 'C' } });
      } finally {
        recorder.finished(execute);
      }
      await assertMaterial();
      if (
        !admission ||
        !final ||
        !completion ||
        !producerClosed ||
        result.code !== 0 ||
        final.actualExitCode !== 0 ||
        !final.submitted ||
        final.reason
      )
        throw new Error('Original observer serial/wire fingerprint verification failed; private evidence retained');
      const reply = decodeEvidenceObject(stdout);
      const key = original.wire.toString().trimEnd().split(' ')[2];
      const fingerprint = `SHA256:${createHash('sha256').update(Buffer.from(key, 'base64')).digest('base64').replace(/=+$/, '')}`;
      if (
        reply.schemaVersion !== 1 ||
        reply.kind !== 'original-gcp-observer-trust-parser-result' ||
        reply.version !== 'gcp-host-trust-consistency-v1' ||
        reply.fingerprint !== fingerprint ||
        reply.serialSha256 !== hash(original.serial) ||
        reply.wireSha256 !== hash(original.wire) ||
        reply.consistencyVerified !== true ||
        reply.gcpSourceAuthenticated !== false ||
        reply.liveAccessVerified !== false ||
        Object.entries(budget).some(([name, value]) => reply[name] !== value)
      )
        throw new Error('Original observer fingerprint parser result differs');
      retained.result = await persist('parser-result.private.json', stdout);
      const value: Readonly<HostTrustView> = Object.freeze({
        ...budget,
        instanceId: original.expected.instanceId,
        nodeName: original.expected.nodeName,
        address: original.expected.address,
        fingerprint,
        knownHosts: retained.wire,
        serialWireMatched: true,
        liveAccessVerified: false,
      });
      const read = async () => {
        if (retired) throw new Error('Original observer host trust retired');
        try {
          await assertMaterial();
          for (const binding of Object.values(retained))
            assertSameOriginalInput(
              binding,
              (await readOwnedInstalledInput(binding.path, Math.max(4 * 1024 * 1024, maximum))).binding,
            );
          await assertMaterial();
          return value;
        } catch (error) {
          retired = true;
          throw error;
        }
      };
      const reference = Object.freeze({
        schemaVersion: 1,
        kind: family === 'ce' ? 'original-gcp-ce-host-trust-reference' : 'original-gcp-observer-host-trust-reference',
      }) as TrustReference<K>;
      origins.set(reference, { read, callback, family });
      await read();
      return reference;
    } catch (error) {
      try {
        await persist(
          'parser-failure.private.json',
          Buffer.from(
            JSON.stringify({
              schemaVersion: 1,
              kind: 'original-observer-host-trust-failure',
              errorType: error instanceof Error ? error.name : typeof error,
              liveAccessVerified: false,
            }),
          ),
        );
      } catch (retention) {
        throw new AggregateError([error, retention], 'Original host-trust failure retention unresolved');
      }
      throw error;
    }
  };
  const port = Object.freeze({
    verify(): Promise<TrustReference<K>> {
      if (retired) return Promise.reject(new Error('Original host-trust reader retired'));
      if (used) return Promise.reject(new Error('Original host-trust verification is single-use'));
      used = true;
      pending = verifyOnce();
      return pending;
    },
    close(): Promise<void> {
      if (!closure)
        closure = (async () => {
          if (pending) await pending.catch(() => undefined);
          retired = true;
          try {
            await assertRoot();
            try {
              await lstat(join(root, '.terraform-executor-lock'));
              throw new Error('Original host-trust executor closure unresolved; lock preserved');
            } catch (error) {
              if (!(error instanceof Error) || (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
            }
            if (producerSeen && !producerClosed) throw new Error('Original host-trust producer closure unresolved');
          } finally {
            inputMonitor.close();
            requestMonitor?.close();
          }
        })();
      return closure;
    },
  });
  bindOriginalAccessReaderCapture(port, recorder);
  return port;
}
