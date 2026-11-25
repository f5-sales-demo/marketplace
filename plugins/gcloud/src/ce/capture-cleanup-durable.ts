import { randomUUID } from 'node:crypto';
import { basename, isAbsolute, join, resolve } from 'node:path';
import { CeDeploymentStore, type CeImmutableRecord } from '../../../platform/src/ce/deployment-store';
import { acquireProcessLock, assertExecutorProcessGroupAbsent } from '../../../platform/src/ce/process-lock';
import { decodeEvidenceObject } from '../../../terraform/src/evidence-json';
import { readOwnedInstalledInput } from '../../../terraform/src/installed-runtime';
import { monitorOriginalInputs, type OriginalInputBinding } from '../../../terraform/src/original-input-monitor';
import type { CaptureCleanupInspection, CaptureCleanupRecovery, PlanReceipt } from '../../../terraform/src/runner';
import type { GcloudExecApi } from '../gcloud/exec';
import {
  boundedGcpCleanupObservers,
  gcpCleanupSignal,
  openGcpCaptureCleanupAdmission,
} from './capture-cleanup-admission';
import { readGcpCaptureCleanupStateCandidate } from './capture-cleanup-state';
import { fingerprint } from './discovery';
import { publicTerraformContextHash } from './terraform-context';
import type { GcpTerraformOwnershipObserverRuntime, PublicTerraformOwnership } from './terraform-public-ownership';
import { type PublicTerraformCleanupReview, verifyPublicTerraformLiveOwnership } from './terraform-public-teardown';
import type { GcpCeIntent } from './types';

type StateCandidate = ReturnType<typeof readGcpCaptureCleanupStateCandidate>;
interface Origin {
  schemaVersion: 1;
  kind: 'gcp-capture-cleanup-origin';
  intent: GcpCeIntent;
  directory: string;
  contextHash: string;
  receipt: PlanReceipt;
  candidate: StateCandidate;
  ownership: PublicTerraformOwnership;
  scopeInputs: Record<string, OriginalInputBinding>;
  readerInputs: Record<string, OriginalInputBinding>;
  stateSnapshot: CeImmutableRecord;
  planSnapshot: CeImmutableRecord;
  checkpointSnapshot: CeImmutableRecord;
}
interface Review {
  schemaVersion: 1;
  kind: 'gcp-capture-cleanup-review';
  origin: CeImmutableRecord;
  review: PublicTerraformCleanupReview;
  candidate: StateCandidate;
  stateSnapshot: CeImmutableRecord;
  planSnapshot: CeImmutableRecord;
  checkpointSnapshot: CeImmutableRecord;
}
export interface GcpCaptureCleanupResumeInput {
  readonly intent: GcpCeIntent;
  readonly executionDirectory: string;
  readonly reference: CeImmutableRecord;
  readonly environment: Record<string, string | undefined>;
  readonly api: GcloudExecApi;
  readonly observePlatform: GcpTerraformOwnershipObserverRuntime['observePlatform'];
  readonly reviewReference?: CeImmutableRecord;
  assertIndependentClosure(readerInputs: Readonly<Record<string, OriginalInputBinding>>): Promise<void>;
}
const freeze = <T>(value: T): T => {
  if (value && typeof value === 'object') {
    for (const row of Object.values(value)) freeze(row);
    Object.freeze(value);
  }
  return value;
};
const scopeNames = [
  'deployment.json',
  'main.tf.json',
  '.terraform.lock.hcl',
  'deployment.tfrc',
  'lock:claim.json',
  'lock:lifetime.json',
  'lock:capture-unresolved.json',
] as const;
function mergeInputs(...sets: Readonly<Record<string, OriginalInputBinding>>[]) {
  const paths = new Map<string, OriginalInputBinding>();
  for (const set of sets)
    for (const row of Object.values(set)) {
      const prior = paths.get(row.path);
      if (prior && fingerprint(prior) !== fingerprint(row)) throw new Error('Original cleanup input alias differs');
      paths.set(row.path, row);
    }
  return Object.fromEntries([...paths.values()].map((row, index) => [`source-${index}`, row]));
}
async function storeFor(intent: GcpCeIntent, directory: string) {
  if (
    intent.engine !== 'terraform' ||
    !isAbsolute(directory) ||
    resolve(directory) !== directory ||
    basename(directory) !== intent.deploymentName
  )
    throw new Error('Original GCP cleanup storage binding required');
  return CeDeploymentStore.open(join(directory, 'capture-cleanup-verification', 'admissions'), {
    provider: 'gcp',
    engine: 'terraform',
    account: intent.project,
    region: intent.region,
    deploymentId: intent.deploymentName,
  });
}
function assertCandidate(origin: Origin, current: StateCandidate) {
  const ids = new Map(origin.candidate.resources.map((row) => [row.address, row.id]));
  if (
    current.state.lineage !== origin.candidate.state.lineage ||
    current.state.serial < origin.candidate.state.serial ||
    (current.state.serial === origin.candidate.state.serial &&
      current.state.sha256 !== origin.candidate.state.sha256) ||
    current.resources.some((row) => ids.get(row.address) !== row.id)
  )
    throw new Error('Original GCP cleanup state replaced, rolled back or added identities');
}
function assertDelete(origin: Origin, receipt: PlanReceipt, addresses: string[]) {
  if (
    receipt.schemaVersion !== 1 ||
    receipt.engine !== 'terraform' ||
    receipt.deploymentId !== origin.intent.deploymentName ||
    receipt.backendIdentity !== origin.receipt.backendIdentity ||
    receipt.configurationSha256 !== origin.receipt.configurationSha256 ||
    receipt.providerLockSha256 !== origin.receipt.providerLockSha256 ||
    receipt.operation !== 'destroy' ||
    (receipt.actionInvocations !== undefined &&
      (!Array.isArray(receipt.actionInvocations) || receipt.actionInvocations.length !== 0)) ||
    receipt.noChanges !== (addresses.length === 0) ||
    !Array.isArray(receipt.changes) ||
    fingerprint(receipt.changes.map((row) => row.address).sort()) !== fingerprint(addresses.slice().sort()) ||
    receipt.changes.some((row) => row.actions.join(',') !== 'delete' || row.type !== row.address.split('.')[0])
  )
    throw new Error('Exact original reviewed delete-only cleanup required');
}
async function loadOrigin(input: GcpCaptureCleanupResumeInput) {
  const store = await storeFor(input.intent, input.executionDirectory);
  const origin = decodeEvidenceObject(await store.readImmutableBytes(input.reference)) as unknown as Origin;
  if (
    origin.schemaVersion !== 1 ||
    origin.kind !== 'gcp-capture-cleanup-origin' ||
    origin.directory !== input.executionDirectory ||
    fingerprint(origin.intent) !== fingerprint(input.intent) ||
    origin.contextHash !== publicTerraformContextHash(input.intent, input.environment.XCSH_API_URL) ||
    fingerprint(Object.keys(origin.scopeInputs).sort()) !== fingerprint(scopeNames.slice().sort())
  )
    throw new Error('Original durable GCP cleanup context differs');
  for (const name of scopeNames) {
    const path = name.startsWith('lock:')
      ? join(origin.directory, '.terraform-executor-lock', name.slice(5))
      : join(origin.directory, name);
    if (origin.scopeInputs[name].path !== path) throw new Error('Original durable cleanup source path differs');
  }
  const raw = await store.readImmutableBytes(origin.stateSnapshot);
  const candidate = readGcpCaptureCleanupStateCandidate({
    intent: input.intent,
    createReceipt: origin.receipt,
    bytes: raw,
    expectedStateSha256: origin.candidate.state.sha256,
  });
  const checkpoint = decodeEvidenceObject(await store.readImmutableBytes(origin.checkpointSnapshot));
  await store.readImmutableBytes(origin.planSnapshot);
  if (
    fingerprint(candidate) !== fingerprint(origin.candidate) ||
    origin.planSnapshot.binding.sha256 !== origin.receipt.planSha256 ||
    fingerprint(checkpoint.receipt) !== fingerprint(origin.receipt) ||
    !['applying', 'applied'].includes(String(checkpoint.state)) ||
    origin.ownership.intentFingerprint !== fingerprint(input.intent) ||
    origin.ownership.receiptFingerprint !== fingerprint(origin.receipt) ||
    fingerprint(origin.ownership.state) !== fingerprint(candidate.state) ||
    fingerprint(origin.ownership.addresses.slice().sort()) !==
      fingerprint(candidate.resources.map((row) => row.address).sort())
  )
    throw new Error('Original durable cleanup snapshots differ');
  const monitor = await monitorOriginalInputs(
    mergeInputs(origin.scopeInputs, origin.readerInputs, {
      origin: input.reference.binding,
      state: origin.stateSnapshot.binding,
      plan: origin.planSnapshot.binding,
      checkpoint: origin.checkpointSnapshot.binding,
    }),
  );
  const assertClosed = async () => {
    await monitor.assertOriginal();
    await assertExecutorProcessGroupAbsent(join(origin.directory, '.terraform-executor-lock'));
    await input.assertIndependentClosure(freeze(structuredClone(origin.readerInputs)));
    await monitor.assertOriginal();
  };
  try {
    await assertClosed();
  } catch (error) {
    monitor.close();
    throw error;
  }
  return { store, origin: freeze(origin), monitor, assertClosed };
}
async function currentSnapshot(origin: Origin) {
  const state = await readOwnedInstalledInput(join(origin.directory, 'terraform.tfstate'));
  const checkpoint = await readOwnedInstalledInput(join(origin.directory, 'plan-receipt.json'));
  const plan = await readOwnedInstalledInput(join(origin.directory, 'saved.tfplan'));
  const current = readGcpCaptureCleanupStateCandidate({
    intent: origin.intent,
    createReceipt: origin.receipt,
    bytes: state.bytes,
    expectedStateSha256: state.binding.sha256,
  });
  assertCandidate(origin, current);
  const journal = decodeEvidenceObject(checkpoint.bytes);
  const monitor = await monitorOriginalInputs({
    state: state.binding,
    checkpoint: checkpoint.binding,
    plan: plan.binding,
  });
  return { state, checkpoint, plan, candidate: current, journal, monitor };
}
async function verifyCurrent(
  input: GcpCaptureCleanupResumeInput,
  origin: Origin,
  current: StateCandidate,
  signal?: AbortSignal,
) {
  const clients = boundedGcpCleanupObservers(input.api, input.observePlatform);
  const absent = await verifyPublicTerraformLiveOwnership(
    clients,
    input.intent,
    origin.ownership,
    gcpCleanupSignal(300000, signal),
    true,
  );
  const remaining = origin.ownership.addresses.filter((address) => !absent.includes(address));
  if (fingerprint(remaining.slice().sort()) !== fingerprint(current.resources.map((row) => row.address).sort()))
    throw new Error('Original live cleanup subset requires state reconciliation');
  return absent;
}

/** Compiled publisher only. Persist original evidence before replacing a plan
 * or returning any cleanup runner capability. Credential bytes are not copied. */
export async function persistGcpCaptureCleanupOrigin(
  input: Omit<GcpCaptureCleanupResumeInput, 'reference' | 'reviewReference'> & {
    readonly inspection: CaptureCleanupInspection;
    readonly readerInputs: Readonly<Record<string, OriginalInputBinding>>;
  },
  signal?: AbortSignal,
) {
  const contextHash = publicTerraformContextHash(input.intent, input.environment.XCSH_API_URL);
  if (contextHash !== publicTerraformContextHash(input.intent, input.inspection.environment.XCSH_API_URL))
    throw new Error('Original cleanup publisher context differs');
  const admission = await openGcpCaptureCleanupAdmission(input, signal);
  let monitor: Awaited<ReturnType<typeof monitorOriginalInputs>> | undefined;
  try {
    const store = await storeFor(input.intent, input.executionDirectory);
    const scopeInputs = Object.fromEntries(scopeNames.map((name) => [name, input.inspection.inputs[name]]));
    monitor = await monitorOriginalInputs(mergeInputs(scopeInputs, input.readerInputs, input.inspection.inputs));
    await admission.assertLiveOwnership(signal);
    await input.assertIndependentClosure(input.readerInputs);
    await monitor.assertOriginal();
    const state = await readOwnedInstalledInput(join(input.executionDirectory, 'terraform.tfstate'));
    const checkpoint = await readOwnedInstalledInput(join(input.executionDirectory, 'plan-receipt.json'));
    const plan = await readOwnedInstalledInput(join(input.executionDirectory, 'saved.tfplan'));
    if (
      state.binding.sha256 !== admission.candidate.state.sha256 ||
      plan.binding.sha256 !== input.inspection.receipt.planSha256
    )
      throw new Error('Original GCP cleanup publication inputs changed');
    const id = fingerprint({
      intent: input.intent,
      receipt: input.inspection.receipt,
      state: admission.candidate.state,
      scopeInputs,
      readerInputs: input.readerInputs,
    }).slice(7);
    const stateSnapshot = await store.writeImmutableBytes(`immutable-origin-${id}-state.json`, state.bytes);
    const planSnapshot = await store.writeImmutableBytes(`immutable-origin-${id}-plan.bin`, plan.bytes);
    const checkpointSnapshot = await store.writeImmutableBytes(
      `immutable-origin-${id}-checkpoint.json`,
      checkpoint.bytes,
    );
    const origin: Origin = {
      schemaVersion: 1,
      kind: 'gcp-capture-cleanup-origin',
      intent: structuredClone(input.intent),
      directory: input.executionDirectory,
      contextHash,
      receipt: structuredClone(input.inspection.receipt),
      candidate: admission.candidate,
      ownership: admission.ownership,
      scopeInputs,
      readerInputs: structuredClone(input.readerInputs),
      stateSnapshot,
      planSnapshot,
      checkpointSnapshot,
    };
    await monitor.assertOriginal();
    const reference = await store.writeImmutableBytes(
      `immutable-origin-${id}.json`,
      Buffer.from(JSON.stringify(origin)),
    );
    return Object.freeze({
      reference,
      ownership: admission.ownership,
      state: admission.candidate.state,
      executionAuthorized: false as const,
    });
  } finally {
    monitor?.close();
    admission.close();
  }
}

/** Retain the reviewed current destroy and its original pre-action state. */
export async function persistGcpCaptureCleanupReview(
  input: GcpCaptureCleanupResumeInput & { readonly review: PublicTerraformCleanupReview },
  signal?: AbortSignal,
) {
  const source = await loadOrigin(input);
  let current: Awaited<ReturnType<typeof currentSnapshot>> | undefined;
  try {
    current = await currentSnapshot(source.origin);
    const { planHash, ...body } = input.review;
    assertDelete(
      source.origin,
      input.review.savedPlan,
      current.candidate.resources.map((row) => row.address),
    );
    if (
      input.review.operation !== 'teardown' ||
      input.review.engine !== 'terraform' ||
      input.review.intentFingerprint !== fingerprint(input.intent) ||
      input.review.ownershipHash !== fingerprint(source.origin.ownership) ||
      fingerprint(body) !== planHash ||
      input.review.originalAuthorization.receiptFingerprint !== fingerprint(source.origin.receipt) ||
      input.review.originalAuthorization.intentFingerprint !== fingerprint(input.intent) ||
      fingerprint(input.review.state) !== fingerprint(current.candidate.state) ||
      current.journal.state !== 'planned' ||
      fingerprint(current.journal.receipt) !== fingerprint(input.review.savedPlan) ||
      current.plan.binding.sha256 !== input.review.savedPlan.planSha256 ||
      !Number.isFinite(Date.parse(input.review.createdAt)) ||
      Date.now() - Date.parse(input.review.createdAt) >= 300000 ||
      Date.parse(input.review.createdAt) - Date.now() > 5000
    )
      throw new Error('Original current cleanup review is stale or differs');
    await verifyCurrent(input, source.origin, current.candidate, signal);
    await source.assertClosed();
    await current.monitor.assertOriginal();
    const id = planHash.slice(7);
    const stateSnapshot = await source.store.writeImmutableBytes(
      `immutable-review-${id}-state.json`,
      current.state.bytes,
    );
    const planSnapshot = await source.store.writeImmutableBytes(`immutable-review-${id}-plan.bin`, current.plan.bytes);
    const checkpointSnapshot = await source.store.writeImmutableBytes(
      `immutable-review-${id}-checkpoint.json`,
      current.checkpoint.bytes,
    );
    const record: Review = {
      schemaVersion: 1,
      kind: 'gcp-capture-cleanup-review',
      origin: input.reference,
      review: structuredClone(input.review),
      candidate: current.candidate,
      stateSnapshot,
      planSnapshot,
      checkpointSnapshot,
    };
    const reference = await source.store.writeImmutableBytes(
      `immutable-review-${id}.json`,
      Buffer.from(JSON.stringify(record)),
    );
    await source.assertClosed();
    await current.monitor.assertOriginal();
    return Object.freeze({ reference, executionAuthorized: false as const });
  } finally {
    current?.monitor.close();
    source.monitor.close();
  }
}

export interface GcpCaptureCleanupResume {
  readonly createReceipt: PlanReceipt;
  readonly ownership: PublicTerraformOwnership;
  readonly mode: 'original' | 'planned-destroy' | 'partial-replan-required' | 'completed-readonly';
  readonly recovery: CaptureCleanupRecovery;
  readonly absent: string[];
  readonly executionAuthorized: false;
  readonly requiresNewReviewedPlan: boolean;
  close(): void;
}

/** Reconstruct only original owned identities. Resume itself never invokes
 * Terraform or submits an action; applying receipts require a new review. */
export async function resumeGcpCaptureCleanupOrigin(input: GcpCaptureCleanupResumeInput, signal?: AbortSignal) {
  const source = await loadOrigin(input);
  let current: Awaited<ReturnType<typeof currentSnapshot>> | undefined;
  let reviewMonitor: Awaited<ReturnType<typeof monitorOriginalInputs>> | undefined;
  let release: (() => Promise<void>) | undefined;
  let closed = false;
  let result: GcpCaptureCleanupResume | undefined;
  const failures: unknown[] = [];
  try {
    release = await acquireProcessLock(join(source.store.directory, '.gcp-cleanup-resume-lock'));
    current = await currentSnapshot(source.origin);
    const candidate = current.candidate;
    const currentReceipt = current.journal.receipt as PlanReceipt;
    if (current.plan.binding.sha256 !== currentReceipt.planSha256) throw new Error('Current cleanup binary differs');
    const absent = await verifyCurrent(input, source.origin, candidate, signal);
    await source.assertClosed();
    await current.monitor.assertOriginal();
    let review: Review | undefined;
    if (input.reviewReference) {
      review = decodeEvidenceObject(await source.store.readImmutableBytes(input.reviewReference)) as unknown as Review;
      const { planHash, ...body } = review.review;
      const before = readGcpCaptureCleanupStateCandidate({
        intent: input.intent,
        createReceipt: source.origin.receipt,
        bytes: await source.store.readImmutableBytes(review.stateSnapshot),
        expectedStateSha256: review.candidate.state.sha256,
      });
      await source.store.readImmutableBytes(review.planSnapshot);
      const checkpoint = decodeEvidenceObject(await source.store.readImmutableBytes(review.checkpointSnapshot));
      if (
        review.schemaVersion !== 1 ||
        review.kind !== 'gcp-capture-cleanup-review' ||
        fingerprint(review.origin) !== fingerprint(input.reference) ||
        fingerprint(body) !== planHash ||
        fingerprint(before) !== fingerprint(review.candidate) ||
        review.planSnapshot.binding.sha256 !== review.review.savedPlan.planSha256 ||
        checkpoint.state !== 'planned' ||
        fingerprint(checkpoint.receipt) !== fingerprint(review.review.savedPlan)
      )
        throw new Error('Original immutable cleanup review differs');
      assertCandidate(source.origin, before);
      assertDelete(
        source.origin,
        review.review.savedPlan,
        before.resources.map((row) => row.address),
      );
      if (candidate.state.serial < before.state.serial) throw new Error('Cleanup review state rolled back');
      reviewMonitor = await monitorOriginalInputs({
        review: input.reviewReference.binding,
        state: review.stateSnapshot.binding,
        plan: review.planSnapshot.binding,
        checkpoint: review.checkpointSnapshot.binding,
      });
    }
    const retainedLockInputs = Object.fromEntries(
      ['claim.json', 'lifetime.json', 'capture-unresolved.json'].map((name) => [
        name,
        source.origin.scopeInputs[`lock:${name}`],
      ]),
    );
    const retainedLockSha256 = Object.fromEntries(
      Object.entries(retainedLockInputs).map(([name, binding]) => [name, binding.sha256]),
    ) as CaptureCleanupRecovery['retainedLockSha256'];
    const close = () => {
      closed = true;
      source.monitor.close();
      current?.monitor.close();
      reviewMonitor?.close();
    };
    const assertClosed = async () => {
      if (closed) throw new Error('Original durable cleanup resume retired');
      await source.assertClosed();
      await reviewMonitor?.assertOriginal();
      if (closed) throw new Error('Original durable cleanup resume retired during inspection');
    };
    let mode: 'original' | 'planned-destroy' | 'partial-replan-required' | 'completed-readonly';
    let recovery: CaptureCleanupRecovery = {
      deploymentId: input.intent.deploymentName,
      deploymentManifestSha256: source.origin.scopeInputs['deployment.json'].sha256,
      state: candidate.state,
      resources: candidate.resources,
      retainedLockInputs,
      retainedLockSha256,
      assertIndependentClosure: assertClosed,
    };
    if (!source.origin.candidate.resources.length) {
      if (candidate.resources.length) throw new Error('Original empty cleanup gained resources');
      if (fingerprint(candidate.state) !== fingerprint(source.origin.candidate.state))
        throw new Error('Original empty cleanup state changed');
      if (currentReceipt.operation === 'destroy') {
        assertDelete(source.origin, currentReceipt, []);
        if (current.journal.state !== 'planned') throw new Error('Original empty destroy checkpoint differs');
      } else if (
        fingerprint(currentReceipt) !== fingerprint(source.origin.receipt) ||
        !['applying', 'applied'].includes(String(current.journal.state))
      ) {
        throw new Error('Original empty creation checkpoint differs');
      }
      recovery = {
        ...recovery,
        emptyOriginal: {
          schemaVersion: 1,
          kind: 'original-empty-create-state-verification',
          checkpoint: source.origin.checkpointSnapshot.binding,
          savedPlan: source.origin.planSnapshot.binding,
          receipt: source.origin.receipt,
        },
      };
      mode = 'original';
    } else if (!candidate.resources.length) {
      if (!review?.candidate.resources.length || candidate.state.serial <= review.candidate.state.serial)
        throw new Error('Original reviewed destroy required for completed cleanup effects');
      if (
        currentReceipt.operation !== 'destroy' ||
        !['planned', 'applying', 'applied'].includes(String(current.journal.state))
      )
        throw new Error('Completed cleanup current checkpoint differs');
      if (!currentReceipt.noChanges && fingerprint(currentReceipt) !== fingerprint(review.review.savedPlan))
        throw new Error('Completed cleanup applying receipt differs');
      if (currentReceipt.noChanges) assertDelete(source.origin, currentReceipt, []);
      const effect = await source.store.writeImmutableBytes(
        `immutable-effects-${randomUUID()}.json`,
        Buffer.from(
          JSON.stringify({
            schemaVersion: 1,
            state: 'applied',
            receipt: review.review.savedPlan,
            executionObserved: false,
            kind: 'independent-owned-cleanup-effects',
            observedAt: new Date().toISOString(),
            stateIdentity: candidate.state,
            absent,
          }),
        ),
      );
      recovery = {
        ...recovery,
        state: review.candidate.state,
        resources: review.candidate.resources,
        verification: {
          schemaVersion: 1,
          kind: 'applied-destroy-state-verification',
          checkpoint: effect.binding,
          state: candidate.state,
        },
      };
      mode = 'completed-readonly';
    } else if (currentReceipt.operation === 'destroy') {
      if (
        !review ||
        fingerprint(currentReceipt) !== fingerprint(review.review.savedPlan) ||
        !['planned', 'applying', 'applied'].includes(String(current.journal.state))
      )
        throw new Error('Original reviewed current destroy required');
      mode =
        current.journal.state === 'planned' && fingerprint(candidate.state) === fingerprint(review.candidate.state)
          ? 'planned-destroy'
          : 'partial-replan-required';
    } else {
      if (
        fingerprint(currentReceipt) !== fingerprint(source.origin.receipt) ||
        !['applying', 'applied'].includes(String(current.journal.state)) ||
        fingerprint(candidate.state) !== fingerprint(source.origin.candidate.state)
      )
        throw new Error('Original interrupted create checkpoint differs');
      mode = 'original';
    }
    await assertClosed();
    await current.monitor.assertOriginal();
    result = Object.freeze({
      createReceipt: source.origin.receipt,
      ownership: source.origin.ownership,
      mode,
      recovery: freeze(recovery),
      absent,
      executionAuthorized: false as const,
      requiresNewReviewedPlan: Boolean(
        mode === 'partial-replan-required' ||
          (mode === 'planned-destroy' && review && Date.now() - Date.parse(review.review.createdAt) >= 300000),
      ),
      close,
    });
  } catch (error) {
    failures.push(error);
  } finally {
    try {
      if (release) await release();
    } catch (error) {
      failures.push(error);
    }
    if (!result || failures.length) {
      source.monitor.close();
      current?.monitor.close();
      reviewMonitor?.close();
    }
  }
  if (failures.length)
    throw new AggregateError(failures, 'Original durable cleanup reconstruction or lock closure failed');
  if (!result) throw new Error('Original durable cleanup result unavailable');
  return result;
}
