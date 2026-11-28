import { lstat } from 'node:fs/promises';
import { basename, isAbsolute, join, resolve } from 'node:path';
import { CeDeploymentStore, type CeImmutableRecord } from '../../../platform/src/ce/deployment-store';
import { acquireProcessLock, assertExecutorProcessGroupAbsent } from '../../../platform/src/ce/process-lock';
import { decodeEvidenceObject } from '../../../terraform/src/evidence-json';
import { readOwnedInstalledInput } from '../../../terraform/src/installed-runtime';
import { monitorOriginalInputs, type OriginalInputBinding } from '../../../terraform/src/original-input-monitor';
import type { PlanReceipt } from '../../../terraform/src/runner';
import {
  type GcpAppliedSourceTeardownOrigin,
  readGcpAppliedSourceTeardownOrigin,
} from './applied-source-teardown-origin';
import { boundedGcpCleanupObservers, gcpCleanupSignal } from './capture-cleanup-admission';
import { readGcpCaptureCleanupStateCandidate } from './capture-cleanup-state';
import { fingerprint } from './discovery';
import {
  assertSuccessfulGcpSourceTerminal,
  type GcpSourceCampaignInputs,
  openGcpSourceCampaignEvidence,
} from './source-campaign-evidence';
import { publicTerraformContextHash } from './terraform-context';
import { type GcpTerraformOwnershipObserverRuntime, publicTerraformAddresses } from './terraform-public-ownership';
import { type PublicTerraformCleanupReview, verifyPublicTerraformLiveOwnership } from './terraform-public-teardown';
import type { GcpCeIntent } from './types';

type Candidate = ReturnType<typeof readGcpCaptureCleanupStateCandidate>;
type Proof = Awaited<ReturnType<typeof readGcpAppliedSourceTeardownOrigin>>;
const scopeNames = ['deployment.json', 'main.tf.json', '.terraform.lock.hcl', 'deployment.tfrc'] as const;
interface Origin {
  schemaVersion: 1;
  kind: 'gcp-applied-source-cleanup-origin';
  intent: GcpCeIntent;
  directory: string;
  contextHash: string;
  receipt: PlanReceipt;
  source: GcpSourceCampaignInputs;
  proof: Proof;
  candidate: Candidate;
  scopeInputs: Record<string, OriginalInputBinding>;
  readerInputs: Record<string, OriginalInputBinding>;
  stateSnapshot: CeImmutableRecord;
  planSnapshot: CeImmutableRecord;
  checkpointSnapshot: CeImmutableRecord;
}
interface Review {
  schemaVersion: 1;
  kind: 'gcp-applied-source-cleanup-review';
  origin: CeImmutableRecord;
  review: PublicTerraformCleanupReview;
  candidate: Candidate;
  stateSnapshot: CeImmutableRecord;
  planSnapshot: CeImmutableRecord;
  checkpointSnapshot: CeImmutableRecord;
}
export interface GcpAppliedSourceCleanupResumeInput {
  readonly intent: GcpCeIntent;
  readonly executionDirectory: string;
  readonly reference: CeImmutableRecord;
  readonly reviewReference?: CeImmutableRecord;
  readonly environment: Record<string, string | undefined>;
  readonly api: GcpTerraformOwnershipObserverRuntime['api'];
  readonly observePlatform: GcpTerraformOwnershipObserverRuntime['observePlatform'];
  assertIndependentClosure(readerInputs: Readonly<Record<string, OriginalInputBinding>>): Promise<void>;
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function mergeInputs(...sets: Readonly<Record<string, OriginalInputBinding>>[]) {
  const paths = new Map<string, OriginalInputBinding>();
  for (const set of sets)
    for (const row of Object.values(set)) {
      const prior = paths.get(row.path);
      if (prior && fingerprint(prior) !== fingerprint(row)) throw new Error('Original applied cleanup aliases differ');
      paths.set(row.path, row);
    }
  return Object.fromEntries([...paths.values()].map((row, index) => [`original-${index}`, row]));
}
/** Successful runner closure can retire its lock; physical original-reader
 * closure is still independently required by every caller after this check. */
async function assertRetainedExecutorAbsent(directory: string) {
  const lock = join(directory, '.terraform-executor-lock');
  try {
    await lstat(lock);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  await assertExecutorProcessGroupAbsent(lock);
}
async function storeFor(intent: GcpCeIntent, directory: string) {
  if (
    intent.engine !== 'terraform' ||
    intent.schemaVersion !== 2 ||
    !isAbsolute(directory) ||
    resolve(directory) !== directory ||
    basename(directory) !== intent.deploymentName
  )
    throw new Error('Original applied GCP cleanup directory required');
  return CeDeploymentStore.open(join(directory, 'applied-source-cleanup-verification', 'admissions'), {
    provider: 'gcp',
    engine: 'terraform',
    account: intent.project,
    region: intent.region,
    deploymentId: intent.deploymentName,
  });
}
function assertCandidate(origin: Origin, current: Candidate) {
  const ids = new Map(origin.candidate.resources.map((row) => [row.address, row.id]));
  if (
    current.state.lineage !== origin.candidate.state.lineage ||
    current.state.serial < origin.candidate.state.serial ||
    (current.state.serial === origin.candidate.state.serial &&
      current.state.sha256 !== origin.candidate.state.sha256) ||
    current.resources.some((row) => ids.get(row.address) !== row.id)
  )
    throw new Error('Original applied cleanup state replaced or rolled back');
}
function assertDelete(origin: Origin, receipt: PlanReceipt, addresses: string[]) {
  if (
    receipt.schemaVersion !== 1 ||
    receipt.engine !== 'terraform' ||
    receipt.operation !== 'destroy' ||
    receipt.deploymentId !== origin.intent.deploymentName ||
    receipt.backendIdentity !== origin.receipt.backendIdentity ||
    receipt.configurationSha256 !== origin.receipt.configurationSha256 ||
    receipt.providerLockSha256 !== origin.receipt.providerLockSha256 ||
    !/^[a-f0-9]{64}$/.test(receipt.planSha256) ||
    (receipt.actionInvocations !== undefined &&
      (!Array.isArray(receipt.actionInvocations) || receipt.actionInvocations.length !== 0)) ||
    receipt.noChanges !== (addresses.length === 0) ||
    !Array.isArray(receipt.changes) ||
    fingerprint(receipt.changes.map((row) => row.address).sort()) !== fingerprint(addresses.slice().sort()) ||
    receipt.changes.some((row) => row.actions.join(',') !== 'delete' || row.type !== row.address.split('.')[0])
  )
    throw new Error('Exact original applied cleanup delete-only plan required');
}
async function currentSnapshot(origin: Pick<Origin, 'intent' | 'receipt' | 'directory'>) {
  const state = await readOwnedInstalledInput(join(origin.directory, 'terraform.tfstate'));
  const checkpoint = await readOwnedInstalledInput(join(origin.directory, 'plan-receipt.json'));
  const plan = await readOwnedInstalledInput(join(origin.directory, 'saved.tfplan'));
  const candidate = readGcpCaptureCleanupStateCandidate({
    intent: origin.intent,
    createReceipt: origin.receipt,
    bytes: state.bytes,
    expectedStateSha256: state.binding.sha256,
  });
  const journal = decodeEvidenceObject(checkpoint.bytes);
  const monitor = await monitorOriginalInputs({
    state: state.binding,
    checkpoint: checkpoint.binding,
    plan: plan.binding,
  });
  return { state, checkpoint, plan, candidate, journal, monitor };
}
async function verifyCurrent(
  input: GcpAppliedSourceCleanupResumeInput,
  origin: Origin,
  candidate: Candidate,
  signal?: AbortSignal,
) {
  const clients = boundedGcpCleanupObservers(input.api, input.observePlatform);
  const absent = await verifyPublicTerraformLiveOwnership(
    clients,
    input.intent,
    origin.proof.owned,
    gcpCleanupSignal(300000, signal),
    true,
  );
  const remaining = origin.proof.owned.addresses.filter((address) => !absent.includes(address));
  if (fingerprint(remaining.slice().sort()) !== fingerprint(candidate.resources.map((row) => row.address).sort()))
    throw new Error('Original applied live cleanup subset requires state reconciliation');
  return { absent, remaining };
}
async function loadOrigin(input: GcpAppliedSourceCleanupResumeInput, signal?: AbortSignal) {
  const intent = structuredClone(input.intent),
    environment = input.environment;
  const contextHash = publicTerraformContextHash(intent, environment.XCSH_API_URL);
  const assertIndependentClosure = input.assertIndependentClosure.bind(input);
  const store = await storeFor(intent, input.executionDirectory);
  const origin = decodeEvidenceObject(await store.readImmutableBytes(input.reference)) as unknown as Origin;
  if (
    origin.schemaVersion !== 1 ||
    origin.kind !== 'gcp-applied-source-cleanup-origin' ||
    origin.directory !== input.executionDirectory ||
    fingerprint(origin.intent) !== fingerprint(intent) ||
    origin.contextHash !== contextHash ||
    fingerprint(Object.keys(origin.scopeInputs).sort()) !== fingerprint(scopeNames.slice().sort())
  )
    throw new Error('Original durable applied cleanup context differs');
  for (const name of scopeNames)
    if (origin.scopeInputs[name].path !== join(origin.directory, name))
      throw new Error('Original applied cleanup source path differs');
  if (
    origin.scopeInputs['main.tf.json'].sha256 !== origin.receipt.configurationSha256 ||
    origin.scopeInputs['.terraform.lock.hcl'].sha256 !== origin.receipt.providerLockSha256
  )
    throw new Error('Original applied cleanup configuration differs');
  const candidate = readGcpCaptureCleanupStateCandidate({
    intent,
    createReceipt: origin.receipt,
    bytes: await store.readImmutableBytes(origin.stateSnapshot),
    expectedStateSha256: origin.candidate.state.sha256,
  });
  const checkpoint = decodeEvidenceObject(await store.readImmutableBytes(origin.checkpointSnapshot));
  await store.readImmutableBytes(origin.planSnapshot);
  if (
    fingerprint(candidate) !== fingerprint(origin.candidate) ||
    candidate.resources.length !== publicTerraformAddresses(intent).length ||
    origin.planSnapshot.binding.sha256 !== origin.receipt.planSha256 ||
    checkpoint.state !== 'applied' ||
    fingerprint(checkpoint.receipt) !== fingerprint(origin.receipt) ||
    !origin.proof.owned.complete ||
    fingerprint(origin.proof.owned.state) !== fingerprint(candidate.state) ||
    origin.proof.owned.intentFingerprint !== fingerprint(intent) ||
    origin.proof.owned.receiptFingerprint !== fingerprint(origin.receipt) ||
    fingerprint(origin.proof.owned.addresses.slice().sort()) !==
      fingerprint(candidate.resources.map((row) => row.address).sort())
  )
    throw new Error('Original durable applied cleanup snapshots differ');
  const evidence = await openGcpSourceCampaignEvidence({ intent, source: origin.source });
  let monitor: Awaited<ReturnType<typeof monitorOriginalInputs>> | undefined;
  let closed = false,
    refusal: unknown;
  const close = () => {
    closed = true;
    evidence.close();
    monitor?.close();
  };
  try {
    assertSuccessfulGcpSourceTerminal(evidence.terminal);
    await evidence.assertReceipt(origin.receipt);
    const expectedOriginal = {
      schemaVersion: 1,
      kind: 'applied-source-qualification',
      planHash: `sha256:${evidence.authorizationSha256}`,
      receiptFingerprint: fingerprint(origin.receipt),
      intentFingerprint: fingerprint(intent),
      originSha256: evidence.sourceHash.slice(7),
      authorizationSha256: evidence.authorizationSha256,
      reviewSha256: evidence.reviewSha256,
    };
    if (
      fingerprint(origin.proof.original) !== fingerprint(expectedOriginal) ||
      origin.proof.contextHash !== contextHash
    )
      throw new Error('Original durable applied authorization differs');
    monitor = await monitorOriginalInputs(
      mergeInputs(origin.scopeInputs, origin.readerInputs, origin.source, {
        origin: input.reference.binding,
        state: origin.stateSnapshot.binding,
        plan: origin.planSnapshot.binding,
        checkpoint: origin.checkpointSnapshot.binding,
      }),
    );
    const assertOriginal = async () => {
      if (closed) throw new Error('Original durable applied cleanup retired');
      if (refusal) throw refusal;
      try {
        signal?.throwIfAborted();
        await monitor?.assertOriginal();
        await evidence.assertOriginal();
        if (
          input.environment !== environment ||
          publicTerraformContextHash(intent, environment.XCSH_API_URL) !== contextHash
        )
          throw new Error('Original durable applied context changed');
        await assertRetainedExecutorAbsent(origin.directory);
        await assertIndependentClosure(freeze(structuredClone(origin.readerInputs)));
        await monitor?.assertOriginal();
        await evidence.assertOriginal();
        if (
          input.environment !== environment ||
          publicTerraformContextHash(intent, environment.XCSH_API_URL) !== contextHash
        )
          throw new Error('Original durable applied context changed during closure');
        signal?.throwIfAborted();
        if (closed) throw new Error('Original durable applied cleanup retired during inspection');
      } catch (error) {
        refusal = error;
        throw error;
      }
    };
    await assertOriginal();
    return { store, origin: freeze(origin), assertOriginal, close };
  } catch (error) {
    close();
    throw error;
  }
}

/** Preserve the issued successful apply proof before a destroy plan replaces
 * its checkpoint. Credential bytes, failed flags and public journals are not created. */
export async function persistGcpAppliedSourceCleanupOrigin(
  input: Omit<GcpAppliedSourceCleanupResumeInput, 'reference' | 'reviewReference'> & {
    readonly source: GcpSourceCampaignInputs;
    readonly origin: GcpAppliedSourceTeardownOrigin;
    readonly receipt: PlanReceipt;
    readonly readerInputs: Readonly<Record<string, OriginalInputBinding>>;
  },
  signal?: AbortSignal,
) {
  const intent = structuredClone(input.intent),
    receipt = structuredClone(input.receipt);
  const source = structuredClone(input.source),
    readerInputs = structuredClone(input.readerInputs);
  const environment = input.environment,
    contextHash = publicTerraformContextHash(intent, environment.XCSH_API_URL);
  const assertIndependentClosure = input.assertIndependentClosure.bind(input);
  const store = await storeFor(intent, input.executionDirectory);
  const proof = await readGcpAppliedSourceTeardownOrigin(input.origin, intent);
  if (proof.contextHash !== contextHash || proof.original.receiptFingerprint !== fingerprint(receipt))
    throw new Error('Original applied cleanup publisher context or receipt differs');
  const evidence = await openGcpSourceCampaignEvidence({ intent, source });
  let current: Awaited<ReturnType<typeof currentSnapshot>> | undefined;
  let monitor: Awaited<ReturnType<typeof monitorOriginalInputs>> | undefined;
  try {
    assertSuccessfulGcpSourceTerminal(evidence.terminal);
    await evidence.assertReceipt(receipt);
    if (proof.original.originSha256 !== evidence.sourceHash.slice(7))
      throw new Error('Original issued source evidence differs');
    const scopeInputs = Object.fromEntries(
      await Promise.all(
        scopeNames.map(async (name) => [
          name,
          (await readOwnedInstalledInput(join(input.executionDirectory, name))).binding,
        ]),
      ),
    );
    if (
      scopeInputs['main.tf.json'].sha256 !== receipt.configurationSha256 ||
      scopeInputs['.terraform.lock.hcl'].sha256 !== receipt.providerLockSha256
    )
      throw new Error('Original applied configuration hash differs');
    current = await currentSnapshot({ intent, receipt, directory: input.executionDirectory });
    if (
      current.journal.state !== 'applied' ||
      fingerprint(current.journal.receipt) !== fingerprint(receipt) ||
      current.plan.binding.sha256 !== receipt.planSha256 ||
      fingerprint(current.candidate.state) !== fingerprint(proof.owned.state) ||
      current.candidate.resources.length !== publicTerraformAddresses(intent).length
    )
      throw new Error('Original successful applied checkpoint and complete state required');
    monitor = await monitorOriginalInputs(mergeInputs(source, scopeInputs, readerInputs));
    const guard = async () => {
      signal?.throwIfAborted();
      await monitor?.assertOriginal();
      await current?.monitor.assertOriginal();
      await readGcpAppliedSourceTeardownOrigin(input.origin, intent);
      await assertRetainedExecutorAbsent(input.executionDirectory);
      await assertIndependentClosure(freeze(structuredClone(readerInputs)));
      await monitor?.assertOriginal();
      await current?.monitor.assertOriginal();
      if (
        input.environment !== environment ||
        publicTerraformContextHash(intent, environment.XCSH_API_URL) !== contextHash
      )
        throw new Error('Original applied cleanup publication context changed');
      signal?.throwIfAborted();
    };
    await guard();
    const id = fingerprint({
      intent,
      receipt,
      source,
      scopeInputs,
      readerInputs,
      state: current.candidate.state,
    }).slice(7);
    const stateSnapshot = await store.writeImmutableBytes(`immutable-origin-${id}-state.json`, current.state.bytes);
    const planSnapshot = await store.writeImmutableBytes(`immutable-origin-${id}-plan.bin`, current.plan.bytes);
    const checkpointSnapshot = await store.writeImmutableBytes(
      `immutable-origin-${id}-checkpoint.json`,
      current.checkpoint.bytes,
    );
    const origin: Origin = {
      schemaVersion: 1,
      kind: 'gcp-applied-source-cleanup-origin',
      intent,
      directory: input.executionDirectory,
      contextHash,
      receipt,
      source,
      proof,
      candidate: current.candidate,
      scopeInputs,
      readerInputs,
      stateSnapshot,
      planSnapshot,
      checkpointSnapshot,
    };
    await guard();
    const reference = await store.writeImmutableBytes(
      `immutable-origin-${id}.json`,
      Buffer.from(JSON.stringify(origin)),
    );
    await guard();
    return freeze({ reference, ownership: proof.owned, original: proof.original, executionAuthorized: false as const });
  } finally {
    current?.monitor.close();
    monitor?.close();
    evidence.close();
  }
}
function assertReview(origin: Origin, review: PublicTerraformCleanupReview, before: Candidate) {
  const { planHash, ...body } = review;
  assertDelete(
    origin,
    review.savedPlan,
    before.resources.map((row) => row.address),
  );
  if (
    review.schemaVersion !== 3 ||
    review.operation !== 'teardown' ||
    review.engine !== 'terraform' ||
    review.intentFingerprint !== fingerprint(origin.intent) ||
    review.ownershipHash !== fingerprint(origin.proof.owned) ||
    fingerprint(review.originalAuthorization) !== fingerprint(origin.proof.original) ||
    fingerprint(review.state) !== fingerprint(before.state) ||
    fingerprint(body) !== planHash ||
    fingerprint(review.remaining.slice().sort()) !== fingerprint(before.resources.map((row) => row.address).sort())
  )
    throw new Error('Original durable applied cleanup review differs');
  assertCandidate(origin, before);
}
export async function persistGcpAppliedSourceCleanupReview(
  input: GcpAppliedSourceCleanupResumeInput & { readonly review: PublicTerraformCleanupReview },
  signal?: AbortSignal,
) {
  const source = await loadOrigin(input, signal);
  let current: Awaited<ReturnType<typeof currentSnapshot>> | undefined;
  try {
    current = await currentSnapshot(source.origin);
    assertReview(source.origin, input.review, current.candidate);
    const age = Date.now() - Date.parse(input.review.createdAt);
    if (
      !Number.isFinite(age) ||
      age >= 300000 ||
      age < -5000 ||
      current.journal.state !== 'planned' ||
      fingerprint(current.journal.receipt) !== fingerprint(input.review.savedPlan) ||
      current.plan.binding.sha256 !== input.review.savedPlan.planSha256
    )
      throw new Error('Current original applied cleanup review is stale or differs');
    await verifyCurrent(input, source.origin, current.candidate, signal);
    await source.assertOriginal();
    await current.monitor.assertOriginal();
    const id = input.review.planHash.slice(7);
    const stateSnapshot = await source.store.writeImmutableBytes(
      `immutable-review-${id}-state.json`,
      current.state.bytes,
    );
    const planSnapshot = await source.store.writeImmutableBytes(`immutable-review-${id}-plan.bin`, current.plan.bytes);
    const checkpointSnapshot = await source.store.writeImmutableBytes(
      `immutable-review-${id}-checkpoint.json`,
      current.checkpoint.bytes,
    );
    const review: Review = {
      schemaVersion: 1,
      kind: 'gcp-applied-source-cleanup-review',
      origin: input.reference,
      review: structuredClone(input.review),
      candidate: current.candidate,
      stateSnapshot,
      planSnapshot,
      checkpointSnapshot,
    };
    const reference = await source.store.writeImmutableBytes(
      `immutable-review-${id}.json`,
      Buffer.from(JSON.stringify(review)),
    );
    await source.assertOriginal();
    await current.monitor.assertOriginal();
    return Object.freeze({ reference, executionAuthorized: false as const });
  } finally {
    current?.monitor.close();
    source.close();
  }
}

/** Validate a fresh original subset without running Terraform, rewriting its
 * checkpoint or granting action authority. The caller issues the opaque origin. */
export async function inspectGcpAppliedSourceCleanupResume(
  input: GcpAppliedSourceCleanupResumeInput,
  signal?: AbortSignal,
) {
  const source = await loadOrigin(input, signal);
  let current: Awaited<ReturnType<typeof currentSnapshot>> | undefined;
  let reviewMonitor: Awaited<ReturnType<typeof monitorOriginalInputs>> | undefined;
  let release: (() => Promise<void>) | undefined;
  let returned = false;
  try {
    release = await acquireProcessLock(join(source.store.directory, '.gcp-cleanup-resume-lock'));
    current = await currentSnapshot(source.origin);
    assertCandidate(source.origin, current.candidate);
    const receipt = current.journal.receipt as PlanReceipt;
    if (current.plan.binding.sha256 !== receipt.planSha256) throw new Error('Current applied cleanup binary differs');
    const { absent, remaining } = await verifyCurrent(input, source.origin, current.candidate, signal);
    let review: Review | undefined;
    if (input.reviewReference) {
      review = decodeEvidenceObject(await source.store.readImmutableBytes(input.reviewReference)) as unknown as Review;
      if (
        review.schemaVersion !== 1 ||
        review.kind !== 'gcp-applied-source-cleanup-review' ||
        fingerprint(review.origin) !== fingerprint(input.reference)
      )
        throw new Error('Original applied immutable review differs');
      const before = readGcpCaptureCleanupStateCandidate({
        intent: input.intent,
        createReceipt: source.origin.receipt,
        bytes: await source.store.readImmutableBytes(review.stateSnapshot),
        expectedStateSha256: review.candidate.state.sha256,
      });
      const checkpoint = decodeEvidenceObject(await source.store.readImmutableBytes(review.checkpointSnapshot));
      await source.store.readImmutableBytes(review.planSnapshot);
      assertReview(source.origin, review.review, before);
      if (
        fingerprint(before) !== fingerprint(review.candidate) ||
        checkpoint.state !== 'planned' ||
        fingerprint(checkpoint.receipt) !== fingerprint(review.review.savedPlan) ||
        review.planSnapshot.binding.sha256 !== review.review.savedPlan.planSha256 ||
        current.candidate.state.serial < before.state.serial
      )
        throw new Error('Original applied immutable review snapshots differ');
      reviewMonitor = await monitorOriginalInputs({
        review: input.reviewReference.binding,
        state: review.stateSnapshot.binding,
        plan: review.planSnapshot.binding,
        checkpoint: review.checkpointSnapshot.binding,
      });
    }
    let mode: 'original' | 'planned-destroy' | 'partial-replan-required' | 'completed-readonly';
    if (!remaining.length) {
      if (
        !review?.candidate.resources.length ||
        current.candidate.state.serial <= review.candidate.state.serial ||
        receipt.operation !== 'destroy'
      )
        throw new Error('Original reviewed applied destroy required for completed cleanup');
      if (receipt.noChanges) {
        assertDelete(source.origin, receipt, []);
        if (current.journal.state !== 'planned') throw new Error('Final empty destroy checkpoint differs');
      } else if (
        !['applying', 'applied'].includes(String(current.journal.state)) ||
        fingerprint(receipt) !== fingerprint(review.review.savedPlan)
      )
        throw new Error('Completed original applied destroy checkpoint differs');
      mode = 'completed-readonly';
    } else if (receipt.operation === 'destroy') {
      if (
        !review ||
        fingerprint(receipt) !== fingerprint(review.review.savedPlan) ||
        !['planned', 'applying', 'applied'].includes(String(current.journal.state))
      )
        throw new Error('Original current reviewed applied destroy required');
      mode =
        current.journal.state === 'planned' &&
        fingerprint(current.candidate.state) === fingerprint(review.candidate.state)
          ? 'planned-destroy'
          : 'partial-replan-required';
    } else {
      if (
        current.journal.state !== 'applied' ||
        fingerprint(receipt) !== fingerprint(source.origin.receipt) ||
        fingerprint(current.candidate.state) !== fingerprint(source.origin.candidate.state)
      )
        throw new Error('Original successful create checkpoint differs');
      mode = 'original';
    }
    await source.assertOriginal();
    await current.monitor.assertOriginal();
    await reviewMonitor?.assertOriginal();
    const close = () => {
      source.close();
      current?.monitor.close();
      reviewMonitor?.close();
    };
    const assertOriginal = async () => {
      await source.assertOriginal();
      await reviewMonitor?.assertOriginal();
    };
    await release();
    release = undefined;
    const result = Object.freeze({
      proof: source.origin.proof,
      createReceipt: source.origin.receipt,
      state: current.candidate.state,
      mode,
      absent: freeze(absent),
      remaining: freeze(remaining),
      executionAuthorized: false as const,
      requiresNewReviewedPlan:
        mode === 'partial-replan-required' ||
        (mode === 'planned-destroy' && Boolean(review && Date.now() - Date.parse(review.review.createdAt) >= 300000)),
      assertOriginal,
      close,
    });
    returned = true;
    return result;
  } finally {
    try {
      await release?.();
    } finally {
      if (!returned) {
        current?.monitor.close();
        reviewMonitor?.close();
        source.close();
      }
    }
  }
}
