import { randomUUID } from 'node:crypto';
import { basename, dirname, join } from 'node:path';
import type { CeDeploymentStore } from '../../platform/src/ce/deployment-store';
import {
  assertRecordedProcessGroupAbsent,
  type RecordedProcessGroupIdentity,
} from '../../platform/src/ce/process-lock';
import type { CeOwner } from '../../platform/src/ce/runtime';
import { decodeEvidenceObject } from './evidence-json';
import { readOwnedInstalledInput } from './installed-runtime';
import { assertSameOriginalInput, monitorOriginalInputs, type OriginalInputBinding } from './original-input-monitor';
import type { FinalExecutionCapture } from './signal-free-executor';

export interface OriginalReaderGroupClosure {
  readonly schemaVersion: 1;
  readonly kind: 'original-reader-group-closure';
  readonly directory: string;
  readonly identity: RecordedProcessGroupIdentity;
  readonly originalBudget: Readonly<{ start: number; deadline: number }>;
  readonly pythonSha256: string;
  readonly executableSha256: string;
  readonly gateSha256: string;
  readonly inputs: Readonly<Record<string, OriginalInputBinding>>;
  readonly physicalGroupAbsent: true;
  readonly producerReportedClosed: boolean;
  readonly captureComplete: boolean;
  readonly executionAccepted: false;
}
function sameIdentity(a: unknown, b: RecordedProcessGroupIdentity) {
  if (!a || typeof a !== 'object') return false;
  const row = a as Record<string, unknown>;
  return (
    Object.keys(row).sort().join(',') === 'boot,group,pid,start' &&
    (['pid', 'group', 'start', 'boot'] as const).every((key) => row[key] === b[key])
  );
}
async function inspect(witness: OriginalReaderGroupClosure) {
  const expected = [
    'bootstrap',
    'completion',
    'gate',
    ...(witness.inputs.submission ? ['submission'] : []),
    ...(witness.inputs.capture ? ['capture'] : []),
  ];
  if (
    witness.schemaVersion !== 1 ||
    witness.kind !== 'original-reader-group-closure' ||
    witness.executionAccepted !== false ||
    witness.physicalGroupAbsent !== true ||
    Object.keys(witness.inputs).sort().join(',') !== expected.sort().join(',') ||
    ![witness.pythonSha256, witness.executableSha256, witness.gateSha256].every((value) =>
      /^[a-f0-9]{64}$/.test(value),
    ) ||
    !Number.isSafeInteger(witness.originalBudget.start) ||
    !Number.isSafeInteger(witness.originalBudget.deadline) ||
    witness.originalBudget.deadline <= witness.originalBudget.start
  )
    throw new Error('Original reader group closure source required');
  const root = dirname(witness.inputs.completion.path);
  if (
    dirname(dirname(root)) !== witness.directory ||
    basename(dirname(root)) !== 'executor-diagnostics' ||
    witness.inputs.bootstrap.path !== join(root, 'bootstrap.json') ||
    witness.inputs.gate.path !== join(root, 'gate.py') ||
    witness.inputs.completion.path !== join(root, 'completion.private.json') ||
    (witness.inputs.submission && witness.inputs.submission.path !== join(root, 'submission.private.json')) ||
    Object.values(witness.inputs).some(
      (row) =>
        !row.expectedIdentity || !row.expectedParentIdentity || (Number(row.expectedIdentity.mode) & 0o777) !== 0o400,
    )
  )
    throw new Error('Original reader evidence directory or identity differs');
  const monitor = await monitorOriginalInputs(witness.inputs);
  try {
    const read = async (name: string) => {
      const expected = witness.inputs[name];
      const current = await readOwnedInstalledInput(expected.path, 1024 * 1024);
      assertSameOriginalInput(expected, current.binding);
      return current;
    };
    const boot = decodeEvidenceObject((await read('bootstrap')).bytes);
    const complete = decodeEvidenceObject((await read('completion')).bytes);
    const gate = await read('gate');
    if (
      (['pid', 'group', 'start', 'boot'] as const).some((key) => boot[key] !== witness.identity[key]) ||
      boot.pythonSha256 !== witness.pythonSha256 ||
      !Number.isSafeInteger(boot.ppid) ||
      (boot.ppid as number) < 1 ||
      gate.binding.sha256 !== witness.gateSha256 ||
      !sameIdentity(complete.identity, witness.identity) ||
      complete.pid !== witness.identity.pid ||
      typeof complete.originalGroupClosed !== 'boolean' ||
      complete.originalGroupClosed !== witness.producerReportedClosed ||
      complete.signalsSent !== false ||
      (complete.actualExitCode !== null && !Number.isSafeInteger(complete.actualExitCode)) ||
      complete.originalDeadlineMs !== witness.originalBudget.deadline ||
      typeof complete.captureClosed !== 'boolean' ||
      complete.captureClosed !== witness.captureComplete ||
      complete.stdoutPath !== join(root, 'stdout.private') ||
      complete.stderrPath !== join(root, 'stderr.private') ||
      !Number.isSafeInteger(complete.finalStartedMs) ||
      !Number.isSafeInteger(complete.finalDeadlineMs) ||
      (complete.finalDeadlineMs as number) - (complete.finalStartedMs as number) !== 300000 ||
      !Number.isSafeInteger(complete.finishedMs) ||
      (complete.finishedMs as number) < (complete.finalStartedMs as number)
    )
      throw new Error('Original bootstrap, completion, actor or reserve differs');
    if (complete.submitted === true) {
      if (!witness.inputs.submission) throw new Error('Original submitted reader evidence missing');
      const submission = decodeEvidenceObject((await read('submission')).bytes);
      const executable = submission.executable as Record<string, unknown> | undefined;
      if (
        submission.schemaVersion !== 1 ||
        submission.pid !== witness.identity.pid ||
        submission.originalStartMs !== witness.originalBudget.start ||
        submission.originalDeadlineMs !== witness.originalBudget.deadline ||
        executable?.sha256 !== witness.executableSha256
      )
        throw new Error('Original reader submission source differs');
    } else if (complete.submitted !== false) throw new Error('Original reader submission status missing');
    if (witness.inputs.capture) {
      const capture = decodeEvidenceObject((await read('capture')).bytes);
      if (
        !sameIdentity(capture.identity, witness.identity) ||
        capture.pid !== witness.identity.pid ||
        capture.originalDeadlineMs !== witness.originalBudget.deadline ||
        capture.stdoutPath !== complete.stdoutPath ||
        capture.stderrPath !== complete.stderrPath ||
        capture.finalStartedMs !== complete.finalStartedMs ||
        capture.finalDeadlineMs !== complete.finalDeadlineMs
      )
        throw new Error('Original owning reader capture binding differs');
    }
    await assertRecordedProcessGroupAbsent(witness.identity);
    await monitor.assertOriginal();
  } finally {
    monitor.close();
  }
}

/** The owning reader supplies its original capture and compiled source pins.
 * Closure is independent of capture completeness and never clears failed locks. */
export async function collectOriginalReaderGroupClosure(input: {
  readonly directory: string;
  readonly capture: FinalExecutionCapture;
  readonly originalBudget: Readonly<{ start: number; deadline: number }>;
  readonly pythonSha256: string;
  readonly executableSha256: string;
  readonly gateSha256: string;
  readonly captureBinding?: OriginalInputBinding;
}): Promise<OriginalReaderGroupClosure> {
  if (!input.capture.identity) throw new Error('Original captured reader identity required');
  const root = dirname(input.capture.stdoutPath);
  const inputs: Record<string, OriginalInputBinding> = {};
  if (input.captureBinding) inputs.capture = input.captureBinding;
  for (const [key, file] of [
    ['bootstrap', 'bootstrap.json'],
    ['completion', 'completion.private.json'],
    ['gate', 'gate.py'],
  ] as const)
    inputs[key] = (await readOwnedInstalledInput(join(root, file), 1024 * 1024)).binding;
  const complete = decodeEvidenceObject((await readOwnedInstalledInput(inputs.completion.path, 1024 * 1024)).bytes);
  if (input.capture.submitted)
    inputs.submission = (await readOwnedInstalledInput(join(root, 'submission.private.json'), 1024 * 1024)).binding;
  if (
    !sameIdentity(complete.identity, input.capture.identity) ||
    complete.pid !== input.capture.pid ||
    complete.originalDeadlineMs !== input.capture.originalDeadlineMs ||
    complete.finalStartedMs !== input.capture.finalStartedMs ||
    complete.finalDeadlineMs !== input.capture.finalDeadlineMs ||
    complete.submitted !== input.capture.submitted
  )
    throw new Error('Original captured reader and final completion differ');
  const witness: OriginalReaderGroupClosure = {
    schemaVersion: 1,
    kind: 'original-reader-group-closure',
    directory: input.directory,
    identity: Object.freeze({ ...input.capture.identity }),
    originalBudget: Object.freeze({ ...input.originalBudget }),
    pythonSha256: input.pythonSha256,
    executableSha256: input.executableSha256,
    gateSha256: input.gateSha256,
    inputs: Object.freeze(inputs),
    physicalGroupAbsent: true,
    producerReportedClosed: complete.originalGroupClosed as boolean,
    captureComplete: complete.captureClosed as boolean,
    executionAccepted: false,
  };
  await inspect(witness);
  return Object.freeze(witness);
}
export async function assertOriginalReaderGroupClosure(witness: OriginalReaderGroupClosure): Promise<void> {
  await inspect(structuredClone(witness));
}

export interface OriginalReaderSourceClosure {
  readonly name: string;
  readonly attemptCount: number;
  readonly witnesses: readonly OriginalReaderGroupClosure[];
}
function sameOwner(a: CeOwner, b: CeOwner) {
  return (['provider', 'engine', 'account', 'region', 'deploymentId'] as const).every((key) => a?.[key] === b[key]);
}
async function assertSourceCoverage(sources: readonly OriginalReaderSourceClosure[], required: readonly string[]) {
  if (
    !required.length ||
    new Set(required).size !== required.length ||
    required.some((name) => !/^[a-z][a-z0-9-]{0,63}$/.test(name)) ||
    sources
      .map((row) => row.name)
      .sort()
      .join(',') !== required.slice().sort().join(',')
  )
    throw new Error('Original reader source coverage differs');
  const original = new Map<string, string>();
  for (const source of sources) {
    if (
      !Number.isSafeInteger(source.attemptCount) ||
      source.attemptCount < 0 ||
      source.attemptCount !== source.witnesses.length
    )
      throw new Error('Original reader attempt coverage incomplete');
    for (const witness of source.witnesses) {
      const id = JSON.stringify(witness.identity),
        value = JSON.stringify(witness);
      const prior = original.get(id);
      if (prior && prior !== value) throw new Error('Original shared reader group evidence differs');
      original.set(id, value);
      await assertOriginalReaderGroupClosure(witness);
    }
  }
}
/** The concrete factory declares every original source and its actual attempt
 * count. Source coverage is not guest/service acceptance or execute authority. */
export async function persistOriginalReaderGroupSet(input: {
  readonly store: CeDeploymentStore;
  readonly owner: CeOwner;
  readonly requiredSources: readonly string[];
  readonly sources: readonly OriginalReaderSourceClosure[];
}): Promise<Readonly<Record<string, OriginalInputBinding>>> {
  const owner = structuredClone(input.owner),
    sources = structuredClone(input.sources),
    required = [...input.requiredSources];
  await input.store.verify();
  if (!sameOwner(input.store.owner, owner)) throw new Error('Original reader group store owner differs');
  await assertSourceCoverage(sources, required);
  const record = await input.store.writeImmutableBytes(
    `immutable-reader-groups-${randomUUID()}.json`,
    Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        kind: 'original-reader-group-set',
        owner,
        requiredSources: required,
        sources,
        executionAccepted: false,
        guestAcceptanceComplete: false,
      }),
    ),
  );
  return Object.freeze({ [`reader-group-set:${record.binding.sha256}`]: record.binding });
}
export async function assertOriginalReaderGroupInputs(input: {
  readonly inputs: Readonly<Record<string, OriginalInputBinding>>;
  readonly owner: CeOwner;
  readonly requiredSources: readonly string[];
}): Promise<void> {
  const values = Object.values(input.inputs);
  if (values.length !== 1) throw new Error('One original reader group set required');
  const binding = values[0];
  const monitor = await monitorOriginalInputs(input.inputs);
  try {
    const file = await readOwnedInstalledInput(binding.path, 16 * 1024 * 1024);
    assertSameOriginalInput(binding, file.binding);
    const record = decodeEvidenceObject(file.bytes);
    if (
      record.schemaVersion !== 1 ||
      record.kind !== 'original-reader-group-set' ||
      record.executionAccepted !== false ||
      record.guestAcceptanceComplete !== false ||
      !sameOwner(record.owner as CeOwner, input.owner) ||
      !Array.isArray(record.requiredSources) ||
      !Array.isArray(record.sources) ||
      record.requiredSources.slice().sort().join(',') !== input.requiredSources.slice().sort().join(',')
    )
      throw new Error('Original reader set owner or source coverage differs');
    await assertSourceCoverage(
      record.sources as unknown as readonly OriginalReaderSourceClosure[],
      input.requiredSources,
    );
    await monitor.assertOriginal();
  } finally {
    monitor.close();
  }
}
