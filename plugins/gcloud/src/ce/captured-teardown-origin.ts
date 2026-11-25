import type { OriginalInputBinding } from '../../../terraform/src/original-input-monitor';
import type { CaptureCleanupRecovery, PlanReceipt } from '../../../terraform/src/runner';
import { type GcpCaptureCleanupResumeInput, resumeGcpCaptureCleanupOrigin } from './capture-cleanup-durable';
import { fingerprint } from './discovery';
import { openGcpSourceCampaignEvidence } from './source-campaign-evidence';
import { publicTerraformContextHash } from './terraform-context';
import type { PublicTerraformOwnership } from './terraform-public-ownership';
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
  const evidence = await openGcpSourceCampaignEvidence({ intent, source });
  let resumed: Awaited<ReturnType<typeof resumeGcpCaptureCleanupOrigin>> | undefined;
  let closed = false,
    returned = false;
  const close = () => {
    closed = true;
    evidence.close();
    resumed?.close();
  };
  try {
    resumed = await resumeGcpCaptureCleanupOrigin({ ...input, intent, environment, reference }, signal);
    const receipt: PlanReceipt = resumed.createReceipt;
    await evidence.assertReceipt(receipt);
    if (resumed.ownership.receiptFingerprint !== fingerprint(receipt))
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
      await evidence.assertOriginal();
      await resumed?.recovery.assertIndependentClosure();
      await evidence.assertOriginal();
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
