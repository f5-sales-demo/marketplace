import { join } from 'node:path';
import { acquireProcessLock } from '../../../platform/src/ce/process-lock';
import type { CePlatformService } from '../../../platform/src/ce/service';
import type { PlanReceipt } from '../../../terraform/src/runner';
import type { GcpCeContractBoundary } from './contract';
import { collectGcpDeploymentPrerequisites, fundingBinding, type GcpDeploymentSources } from './deployment-review';
import { assertGcpTeardownProfile } from './deployment-teardown';
import { fingerprint } from './discovery';
import { recordGcpResource } from './ownership';
import { assertPublicTerraformContext } from './terraform-context';
import { assertGcpTerraformHaProfile, gcpDeploymentLifecycleFingerprint } from './terraform-ha-profile';
import {
  inspectPublicTerraformOwnership,
  type PublicTerraformOwnership,
  publicTerraformAddresses,
} from './terraform-public-ownership';
import { verifyPublicTerraformLiveOwnership } from './terraform-public-teardown';
import type { GcpTerraformInputs } from './terraform-session';
import { assertGcpTerraformOwnedTransition, type GcpTerraformTeardownRuntime } from './terraform-teardown';
import type { GcpCeIntent } from './types';

export async function readOptional<T>(runtime: GcpTerraformTeardownRuntime, name: string): Promise<T | undefined> {
  try {
    return (await runtime.store.read(name)) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}
async function sessionBinding(
  runtime: GcpTerraformTeardownRuntime,
  intent: GcpCeIntent,
  boundary: GcpCeContractBoundary,
) {
  const saved = (await runtime.store.read('gcp-terraform-session-inputs.json')) as {
    schemaVersion: number;
    inputs: GcpTerraformInputs;
  };
  const identity = (await runtime.store.read('gcp-terraform-input-identity.json')) as {
    intent: GcpCeIntent;
    intentFingerprint: string;
    platformContext: string;
    providerLockSha256: string;
  };
  if (
    saved.schemaVersion !== 1 ||
    saved.inputs?.configurationVersion !== 2 ||
    intent.engine !== 'terraform' ||
    fingerprint(saved.inputs.intent) !== fingerprint(intent) ||
    fingerprint(identity.intent) !== fingerprint(intent) ||
    identity.intentFingerprint !== fingerprint(intent) ||
    identity.platformContext !== intent.platformContext ||
    saved.inputs.expectedLockSha256 !== identity.providerLockSha256 ||
    !runtime.session.readConfigurationSha256
  )
    throw new Error('Original public Terraform input binding differs');
  if (intent.sites[0].nodes.length === 3) {
    const profile = assertGcpTerraformHaProfile(intent, boundary);
    if (
      fingerprint(saved.inputs.versions) !== fingerprint(profile.versions) ||
      saved.inputs.expectedLockSha256 !== profile.providerLockSha256
    )
      throw new Error('Qualified Terraform HA provider versions or lock differ');
  }
  return {
    platformContextHash: await assertPublicTerraformContext(runtime, intent),
    inputHash: fingerprint(saved),
    configurationSha256: await runtime.session.readConfigurationSha256(),
    providerLockSha256: saved.inputs.expectedLockSha256.slice(7),
    versions: saved.inputs.versions,
  };
}
export async function planPublicTerraformDeployment(
  runtime: GcpTerraformTeardownRuntime,
  platform: CePlatformService,
  intent: GcpCeIntent,
  sources: GcpDeploymentSources,
  signal?: AbortSignal,
) {
  intent = structuredClone(intent);
  const current = await collectGcpDeploymentPrerequisites(platform, intent, sources, signal, false, 'terraform');
  const release = await acquireProcessLock(join(runtime.store.directory, '.gcp-deployment-lock'));
  try {
    if (await readOptional(runtime, 'gcp-tf-deploy-original-authorization.json'))
      throw new Error('Deployment must resume its original authorization');
    await verifyPublicTerraformLiveOwnership(
      runtime,
      intent,
      {
        schemaVersion: 2,
        intentFingerprint: fingerprint(intent),
        receiptFingerprint: '',
        state: { sha256: '', lineage: '', serial: 0 },
        projectionHash: '',
        addresses: [],
        resources: [],
        platform: {},
        complete: false,
      },
      signal,
    );
    const binding = await sessionBinding(runtime, intent, current.boundary);
    const receipt = await runtime.session.plan(runtime.environment, signal);
    assertGcpTerraformOwnedTransition(intent, receipt, 'deploy', publicTerraformAddresses(intent));
    if (
      receipt.configurationSha256 !== binding.configurationSha256 ||
      receipt.providerLockSha256 !== binding.providerLockSha256
    )
      throw new Error('Saved-plan configuration/lock differs');
    const body = {
      schemaVersion: 2 as const,
      operation: 'deploy' as const,
      engine: 'terraform' as const,
      intentFingerprint: fingerprint(intent),
      platformContext: intent.platformContext,
      apiRelease: current.boundary.release,
      contractFingerprint: current.boundary.fingerprint,
      lifecycleFingerprint: gcpDeploymentLifecycleFingerprint(intent, current.boundary),
      ...(intent.sites[0].nodes.length === 3
        ? {
            operationalContractFingerprint: current.boundary.operationalHealthContract?.contractFingerprint,
            operationalQualificationFingerprint: current.boundary.operationalHealthContract?.qualificationFingerprint,
          }
        : {}),
      policyReceipt: current.policy,
      funding: fundingBinding(current.funding),
      byolAuthorizationHash: current.byol.authorizationHash,
      discoveryFingerprint: fingerprint(current.discovery),
      preflight: current.preflight,
      binding,
      savedPlan: receipt,
      createdAt: new Date().toISOString(),
      approval: 'required' as const,
    };
    const plan = { ...body, planHash: fingerprint(body) };
    await runtime.store.write(`gcp-tf-deploy-reviewed-${plan.planHash.slice(7)}.json`, plan);
    return plan;
  } finally {
    await release();
  }
}
export type PublicTerraformReview = Awaited<ReturnType<typeof planPublicTerraformDeployment>>;
export interface PublicTerraformJournal {
  schemaVersion: 2;
  planHash: string;
  receiptFingerprint: string;
  phase:
    | 'authorized'
    | 'submitting'
    | 'inspecting'
    | 'ownership-captured'
    | 'reconciling'
    | 'completed'
    | 'partial'
    | 'reconciliation-required';
  followUp?: PlanReceipt;
  finalState?: PublicTerraformOwnership['state'];
  completionReconciliation?: boolean;
}
function publicResult(journal: PublicTerraformJournal, ownership?: PublicTerraformOwnership) {
  const phase = journal.completionReconciliation ? 'reconciliation-required' : journal.phase;
  return {
    schemaVersion: 2,
    engine: 'terraform',
    planHash: journal.planHash,
    state: phase === 'completed' ? 'done' : phase === 'partial' ? 'partial' : 'reconciliation-required',
    phase,
    cloudProvisioning: phase === 'completed' ? 'created' : 'incomplete',
    ...(ownership ? { ownedObjects: ownership.addresses.length, ownershipHash: fingerprint(ownership) } : {}),
    ...(journal.followUp ? { finalPlanSha256: journal.followUp.planSha256 } : {}),
    registration: 'unknown',
    physicalInterfaceIdentity: 'unknown',
    platformHealth: 'unknown',
    routing: 'unknown',
    applicationTraffic: 'unknown',
    ...(phase === 'partial'
      ? { cleanup: 'separate-delete-only-review-required' }
      : phase !== 'completed'
        ? { reconciliation: 'original-attempt-inspection-required' }
        : {}),
  };
}
export function assertPublicTerraformNoChange(intent: GcpCeIntent, original: PlanReceipt, followUp: PlanReceipt) {
  if (
    !followUp.noChanges ||
    followUp.engine !== 'terraform' ||
    followUp.deploymentId !== intent.deploymentName ||
    followUp.backendIdentity !== original.backendIdentity ||
    followUp.configurationSha256 !== original.configurationSha256 ||
    followUp.providerLockSha256 !== original.providerLockSha256 ||
    followUp.operation ||
    followUp.actionInvocations?.length ||
    followUp.changes.some((c) => c.actions.join(',') !== 'no-op') ||
    fingerprint(followUp.changes.map((c) => c.address).sort()) !== fingerprint(publicTerraformAddresses(intent).sort())
  )
    throw new Error('Follow-up Terraform plan is not an exact no-op');
}
export async function applyPublicTerraformDeployment(
  runtime: GcpTerraformTeardownRuntime,
  platform: CePlatformService,
  intent: GcpCeIntent,
  approvedHash: string,
  sources: GcpDeploymentSources,
  signal?: AbortSignal,
  onMutation?: () => void,
) {
  intent = structuredClone(intent);
  signal?.throwIfAborted();
  if (!/^sha256:[a-f0-9]{64}$/.test(approvedHash)) throw new Error('Exact Terraform deployment review required');
  const boundary = await sources.contract(signal);
  assertGcpTeardownProfile(intent, boundary, 'terraform');
  const release = await acquireProcessLock(join(runtime.store.directory, '.gcp-deployment-lock'));
  try {
    const plan = (await runtime.store.read(
      `gcp-tf-deploy-reviewed-${approvedHash.slice(7)}.json`,
    )) as PublicTerraformReview;
    const { planHash, ...body } = plan;
    if (
      plan.schemaVersion !== 2 ||
      plan.engine !== 'terraform' ||
      plan.operation !== 'deploy' ||
      planHash !== approvedHash ||
      fingerprint(body) !== approvedHash ||
      plan.intentFingerprint !== fingerprint(intent) ||
      plan.platformContext !== intent.platformContext ||
      fingerprint(plan.apiRelease) !== fingerprint(boundary.release) ||
      plan.contractFingerprint !== boundary.fingerprint ||
      plan.lifecycleFingerprint !== gcpDeploymentLifecycleFingerprint(intent, boundary) ||
      plan.operationalContractFingerprint !==
        (intent.sites[0].nodes.length === 3 ? boundary.operationalHealthContract?.contractFingerprint : undefined) ||
      plan.operationalQualificationFingerprint !==
        (intent.sites[0].nodes.length === 3
          ? boundary.operationalHealthContract?.qualificationFingerprint
          : undefined) ||
      fingerprint(plan.binding) !== fingerprint(await sessionBinding(runtime, intent, boundary))
    )
      throw new Error('Reviewed Terraform deployment bindings changed');
    assertGcpTerraformOwnedTransition(intent, plan.savedPlan, 'deploy', publicTerraformAddresses(intent));
    const original = await readOptional<{ planHash: string; receiptFingerprint: string; intentFingerprint: string }>(
      runtime,
      'gcp-tf-deploy-original-authorization.json',
    );
    const authorization = {
      planHash: approvedHash,
      receiptFingerprint: fingerprint(plan.savedPlan),
      intentFingerprint: fingerprint(intent),
    };
    if (original && fingerprint(original) !== fingerprint(authorization))
      throw new Error('Original Terraform authorization differs');
    let journal = await readOptional<PublicTerraformJournal>(runtime, 'gcp-tf-public-deployment.json');
    if (
      journal &&
      (!original ||
        journal.schemaVersion !== 2 ||
        journal.planHash !== approvedHash ||
        journal.receiptFingerprint !== authorization.receiptFingerprint)
    )
      throw new Error('Original Terraform deployment journal differs');
    if (
      plan.savedPlan.configurationSha256 !== plan.binding.configurationSha256 ||
      plan.savedPlan.providerLockSha256 !== plan.binding.providerLockSha256
    )
      throw new Error('Reviewed saved binary bindings differ');
    if (!original) {
      if (
        !runtime.session.readApplyCheckpoint ||
        (await runtime.session.readApplyCheckpoint(plan.savedPlan)).state !== 'planned'
      )
        throw new Error('Initial saved plan is not unsubmitted');
    }
    if (!original) {
      const age = Date.now() - Date.parse(plan.createdAt);
      if (!Number.isFinite(age) || age < 0 || age > 300_000) throw new Error('Initial Terraform review is stale');
    }
    const current = await collectGcpDeploymentPrerequisites(platform, intent, sources, signal, !!original, 'terraform');
    if (
      current.policy.normalizedSha256 !== plan.policyReceipt.normalizedSha256 ||
      fingerprint(fundingBinding(current.funding)) !== fingerprint(plan.funding) ||
      current.byol.authorizationHash !== plan.byolAuthorizationHash ||
      current.boundary.fingerprint !== plan.contractFingerprint ||
      gcpDeploymentLifecycleFingerprint(intent, current.boundary) !== plan.lifecycleFingerprint
    )
      throw new Error('Reviewed prerequisites/funding/BYOL changed');
    signal?.throwIfAborted();
    if (!original) {
      const age = Date.now() - Date.parse(plan.createdAt);
      if (!Number.isFinite(age) || age < 0 || age > 300_000)
        throw new Error('Initial Terraform review expired during qualification');
      await runtime.store.write('gcp-tf-deploy-original-authorization.json', authorization);
    }
    journal ??= {
      schemaVersion: 2,
      planHash: approvedHash,
      receiptFingerprint: authorization.receiptFingerprint,
      phase: 'authorized',
    };
    await runtime.store.write('gcp-tf-public-deployment.json', journal);
    let ownership = await readOptional<PublicTerraformOwnership>(runtime, 'gcp-tf-public-ownership.json');
    if (journal.phase === 'completed') {
      try {
        if (!ownership?.complete || !journal.followUp || !journal.finalState || !runtime.session.readStateIdentity)
          throw new Error('Completed Terraform evidence missing');
        assertPublicTerraformNoChange(intent, plan.savedPlan, journal.followUp);
        if (fingerprint(journal.finalState) !== fingerprint(await runtime.session.readStateIdentity()))
          throw new Error('Completed Terraform state binding changed');
        await verifyPublicTerraformLiveOwnership(runtime, intent, ownership, signal, false);
        delete journal.completionReconciliation;
      } catch {
        signal?.throwIfAborted();
        journal.completionReconciliation = true;
      }
      await runtime.store.write('gcp-tf-public-deployment.json', journal);
      return publicResult(journal, ownership);
    }
    try {
      if (journal.phase !== 'reconciling') {
        if (!runtime.session.readApplyCheckpoint)
          throw new Error('Original executor/checkpoint inspection unavailable');
        const checkpoint = await runtime.session.readApplyCheckpoint(plan.savedPlan);
        if (checkpoint.state === 'planned') {
          if (!['authorized', 'submitting'].includes(journal.phase))
            throw new Error('Consumed submission reverted to planned');
          journal.phase = 'submitting';
          await runtime.store.write('gcp-tf-public-deployment.json', journal);
          signal?.throwIfAborted();
          onMutation?.();
          try {
            await runtime.session.apply(plan.savedPlan, runtime.environment, signal);
          } catch {
            signal?.throwIfAborted();
          }
          const submitted = await runtime.session.readApplyCheckpoint(plan.savedPlan);
          if (submitted.state === 'planned') return publicResult(journal);
        }
        journal.phase = 'inspecting';
        await runtime.store.write('gcp-tf-public-deployment.json', journal);
        const inspected = await inspectPublicTerraformOwnership(runtime, intent, plan.savedPlan, signal);
        if (ownership && fingerprint(ownership) !== fingerprint(inspected))
          throw new Error('Original ownership snapshot changed');
        ownership = inspected;
        await runtime.store.write('gcp-tf-public-ownership.json', ownership);
        for (const resource of ownership.resources) await recordGcpResource(runtime.store, resource);
        if (!ownership.complete) {
          journal.phase = 'partial';
          await runtime.store.write('gcp-tf-public-deployment.json', journal);
          return publicResult(journal, ownership);
        }
        journal.phase = 'ownership-captured';
        await runtime.store.write('gcp-tf-public-deployment.json', journal);
        const applied = await runtime.session.readApplyCheckpoint(plan.savedPlan);
        if (applied.state === 'applying')
          await runtime.session.reconcileApplyFromEvidence(plan.savedPlan, fingerprint(ownership).slice(7));
        journal.phase = 'reconciling';
        await runtime.store.write('gcp-tf-public-deployment.json', journal);
      }
      if (!ownership?.complete) throw new Error('Complete ownership evidence required before follow-up');
      await verifyPublicTerraformLiveOwnership(runtime, intent, ownership, signal, false);
      if (!runtime.session.readStateIdentity) throw new Error('Stable owning state binding unavailable');
      const before = await runtime.session.readStateIdentity();
      if (before.lineage !== ownership.state.lineage || before.serial < ownership.state.serial)
        throw new Error('Foreign or rolled-back completion state');
      // Shared runner archives the original binary, receipt and inputs before this follow-up.
      journal.followUp = await runtime.session.plan(runtime.environment, signal);
      assertPublicTerraformNoChange(intent, plan.savedPlan, journal.followUp);
      const finalState = await runtime.session.readStateIdentity();
      if (fingerprint(before) !== fingerprint(finalState))
        throw new Error('Completion state changed during no-op verification');
      await verifyPublicTerraformLiveOwnership(runtime, intent, ownership, signal, false);
      journal.finalState = finalState;
      journal.phase = 'completed';
      await runtime.store.write('gcp-tf-public-deployment.json', journal);
      return publicResult(journal, ownership);
    } catch (_error) {
      signal?.throwIfAborted();
      if (journal.phase !== 'reconciling') journal.phase = 'reconciliation-required';
      await runtime.store.write('gcp-tf-public-deployment.json', journal);
      return publicResult(journal);
    }
  } finally {
    await release();
  }
}
