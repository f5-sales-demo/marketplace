import type { PlanReceipt } from '../../../terraform/src/runner';
import {
  type GcpAppliedSourceCleanupResumeInput,
  inspectGcpAppliedSourceCleanupResume,
} from './applied-source-cleanup-durable';
import { fingerprint } from './discovery';
import {
  assertSuccessfulGcpSourceTerminal,
  type GcpSourceCampaignInputs,
  openGcpSourceCampaignEvidence,
} from './source-campaign-evidence';
import { publicTerraformContextHash } from './terraform-context';
import {
  inspectPublicTerraformOwnership,
  type PublicTerraformOwnership,
  publicTerraformAddresses,
} from './terraform-public-ownership';
import { assertGcpTerraformOwnedTransition, type GcpTerraformTeardownRuntime } from './terraform-teardown';
import type { GcpCeIntent } from './types';

export interface GcpAppliedSourceTeardownOrigin {
  readonly schemaVersion: 1;
  readonly kind: 'applied-source-gcp-teardown-origin';
  readonly executionAuthorized: false;
  close(): void;
}
interface AppliedSourceAuthorization {
  readonly schemaVersion: 1;
  readonly kind: 'applied-source-qualification';
  readonly planHash: string;
  readonly receiptFingerprint: string;
  readonly intentFingerprint: string;
  readonly originSha256: string;
  readonly authorizationSha256: string;
  readonly reviewSha256: string;
}
interface BoundOrigin {
  readonly intent: string;
  readonly contextHash: string;
  readonly original: AppliedSourceAuthorization;
  readonly owned: PublicTerraformOwnership;
  assertOriginal(): Promise<void>;
}
const issued = new WeakMap<GcpAppliedSourceTeardownOrigin, BoundOrigin>();
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

/** Join a successful original source campaign to the shared applied receipt and
 * independently observed ownership. No failed capture flags, public deployment
 * journals, replay or delete authority are created by this capability. */
export async function openGcpAppliedSourceTeardownOrigin(
  input: {
    readonly intent: GcpCeIntent;
    readonly source: GcpSourceCampaignInputs;
    readonly receipt: PlanReceipt;
    readonly runtime: GcpTerraformTeardownRuntime;
    assertIndependentClosure(): Promise<void>;
  },
  signal?: AbortSignal,
): Promise<GcpAppliedSourceTeardownOrigin> {
  const intent = structuredClone(input.intent),
    receipt = structuredClone(input.receipt),
    source = structuredClone(input.source);
  const runtime = input.runtime,
    environment = runtime.environment;
  const assertApplied = runtime.session.assertApplied?.bind(runtime.session),
    readState = runtime.session.readStateIdentity?.bind(runtime.session),
    readFields = runtime.session.readApplyAttemptResourceFields?.bind(runtime.session);
  const assertIndependentClosure = input.assertIndependentClosure.bind(input);
  if (
    intent.schemaVersion !== 2 ||
    intent.engine !== 'terraform' ||
    !assertApplied ||
    !readState ||
    !readFields ||
    typeof input.assertIndependentClosure !== 'function' ||
    runtime.capturedTeardownOrigin ||
    runtime.appliedSourceTeardownOrigin
  )
    throw new Error('Original successful source scope and shared applied inspection required');
  const contextHash = publicTerraformContextHash(intent, environment.XCSH_API_URL);
  assertGcpTerraformOwnedTransition(intent, receipt, 'deploy', publicTerraformAddresses(intent));
  const observation = {
    api: runtime.api,
    observePlatform: runtime.observePlatform.bind(runtime),
    environment,
    session: { readApplyAttemptResourceFields: readFields },
  };
  const evidence = await openGcpSourceCampaignEvidence({ intent, source });
  let closed = false,
    returned = false;
  let refusal: unknown;
  const close = () => {
    closed = true;
    evidence.close();
  };
  const guard = async () => {
    if (closed) throw new Error('Original applied source teardown is retired');
    if (refusal) throw refusal;
    try {
      signal?.throwIfAborted();
      await evidence.assertOriginal();
      if (publicTerraformContextHash(intent, environment.XCSH_API_URL) !== contextHash)
        throw new Error('Original applied source context changed');
      await assertIndependentClosure();
      await evidence.assertOriginal();
      if (
        runtime.environment !== environment ||
        publicTerraformContextHash(intent, environment.XCSH_API_URL) !== contextHash
      )
        throw new Error('Original applied source environment or context changed during closure');
      signal?.throwIfAborted();
      if (closed) throw new Error('Original applied source teardown retired during inspection');
    } catch (error) {
      refusal = error;
      throw error;
    }
  };
  try {
    assertSuccessfulGcpSourceTerminal(evidence.terminal);
    await guard();
    await evidence.assertReceipt(receipt);
    await assertApplied(receipt);
    await guard();
    const state = await readState();
    const owned = await inspectPublicTerraformOwnership(observation, intent, receipt, signal);
    await guard();
    await assertApplied(receipt);
    if (
      !owned.complete ||
      fingerprint(owned.state) !== fingerprint(state) ||
      fingerprint(await readState()) !== fingerprint(state)
    )
      throw new Error('Complete original applied ownership and stable state required');
    await guard();
    const original = freeze({
      schemaVersion: 1 as const,
      kind: 'applied-source-qualification' as const,
      planHash: `sha256:${evidence.authorizationSha256}`,
      receiptFingerprint: fingerprint(receipt),
      intentFingerprint: fingerprint(intent),
      originSha256: evidence.sourceHash.slice(7),
      authorizationSha256: evidence.authorizationSha256,
      reviewSha256: evidence.reviewSha256,
    });
    const value: GcpAppliedSourceTeardownOrigin = Object.freeze({
      schemaVersion: 1,
      kind: 'applied-source-gcp-teardown-origin',
      executionAuthorized: false,
      close,
    });
    issued.set(value, {
      intent: fingerprint(intent),
      contextHash,
      original,
      owned: freeze(structuredClone(owned)),
      assertOriginal: guard,
    });
    returned = true;
    return value;
  } finally {
    if (!returned) close();
  }
}

export async function readGcpAppliedSourceTeardownOrigin(value: GcpAppliedSourceTeardownOrigin, intent: GcpCeIntent) {
  const original = issued.get(value);
  if (!original || original.intent !== fingerprint(intent))
    throw new Error('Source-issued original applied teardown capability required');
  await original.assertOriginal();
  return Object.freeze({ original: original.original, owned: original.owned, contextHash: original.contextHash });
}

/** Reissue only a verified durable original; no create or destroy action is executed. */
export async function resumeGcpAppliedSourceTeardownOrigin(
  input: GcpAppliedSourceCleanupResumeInput,
  signal?: AbortSignal,
) {
  const resumed = await inspectGcpAppliedSourceCleanupResume(input, signal);
  const origin: GcpAppliedSourceTeardownOrigin = Object.freeze({
    schemaVersion: 1,
    kind: 'applied-source-gcp-teardown-origin',
    executionAuthorized: false,
    close: resumed.close,
  });
  issued.set(origin, {
    intent: fingerprint(input.intent),
    contextHash: resumed.proof.contextHash,
    original: resumed.proof.original,
    owned: resumed.proof.owned,
    assertOriginal: resumed.assertOriginal,
  });
  const { proof: _proof, assertOriginal: _assertOriginal, ...view } = resumed;
  return Object.freeze({ ...view, origin });
}
