import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { lstat, open, readFile, readlink, realpath, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { decodeEvidenceObject } from './evidence-json';
import sourcePins from './gcp-capture-source-pins.json';
import { freezeAdmittedCaptureInputs, type InstalledCaptureContext } from './installed-capture-context';
import pins from './installed-runtime-pins.json';
import { linuxMonotonicMs } from './linux-clock';
import { openOriginalGuestFifoPeer } from './original-guest-fifo';
import { OriginalGuestControlParent, type OriginalGuestParentAdmission } from './original-guest-parent';
import { assertSameOriginalInput, monitorOriginalInputs, type OriginalInputBinding } from './original-input-monitor';
import {
  type ExecutionCaptureAdmission,
  type FinalExecutionCapture,
  signalFreeTerraformExecutor,
} from './signal-free-executor';

type Message = Record<string, unknown>;
type Identity = ExecutionCaptureAdmission['identity'];
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const equalIdentity = (a: Identity | undefined, b: Identity | undefined) =>
  !!a && !!b && ['pid', 'group', 'start', 'boot'].every((key) => a[key as keyof Identity] === b[key as keyof Identity]);
/** Inspect an original executor completion; its caller must bind the original owned file and issuer. */
export function inspectOriginalGuestCompletion(
  value: unknown,
  initial: Partial<FinalExecutionCapture>,
  actor: Identity,
) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Original guest completion required');
  const result = value as Message;
  if (
    !equalIdentity(result.identity as Identity, actor) ||
    result.pid !== actor.pid ||
    result.signalsSent !== false ||
    result.originalGroupClosed !== true ||
    result.captureClosed !== true ||
    typeof result.actualExitCode !== 'number' ||
    !Number.isInteger(result.actualExitCode) ||
    result.actualExitCode < 0 ||
    [
      'originalDeadlineMs',
      'invocationStartedMs',
      'finalStartedMs',
      'finalDeadlineMs',
      'stdoutPath',
      'stderrPath',
      'submitted',
    ].some(
      (key) =>
        initial[key as keyof FinalExecutionCapture] !== undefined &&
        result[key] !== initial[key as keyof FinalExecutionCapture],
    )
  )
    throw new Error('Original guest completion identity, budget or closure differs');
  return Object.freeze(structuredClone(result));
}

export interface InstalledGuestWorkerOptions {
  readonly context: InstalledCaptureContext;
  readonly binding: Message;
  readonly inputs: Readonly<Record<string, OriginalInputBinding>>;
  readonly guards: OriginalGuestParentAdmission['guards'];
}

/** Installed source bridge only. Caller supplies independently verified original VM/token/NIC/serial joins. */
export async function openInstalledGuestWorker(options: InstalledGuestWorkerOptions) {
  const context = options.context;
  const binding = Object.freeze(structuredClone(options.binding));
  const supplied = freezeAdmittedCaptureInputs(options.inputs);
  const guards = Object.freeze({
    inputs: options.guards.inputs.bind(options.guards),
    original: options.guards.original.bind(options.guards),
    trust: options.guards.trust.bind(options.guards),
  });
  if (
    context?.kind !== 'original-installed-gcp-capture-context' ||
    context.schemaVersion !== 2 ||
    context.owner?.provider !== 'gcp' ||
    context.owner.engine !== 'terraform' ||
    binding?.project !== context.owner.account ||
    binding.region !== context.owner.region ||
    context.budget.deadline - context.budget.start !== 7200000
  )
    throw new Error('Original installed GCP worker context and binding required');
  const budget = Object.freeze({ ...context.budget });
  const assertContext = context.assertInputs,
    withinContext = context.assertWithinDeadline;
  await assertContext();
  await withinContext();
  for (const [name, original] of Object.entries(context.inputs)) {
    if (!supplied[name]) throw new Error('Original installed worker context input missing');
    assertSameOriginalInput(original, supplied[name]);
  }
  const inputs = freezeAdmittedCaptureInputs({ ...context.inputs, ...supplied });
  const entry = inputs['script:guest_entrypoint.py'];
  if (
    !entry ||
    inputs.python?.sha256 !== pins.pythonSha256 ||
    !inputs.ssh ||
    Object.entries(sourcePins.files).some(
      ([name, digest]) =>
        inputs[`script:${name}`]?.path !== join(dirname(entry.path), name) ||
        inputs[`script:${name}`]?.sha256 !== digest,
    ) ||
    ['observer_key', 'ce_key', 'observer_hosts', 'ce_hosts'].some(
      (name) => !inputs[name] || binding[name] !== inputs[name].path,
    )
  )
    throw new Error('Complete original installed guest source and input pins required');
  const inputMonitor = await monitorOriginalInputs(inputs);

  const root = join(context.executionDirectory, `gcp-guest-worker-${randomUUID()}`);
  let actor: Identity | undefined, final: FinalExecutionCapture | undefined;
  let executionDirectory: string | undefined;
  let completion: Readonly<Message> | undefined;
  let terminal = false,
    initialized = false,
    started = false,
    disposed = false,
    submissions = 0;
  let outcome: Promise<unknown> | undefined;
  let outcomeError: unknown;
  let requestMonitor: Awaited<ReturnType<typeof monitorOriginalInputs>> | undefined;
  const assertInputs = async () => {
    await assertContext();
    await inputMonitor.assertOriginal();
    await requestMonitor?.assertOriginal();
    await assertContext();
  };
  const assertActor = async () => {
    await assertInputs();
    if (!actor) throw new Error('Original installed guest actor not admitted');
    if (terminal) {
      if (
        !final ||
        !equalIdentity(final.identity, actor) ||
        final.pid !== actor.pid ||
        !final.originalGroupClosed ||
        final.actualExitCode !== 0 ||
        final.signalsSent !== false
      )
        throw new Error('Original installed guest terminal actor not qualified');
      await assertInputs();
      return;
    }
    const before = await readFile(`/proc/${actor.pid}/stat`, 'utf8');
    const fields = before
      .slice(before.lastIndexOf(') ') + 2)
      .trim()
      .split(/\s+/);
    if (
      ['T', 't', 'Z', 'X'].includes(fields[0]) ||
      fields[19] !== actor.start ||
      Number(fields[2]) !== actor.group ||
      Number(fields[1]) !== process.pid ||
      (await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim() !== actor.boot ||
      (await readlink(`/proc/${actor.pid}/exe`)) !== (await realpath(inputs.python.path))
    )
      throw new Error('Original installed guest process identity changed');
    const executable = await stat(`/proc/${actor.pid}/exe`, { bigint: true });
    if (
      ['dev', 'ino', 'uid', 'nlink', 'mode', 'size', 'mtimeNs', 'ctimeNs'].some(
        (key) =>
          String(executable[key as keyof typeof executable]) !==
          inputs.python.expectedIdentity?.[key as keyof NonNullable<OriginalInputBinding['expectedIdentity']>],
      )
    )
      throw new Error('Original installed guest executable identity changed');
    const after = await readFile(`/proc/${actor.pid}/stat`, 'utf8');
    const current = after
      .slice(after.lastIndexOf(') ') + 2)
      .trim()
      .split(/\s+/);
    if (current[19] !== actor.start || current[2] !== fields[2] || ['T', 't', 'Z', 'X'].includes(current[0]))
      throw new Error('Original installed guest actor changed during inspection');
    await assertInputs();
  };
  const nonce = randomBytes(32).toString('hex');
  const peer = await openOriginalGuestFifoPeer({ root, session: nonce, assertOriginal: assertActor });
  const persist = async (path: string, bytes: Uint8Array): Promise<OriginalInputBinding> => {
    const handle = await open(path, 'wx', 0o400);
    try {
      await handle.writeFile(bytes);
      await handle.sync();
      const file = await handle.stat({ bigint: true }),
        parent = await lstat(dirname(path), { bigint: true });
      return Object.freeze({
        path,
        sha256: hash(bytes),
        expectedIdentity: Object.freeze(
          Object.fromEntries(
            ['dev', 'ino', 'uid', 'nlink', 'mode', 'size', 'mtimeNs', 'ctimeNs'].map((key) => [
              key,
              String(file[key as keyof typeof file]),
            ]),
          ),
        ) as OriginalInputBinding['expectedIdentity'],
        expectedParentIdentity: Object.freeze(
          Object.fromEntries(
            ['dev', 'ino', 'uid', 'mode'].map((key) => [key, String(parent[key as keyof typeof parent])]),
          ),
        ) as OriginalInputBinding['expectedParentIdentity'],
      });
    } finally {
      await handle.close();
    }
  };
  let parent: OriginalGuestControlParent | undefined;
  const run = async () => {
    const startup = Math.min(budget.deadline, linuxMonotonicMs() + 15000);
    const request = {
      schemaVersion: 1,
      kind: 'original-gcp-guest-worker',
      nonce,
      inputs,
      binding,
      originalStartMs: budget.start,
      deadlines: [budget.deadline, budget.deadline + 300000],
      startupDeadlineMs: startup,
      ports: peer.bindings,
    };
    const raw = Buffer.from(JSON.stringify(request));
    const requestInput = await persist(join(root, 'request.private.json'), raw);
    requestMonitor = await monitorOriginalInputs({ request: requestInput });
    parent = new OriginalGuestControlParent({
      peer,
      binding,
      requestSha256: requestInput.sha256,
      operationDeadlineMs: budget.deadline,
      closureDeadlineMs: budget.deadline + 300000,
      startupDeadlineMs: startup,
      guards,
    });
    const args = ['-I', '-B', entry.path, '--request', requestInput.path, '--sha256', requestInput.sha256];
    const execute = signalFreeTerraformExecutor({
      python: { path: inputs.python.path, sha256: inputs.python.sha256 },
      executable: { path: inputs.python.path, sha256: inputs.python.sha256 },
      originalStartMs: budget.start,
      originalDeadlineMs: budget.deadline,
      assertOriginal: assertInputs,
      beforeRelease: async (admitted) => {
        if (
          actor ||
          admitted.originalStartMs !== budget.start ||
          admitted.originalDeadlineMs !== budget.deadline ||
          admitted.directory !== root ||
          JSON.stringify(admitted.args) !== JSON.stringify(args) ||
          admitted.startupDeadlineMs < startup
        )
          throw new Error('Original installed guest execution admission differs');
        const bootstrap = decodeEvidenceObject(await readFile(join(dirname(admitted.stdoutPath), 'bootstrap.json')));
        if (
          !equalIdentity(admitted.identity, bootstrap as unknown as Identity) ||
          bootstrap.pythonSha256 !== inputs.python.sha256 ||
          bootstrap.ppid !== process.pid ||
          typeof bootstrap.sdkCreateTime !== 'number' ||
          !Number.isFinite(bootstrap.sdkCreateTime)
        )
          throw new Error('Original installed guest kernel and SDK admission differs');
        actor = Object.freeze({ ...admitted.identity });
        executionDirectory = dirname(admitted.stdoutPath);
        await persist(
          join(root, 'original-execution.private.json'),
          Buffer.from(JSON.stringify({ identity: actor, bootstrap, args, budget })),
        );
        await assertActor();
      },
      finalCapture: async (capture) => {
        await persist(join(root, 'final-execution.private.json'), Buffer.from(JSON.stringify(capture)));
        if (
          !equalIdentity(capture.identity, actor) ||
          capture.pid !== actor?.pid ||
          capture.originalDeadlineMs !== budget.deadline ||
          capture.signalsSent !== false
        )
          throw new Error('Original installed guest final execution differs');
        final = Object.freeze(structuredClone(capture));
        if (initialized && capture.actualExitCode === null && parent) {
          await parent.settlePending();
          try {
            await parent.command({ operation: 'close' });
          } catch (error) {
            outcomeError ??= error;
          }
        }
      },
    });
    submissions++;
    outcome = execute({ cwd: root, args, env: { PATH: '/usr/bin:/bin' } });
    void outcome.then(
      () => {
        terminal = true;
      },
      (error) => {
        terminal = true;
        outcomeError = error;
      },
    );
    while (!actor && !terminal && linuxMonotonicMs() < startup) {
      await assertInputs();
      await Bun.sleep(10);
    }
    if (!actor || terminal || linuxMonotonicMs() >= startup)
      throw new Error('Original installed guest startup deadline or admission unavailable');
    await parent.initialize();
    initialized = true;
  };
  return Object.freeze({
    root,
    async initialize() {
      if (started || disposed) throw new Error('Original installed guest lifecycle already started or retired');
      started = true;
      await assertInputs();
      await withinContext();
      try {
        await run();
      } catch (error) {
        outcomeError ??= error;
        const details =
          error instanceof Error
            ? { name: error.name, message: error.message, stack: error.stack }
            : { name: 'unknown' };
        await persist(
          join(root, 'startup-failure.private.json'),
          Buffer.from(JSON.stringify({ details, budget, guestAcceptanceComplete: false })),
        );
        throw error;
      }
    },
    async command(value: Message) {
      if (!initialized || disposed || !parent)
        throw new Error('Original installed guest command lifecycle unavailable');
      await assertInputs();
      return parent.command(value);
    },
    async dispose() {
      if (disposed) return;
      if (initialized && !terminal && parent) {
        try {
          await parent.command({ operation: 'close' });
        } catch (error) {
          outcomeError ??= error;
        }
      }
      await peer.retire();
      if (outcome) await Promise.allSettled([outcome]);
      await assertInputs();
      if (started && terminal && final && actor && executionDirectory) {
        const path = join(executionDirectory, 'completion.private.json');
        const before = await lstat(path, { bigint: true });
        if (
          !before.isFile() ||
          before.isSymbolicLink() ||
          before.uid !== BigInt(process.getuid?.() ?? -1) ||
          before.nlink !== 1n ||
          (before.mode & 0o077n) !== 0n
        )
          throw new Error('Original owned guest completion required');
        const raw = await readFile(path);
        const after = await lstat(path, { bigint: true });
        if (
          ['dev', 'ino', 'uid', 'nlink', 'mode', 'size', 'mtimeNs', 'ctimeNs'].some(
            (key) => before[key as keyof typeof before] !== after[key as keyof typeof after],
          )
        )
          throw new Error('Original guest completion changed during review');
        completion = inspectOriginalGuestCompletion(decodeEvidenceObject(raw), final, actor);
        await persist(
          join(root, 'completion-review.private.json'),
          Buffer.from(
            JSON.stringify({
              original: actor,
              initialCapture: final,
              completion,
              completionSha256: hash(raw),
              guestAcceptanceComplete: false,
            }),
          ),
        );
      }
      if (
        started &&
        (!terminal ||
          !final ||
          !equalIdentity(final.identity, actor) ||
          !completion ||
          completion.originalGroupClosed !== true ||
          completion.actualExitCode === null)
      )
        throw new Error('Original installed guest closure unresolved; original evidence remains held');
      requestMonitor?.close();
      inputMonitor.close();
      disposed = true;
    },
    evidence() {
      return Object.freeze({
        root,
        identity: actor,
        final,
        completion,
        submissions,
        terminal,
        disposed,
        ...(outcomeError ? { executionFailureRetained: true } : {}),
        guestAcceptanceComplete: false,
      });
    },
  });
}
