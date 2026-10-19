import { join } from 'node:path';
import { acquireProcessLock } from '../../../platform/src/ce/process-lock';
import type { PlanReceipt } from '../../../terraform/src/runner';
import type { GcpCeContractBoundary } from './contract';
import {
  assertGcpTeardownPolicyFresh,
  assertGcpTeardownProfile,
  observeGcpTeardownResource,
} from './deployment-teardown';
import { fingerprint } from './discovery';
import type { GcpPolicyReceipt } from './policy';
import { type PublicTerraformJournal, readOptional } from './terraform-public';
import {
  type PublicTerraformOwnership,
  publicTerraformAddresses,
  publicTerraformCloudScope,
  publicTerraformSelections,
} from './terraform-public-ownership';
import { assertGcpTerraformOwnedTransition, type GcpTerraformTeardownRuntime } from './terraform-teardown';
import type { GcpCeIntent } from './types';

/** Observes all eight possible identities, including objects absent from a partial owning subset. */
export async function verifyPublicTerraformLiveOwnership(
  runtime: GcpTerraformTeardownRuntime,
  intent: GcpCeIntent,
  owned: PublicTerraformOwnership,
  signal?: AbortSignal,
  allowAbsent = true,
) {
  if (
    owned.schemaVersion !== 2 ||
    owned.intentFingerprint !== fingerprint(intent) ||
    new Set(owned.addresses).size !== owned.addresses.length ||
    owned.addresses.some((a) => !publicTerraformAddresses(intent).includes(a))
  )
    throw new Error('Original Terraform ownership binding differs');
  const absent: string[] = [];
  const addresses = publicTerraformAddresses(intent),
    scope = publicTerraformCloudScope(intent);
  for (let n = 0; n < scope.length; n++) {
    const original = owned.resources.find((resource) => resource.selfLink === scope[n].selfLink);
    const live = await observeGcpTeardownResource(runtime.api, scope[n], signal);
    if (live ? !original || original.id !== live.id || original.selfLink !== live.selfLink : !!original && !allowAbsent)
      throw new Error('Original cloud identity replaced or unavailable');
    if (!live) absent.push(addresses[n]);
  }
  const observation = await runtime.observePlatform(
    intent.sites[0].name,
    `${intent.sites[0].nodes[0].name}-token`,
    signal,
  );
  if (
    observation.siteName !== intent.sites[0].name ||
    observation.tokenName !== `${intent.sites[0].nodes[0].name}-token` ||
    typeof observation.siteAbsent !== 'boolean' ||
    typeof observation.tokenAbsent !== 'boolean'
  )
    throw new Error('Scoped Platform observation differs');
  for (const [address, isAbsent, hash] of [
    [addresses[6], observation.siteAbsent, observation.siteIdentitySha256],
    [addresses[7], observation.tokenAbsent, observation.tokenIdentitySha256],
  ] as const) {
    if (
      isAbsent
        ? !!owned.platform[address] && !allowAbsent
        : !owned.platform[address] || hash !== owned.platform[address]
    )
      throw new Error('Original XC identity replaced or unavailable');
    if (isAbsent) absent.push(address);
  }
  return absent;
}
async function stableState(runtime: GcpTerraformTeardownRuntime) {
  if (!runtime.session.readStateIdentity) throw new Error('Stable owning state binding unavailable');
  return runtime.session.readStateIdentity();
}
async function ownership(runtime: GcpTerraformTeardownRuntime, intent: GcpCeIntent) {
  const original = (await runtime.store.read('gcp-tf-deploy-original-authorization.json')) as {
    planHash: string;
    receiptFingerprint: string;
    intentFingerprint: string;
  };
  const owned = (await runtime.store.read('gcp-tf-public-ownership.json')) as PublicTerraformOwnership;
  const journal = (await runtime.store.read('gcp-tf-public-deployment.json')) as PublicTerraformJournal;
  if (
    original.intentFingerprint !== fingerprint(intent) ||
    owned.intentFingerprint !== fingerprint(intent) ||
    owned.receiptFingerprint !== original.receiptFingerprint ||
    journal.planHash !== original.planHash ||
    journal.receiptFingerprint !== original.receiptFingerprint ||
    !['completed', 'partial'].includes(journal.phase)
  )
    throw new Error('Reconciled original creation subset required for cleanup');
  return { original, owned };
}
function assertDeleteOnly(intent: GcpCeIntent, receipt: PlanReceipt, addresses: string[]) {
  if (!addresses.length) {
    if (
      !receipt.noChanges ||
      receipt.changes.length ||
      receipt.operation !== 'destroy' ||
      receipt.actionInvocations?.length
    )
      throw new Error('Expected empty destroy plan');
  } else assertGcpTerraformOwnedTransition(intent, receipt, 'teardown', addresses);
}
function assertFinalDestroy(intent: GcpCeIntent, original: PlanReceipt, final: PlanReceipt) {
  assertDeleteOnly(intent, final, []);
  if (
    final.engine !== 'terraform' ||
    final.deploymentId !== intent.deploymentName ||
    final.backendIdentity !== original.backendIdentity ||
    final.configurationSha256 !== original.configurationSha256 ||
    final.providerLockSha256 !== original.providerLockSha256
  )
    throw new Error('Final empty destroy ownership binding differs');
}
async function projectDestroy(
  runtime: GcpTerraformTeardownRuntime,
  intent: GcpCeIntent,
  receipt: PlanReceipt,
  owned: PublicTerraformOwnership,
  absent: string[],
  signal?: AbortSignal,
) {
  const selections = publicTerraformSelections(intent);
  const fields = await runtime.session.readPlannedResourceFields(receipt, selections, runtime.environment, signal);
  if (fingerprint(Object.keys(fields).sort()) !== fingerprint(Object.keys(selections).sort()))
    throw new Error('Destroy projection escaped owning configuration');
  const remaining: string[] = [];
  for (const [address, value] of Object.entries(fields)) {
    if (!value) {
      if (!absent.includes(address)) throw new Error('Live object is missing from owning state');
      continue;
    }
    if (
      absent.includes(address) ||
      !owned.addresses.includes(address) ||
      fingerprint(Object.keys(value).sort()) !== fingerprint(selections[address].slice().sort())
    )
      throw new Error('Destroy projection contains absent, foreign or sensitive identity');
    if (address.startsWith('xcsh_')) {
      if (
        value.creation_identity_sha256 !== owned.platform[address] ||
        value.namespace !== 'system' ||
        value.name !==
          (address.startsWith('xcsh_token.') ? `${intent.sites[0].nodes[0].name}-token` : intent.sites[0].name)
      )
        throw new Error('Destroy XC original identity differs');
    } else {
      const resource = owned.resources.find((r) => r.selfLink === value.self_link);
      const field = address.startsWith('google_compute_instance.')
        ? 'instance_id'
        : address.startsWith('google_compute_disk.')
          ? 'disk_id'
          : address.startsWith('google_compute_network.')
            ? 'numeric_id'
            : 'subnetwork_id';
      if (
        !resource ||
        String(value[field]) !== resource.id ||
        value.project !== intent.project ||
        value.name !== resource.selfLink.split('/').at(-1)
      )
        throw new Error('Destroy cloud original identity differs');
    }
    remaining.push(address);
  }
  assertDeleteOnly(intent, receipt, remaining);
  return { remaining, projectionHash: fingerprint(fields) };
}
export async function planPublicTerraformTeardown(
  runtime: GcpTerraformTeardownRuntime,
  intent: GcpCeIntent,
  contract: GcpCeContractBoundary,
  policy: GcpPolicyReceipt,
  signal?: AbortSignal,
) {
  assertGcpTeardownProfile(intent, contract, 'terraform');
  assertGcpTeardownPolicyFresh(policy);
  const release = await acquireProcessLock(join(runtime.store.directory, '.gcp-deployment-lock'));
  try {
    const { original, owned } = await ownership(runtime, intent);
    const absent = await verifyPublicTerraformLiveOwnership(runtime, intent, owned, signal);
    // The runner proves its executor stopped and archives the original attempt before replacing artifacts.
    const before = await stableState(runtime);
    if (before.lineage !== owned.state.lineage || before.serial < owned.state.serial)
      throw new Error('Foreign or rolled-back cleanup state');
    const receipt = await runtime.session.planDestroy(runtime.environment, signal);
    const projection = await projectDestroy(runtime, intent, receipt, owned, absent, signal);
    const state = await stableState(runtime);
    if (state.lineage !== before.lineage || state.serial < before.serial)
      throw new Error('Cleanup state lineage changed');
    const body = {
      schemaVersion: 2 as const,
      operation: 'teardown' as const,
      engine: 'terraform' as const,
      intentFingerprint: fingerprint(intent),
      apiRelease: contract.release,
      policyReceipt: policy,
      originalAuthorization: original,
      ownershipHash: fingerprint(owned),
      state,
      savedPlan: receipt,
      ...projection,
      createdAt: new Date().toISOString(),
    };
    const plan = { ...body, planHash: fingerprint(body) };
    await runtime.store.write(`gcp-tf-public-cleanup-reviewed-${plan.planHash.slice(7)}.json`, plan);
    return plan;
  } finally {
    await release();
  }
}
export type PublicTerraformCleanupReview = Awaited<ReturnType<typeof planPublicTerraformTeardown>>;
export async function applyPublicTerraformTeardown(
  runtime: GcpTerraformTeardownRuntime,
  intent: GcpCeIntent,
  contract: GcpCeContractBoundary,
  policy: GcpPolicyReceipt,
  approvedHash: string,
  signal?: AbortSignal,
  onMutation?: () => void,
) {
  assertGcpTeardownProfile(intent, contract, 'terraform');
  assertGcpTeardownPolicyFresh(policy);
  if (!/^sha256:[a-f0-9]{64}$/.test(approvedHash)) throw new Error('Exact cleanup review required');
  const release = await acquireProcessLock(join(runtime.store.directory, '.gcp-deployment-lock'));
  try {
    const plan = (await runtime.store.read(
      `gcp-tf-public-cleanup-reviewed-${approvedHash.slice(7)}.json`,
    )) as PublicTerraformCleanupReview;
    const { planHash, ...body } = plan;
    if (
      plan.schemaVersion !== 2 ||
      plan.operation !== 'teardown' ||
      plan.engine !== 'terraform' ||
      planHash !== approvedHash ||
      fingerprint(body) !== approvedHash ||
      plan.intentFingerprint !== fingerprint(intent) ||
      fingerprint(plan.apiRelease) !== fingerprint(contract.release) ||
      plan.policyReceipt.normalizedSha256 !== policy.normalizedSha256
    )
      throw new Error('Reviewed cleanup binding changed');
    const { original, owned } = await ownership(runtime, intent);
    if (fingerprint(original) !== fingerprint(plan.originalAuthorization) || fingerprint(owned) !== plan.ownershipHash)
      throw new Error('Original cleanup attempt changed');
    const name = `gcp-tf-public-cleanup-authorized-${approvedHash.slice(7)}.json`;
    let journal = await readOptional<{
      planHash: string;
      phase: 'authorized' | 'submitting' | 'applied' | 'absent';
      finalPlan?: PlanReceipt;
      finalState?: Awaited<ReturnType<typeof stableState>>;
    }>(runtime, name);
    if (
      journal &&
      (journal.planHash !== approvedHash || !['authorized', 'submitting', 'applied', 'absent'].includes(journal.phase))
    )
      throw new Error('Cleanup authorization changed');
    let absent = await verifyPublicTerraformLiveOwnership(runtime, intent, owned, signal);
    if (!journal) {
      const age = Date.now() - Date.parse(plan.createdAt);
      if (!Number.isFinite(age) || age < 0 || age > 300_000) throw new Error('Initial cleanup review is stale');
      if (fingerprint(await stableState(runtime)) !== fingerprint(plan.state))
        throw new Error('Reviewed stable cleanup state changed');
      const projection = await projectDestroy(runtime, intent, plan.savedPlan, owned, absent, signal);
      if (
        projection.projectionHash !== plan.projectionHash ||
        fingerprint(projection.remaining) !== fingerprint(plan.remaining)
      )
        throw new Error('Reviewed delete projection changed');
      journal = { planHash: approvedHash, phase: 'authorized' };
      await runtime.store.write(name, journal);
    }
    if (['authorized', 'submitting'].includes(journal.phase)) {
      if (plan.remaining.length) {
        if (!runtime.session.readApplyCheckpoint) throw new Error('Executor/checkpoint inspection unavailable');
        const checkpoint = await runtime.session.readApplyCheckpoint(plan.savedPlan);
        if (checkpoint.state === 'planned') {
          if (fingerprint(await stableState(runtime)) !== fingerprint(plan.state))
            throw new Error('Authorized cleanup state changed before submission');
          journal.phase = 'submitting';
          await runtime.store.write(name, journal);
          signal?.throwIfAborted();
          onMutation?.();
          try {
            await runtime.session.apply(plan.savedPlan, runtime.environment, signal);
          } catch {
            signal?.throwIfAborted();
          }
        }
      }
      absent = await verifyPublicTerraformLiveOwnership(runtime, intent, owned, signal);
      if (absent.length !== 8)
        return {
          state: 'reconciliation-required',
          phase: 'partial-cleanup',
          planHash: approvedHash,
          engine: 'terraform',
          reconciliation: 'new-delete-only-review-required',
        };
      if (plan.remaining.length) {
        const checkpoint = await runtime.session.readApplyCheckpoint?.(plan.savedPlan);
        if (!checkpoint) throw new Error('Original cleanup checkpoint unavailable');
        if (checkpoint.state === 'applying')
          await runtime.session.reconcileApplyFromEvidence(
            plan.savedPlan,
            fingerprint({ planHash: approvedHash, absent }).slice(7),
          );
        else if (checkpoint.state !== 'applied') throw new Error('Unsubmitted cleanup cannot be attested');
      }
      journal.phase = 'applied';
      await runtime.store.write(name, journal);
    }
    if (absent.length !== 8) throw new Error('Resources reappeared after cleanup');
    if (journal.phase !== 'absent') {
      const before = await stableState(runtime);
      const finalPlan = await runtime.session.planDestroy(runtime.environment, signal);
      assertFinalDestroy(intent, plan.savedPlan, finalPlan);
      const finalState = await stableState(runtime);
      if (fingerprint(before) !== fingerprint(finalState))
        throw new Error('Final empty destroy state changed during verification');
      const after = await verifyPublicTerraformLiveOwnership(runtime, intent, owned, signal);
      if (after.length !== 8) throw new Error('Independent absence changed');
      journal = { ...journal, phase: 'absent', finalPlan, finalState };
      await runtime.store.write(name, journal);
    }
    if (!journal.finalPlan) throw new Error('Final empty destroy receipt unavailable');
    assertFinalDestroy(intent, plan.savedPlan, journal.finalPlan);
    if (!journal.finalState || fingerprint(journal.finalState) !== fingerprint(await stableState(runtime)))
      throw new Error('Final empty destroy state binding changed');
    return {
      schemaVersion: 2,
      engine: 'terraform',
      state: 'done',
      phase: 'independent-absence',
      planHash: approvedHash,
      absentObjects: absent.length,
      finalPlanSha256: journal.finalPlan?.planSha256,
    };
  } finally {
    await release();
  }
}
