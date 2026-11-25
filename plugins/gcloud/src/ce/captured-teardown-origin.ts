import { dirname, join } from 'node:path';
import { decodeEvidenceObject } from '../../../terraform/src/evidence-json';
import { readOwnedInstalledInput } from '../../../terraform/src/installed-runtime';
import {
  assertSameOriginalInput,
  monitorOriginalInputs,
  type OriginalInputBinding,
} from '../../../terraform/src/original-input-monitor';
import type { CaptureCleanupRecovery, PlanReceipt } from '../../../terraform/src/runner';
import { type GcpCaptureCleanupResumeInput, resumeGcpCaptureCleanupOrigin } from './capture-cleanup-durable';
import { fingerprint } from './discovery';
import { GCP_TERRAFORM_OBSERVER_IMAGE } from './observer-scope';
import { publicTerraformContextHash } from './terraform-context';
import { type PublicTerraformOwnership, publicTerraformAddresses } from './terraform-public-ownership';
import type { GcpCeIntent } from './types';

export interface GcpCapturedSourceAuthorization {
  readonly schemaVersion: 1;
  readonly kind: 'captured-source-qualification';
  readonly planHash: string;
  readonly receiptFingerprint: string;
  readonly intentFingerprint: string;
  readonly originSha256: string;
  readonly authorizationSha256: string;
  readonly reviewSha256: string;
}
export interface GcpCapturedTeardownOrigin {
  readonly schemaVersion: 1;
  readonly kind: 'captured-gcp-teardown-origin';
  readonly executionAuthorized: false;
  readonly recovery: CaptureCleanupRecovery;
  close(): void;
}
interface BoundOrigin {
  readonly intent: string;
  readonly contextHash: string;
  readonly original: GcpCapturedSourceAuthorization;
  readonly owned: PublicTerraformOwnership;
  assertOriginal(): Promise<void>;
}
const issued = new WeakMap<GcpCapturedTeardownOrigin, BoundOrigin>();

/** Link actual source-campaign authorization to independently recovered original
 * ownership. This never creates or rewrites public deployment authorization,
 * and it grants no teardown execution authority. */
export async function openGcpCapturedTeardownOrigin(
  input: GcpCaptureCleanupResumeInput & {
    readonly source: Readonly<Record<'authorization' | 'review' | 'identity' | 'terminal', OriginalInputBinding>>;
  },
  signal?: AbortSignal,
): Promise<GcpCapturedTeardownOrigin> {
  const intent = structuredClone(input.intent),
    source = structuredClone(input.source);
  const environment = { ...input.environment },
    reference = structuredClone(input.reference);
  const contextHash = publicTerraformContextHash(intent, environment.XCSH_API_URL);
  const names = ['authorization', 'identity', 'review', 'terminal'];
  if (
    intent.schemaVersion !== 2 ||
    intent.engine !== 'terraform' ||
    Object.keys(source).sort().join(',') !== names.join(',')
  )
    throw new Error('Original captured GCP source evidence required');
  const directory = dirname(source.authorization.path);
  if (
    source.authorization.path !== join(directory, 'qualification-authorization.private.json') ||
    source.identity.path !== join(directory, 'worker-identity.private.json') ||
    source.terminal.path !== join(directory, 'worker-terminal.private.json') ||
    source.review.path !== join(directory, 'fresh-review', 'review.private.json') ||
    Object.values(source).some((row) => (Number(row.expectedIdentity?.mode) & 0o777) !== 0o400)
  )
    throw new Error('Original source worker evidence paths or private modes differ');
  const monitor = await monitorOriginalInputs(source);
  let resumed: Awaited<ReturnType<typeof resumeGcpCaptureCleanupOrigin>> | undefined;
  let closed = false,
    returned = false;
  const close = () => {
    closed = true;
    monitor.close();
    resumed?.close();
  };
  try {
    const read = async (name: keyof typeof source) => {
      const value = await readOwnedInstalledInput(source[name].path, 1048576);
      assertSameOriginalInput(source[name], value.binding);
      return decodeEvidenceObject(value.bytes);
    };
    const authorization = await read('authorization'),
      review = await read('review');
    const identity = await read('identity'),
      terminal = await read('terminal');
    const owner = {
      provider: 'gcp',
      engine: 'terraform',
      account: intent.project,
      region: intent.region,
      deploymentId: intent.deploymentName,
    };
    const timestamp = (value: unknown): value is number =>
      typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
    if (
      authorization.kind !== 'user-authorized-source-gcp-qualification' ||
      (authorization.schemaVersion !== undefined && authorization.schemaVersion !== 1) ||
      [authorization.owner, review.owner, identity.owner].some((value) => fingerprint(value) !== fingerprint(owner)) ||
      authorization.reviewSha256 !== source.review.sha256 ||
      review.resourceCount !== 21 ||
      authorization.resourceCount !== 21 ||
      review.campaignKeysBound !== true ||
      review.creationReviewed !== true ||
      review.executionAuthorized !== false ||
      review.ceImageId !== intent.image.id ||
      authorization.ceImageId !== intent.image.id ||
      review.observerImageId !== GCP_TERRAFORM_OBSERVER_IMAGE.id ||
      authorization.observerImageId !== GCP_TERRAFORM_OBSERVER_IMAGE.id ||
      !Array.isArray(review.absences) ||
      review.absences.length !== 21 ||
      fingerprint(review.absences.map((row) => (row as Record<string, unknown>).address).sort()) !==
        fingerprint(publicTerraformAddresses(intent).sort()) ||
      review.absences.some((row) => (row as Record<string, unknown>).present !== false) ||
      !timestamp(identity.startedAt) ||
      !timestamp(review.reviewBegan) ||
      !timestamp(review.reviewedAt) ||
      !timestamp(authorization.createdAt) ||
      !timestamp(terminal.finishedAt) ||
      identity.startedAt > review.reviewBegan ||
      review.reviewBegan > review.reviewedAt ||
      review.reviewedAt > authorization.createdAt ||
      authorization.createdAt - review.reviewedAt >= 300000 ||
      authorization.createdAt > terminal.finishedAt ||
      terminal.finishedAt > Date.now() + 5000 ||
      terminal.applyAttempted !== true
    )
      throw new Error('Original captured source authorization or reviewed campaign evidence differs');
    await monitor.assertOriginal();
    resumed = await resumeGcpCaptureCleanupOrigin({ ...input, intent, environment, reference }, signal);
    const receipt: PlanReceipt = resumed.createReceipt;
    if (
      authorization.planSha256 !== receipt.planSha256 ||
      review.planSha256 !== receipt.planSha256 ||
      identity.planSha256 !== receipt.planSha256 ||
      authorization.configurationSha256 !== receipt.configurationSha256 ||
      review.configurationSha256 !== receipt.configurationSha256 ||
      authorization.providerLockSha256 !== receipt.providerLockSha256 ||
      review.providerLockSha256 !== receipt.providerLockSha256 ||
      review.backendIdentity !== receipt.backendIdentity ||
      resumed.ownership.receiptFingerprint !== fingerprint(receipt)
    )
      throw new Error('Original captured source authorization and durable create receipt differ');
    const original: GcpCapturedSourceAuthorization = Object.freeze({
      schemaVersion: 1,
      kind: 'captured-source-qualification',
      planHash: `sha256:${source.authorization.sha256}`,
      receiptFingerprint: fingerprint(receipt),
      intentFingerprint: fingerprint(intent),
      originSha256: reference.binding.sha256,
      authorizationSha256: source.authorization.sha256,
      reviewSha256: source.review.sha256,
    });
    const assertOriginal = async () => {
      if (closed) throw new Error('Original captured teardown source is retired');
      await monitor.assertOriginal();
      await resumed?.recovery.assertIndependentClosure();
      await monitor.assertOriginal();
      if (closed) throw new Error('Original captured teardown source retired during inspection');
    };
    await assertOriginal();
    const value: GcpCapturedTeardownOrigin = Object.freeze({
      schemaVersion: 1,
      kind: 'captured-gcp-teardown-origin',
      executionAuthorized: false,
      recovery: resumed.recovery,
      close,
    });
    issued.set(value, { intent: fingerprint(intent), contextHash, original, owned: resumed.ownership, assertOriginal });
    returned = true;
    return value;
  } finally {
    if (!returned) close();
  }
}

export async function readGcpCapturedTeardownOrigin(value: GcpCapturedTeardownOrigin, intent: GcpCeIntent) {
  const original = issued.get(value);
  if (!original || original.intent !== fingerprint(intent))
    throw new Error('Source-issued original captured teardown capability required');
  await original.assertOriginal();
  return Object.freeze({ original: original.original, owned: original.owned, contextHash: original.contextHash });
}
