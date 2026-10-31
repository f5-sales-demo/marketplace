import { join } from 'node:path';
import type { CeOwner } from '../../platform/src/ce/runtime';
import type { CeEventBus, CePlatformService } from '../../platform/src/ce/service';
import {
  type AppliedResourceProjection,
  type ApplyAttemptResourceProjection,
  type ApplyCheckpoint,
  type CurrentResourcePlanSnapshot,
  type Deployment,
  type Executor,
  type NoChangeResourceProjection,
  type PlannedStateResourceProjection,
  type PlanReceipt,
  type TerraformActionIntent,
  TerraformRunner,
} from './runner';

export const TERRAFORM_SERVICE_CHANNEL = 'xcsh:ce-terraform:v1:service';
export interface TerraformSession {
  /** Optional on older installed runners; required before recording post-apply ownership. */
  readStateIdentity?(): Promise<{ sha256: string; lineage: string; serial: number }>;
  assertApplied?(receipt: PlanReceipt): Promise<void>;
  /** Current private configuration identity, used to reconcile an interrupted revision. */
  readConfigurationSha256?(): Promise<string>;
  /** Sensitive internal snapshot, bound to the caller's expected revision. */
  readConfiguration(expectedSha256: string): Promise<string>;
  /** Restricted ownership projection; explicit dotted paths must be nonsensitive. Array .length exports only count. */
  readPlannedResourceFields(
    receipt: PlanReceipt,
    selections: Record<string, string[]>,
    env: Record<string, string | undefined>,
    signal?: AbortSignal,
  ): Promise<Record<string, Record<string, unknown> | null>>;
  /** Optional for older installed runtimes; exact applied receipt and nonsensitive state identities required. */
  readAppliedResourceFields?(
    receipt: PlanReceipt,
    selections: Record<string, string[]>,
    env: Record<string, string | undefined>,
    signal?: AbortSignal,
  ): Promise<AppliedResourceProjection>;
  /** Restricted interrupted-attempt inspection; never permits resubmission or implies success. */
  readApplyAttemptResourceFields?(
    receipt: PlanReceipt,
    selections: Record<string, string[]>,
    env: Record<string, string | undefined>,
    signal?: AbortSignal,
  ): Promise<ApplyAttemptResourceProjection>;
  /** Optional on older runtimes; a planned no-change receipt and stable nonsensitive state are required. */
  readNoChangeResourceFields?(
    receipt: PlanReceipt,
    selections: Record<string, string[]>,
    env: Record<string, string | undefined>,
    signal?: AbortSignal,
  ): Promise<NoChangeResourceProjection>;
  /** Optional on older runtimes; inspects current state behind a resource-only planned receipt. */
  readPlannedStateResourceFields?(
    receipt: PlanReceipt,
    selections: Record<string, string[]>,
    env: Record<string, string | undefined>,
    signal?: AbortSignal,
  ): Promise<PlannedStateResourceProjection>;
  /** Recover a current unconsumed receipt only after saved binary inspection; never authorizes submission. */
  readCurrentResourcePlanReceipt?(
    env: Record<string, string | undefined>,
    signal?: AbortSignal,
  ): Promise<CurrentResourcePlanSnapshot>;
  readApplyCheckpoint?(receipt: PlanReceipt): Promise<ApplyCheckpoint>;
  readPlannedResourceIds(
    receipt: PlanReceipt,
    addresses: string[],
    env: Record<string, string | undefined>,
    signal?: AbortSignal,
  ): Promise<Record<string, string | null>>;
  readOutputs(
    names: string[],
    env: Record<string, string | undefined>,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>>;
  reviseConfiguration(expectedSha256: string, configuration: string): Promise<string>;
  /** Resolve an interrupted apply only after the cloud adapter persists exact outcome evidence. */
  reconcileApplyFromEvidence(receipt: PlanReceipt, evidenceSha256: string): Promise<void>;
  planDestroy(env: Record<string, string | undefined>, signal?: AbortSignal): Promise<PlanReceipt>;
  planAction(
    intent: TerraformActionIntent,
    env: Record<string, string | undefined>,
    signal?: AbortSignal,
  ): Promise<PlanReceipt>;
  plan(env: Record<string, string | undefined>, signal?: AbortSignal): Promise<PlanReceipt>;
  apply(receipt: PlanReceipt, env: Record<string, string | undefined>, signal?: AbortSignal): Promise<void>;
}
export interface CeTerraformService {
  open(owner: CeOwner, deployment: Deployment, resume: boolean | 'current'): Promise<TerraformSession>;
}
export interface CeTerraformServiceOptions {
  /** Trusted execution policy; the runner retains ownership, saved-plan and recovery checks. */
  readonly execute?: Executor;
}

/** Cloud adapters translate intent; the runner owns isolated execution and exact saved-plan application. */
export function createCeTerraformService(
  platform: () => Promise<CePlatformService>,
  options: CeTerraformServiceOptions = {},
): CeTerraformService {
  // Capture the policy once so mutation of the options object cannot redirect later sessions.
  const execute = options.execute;
  return {
    async open(owner, deployment, resume) {
      owner = structuredClone(owner);
      deployment = structuredClone(deployment);
      if (
        owner.engine !== 'terraform' ||
        deployment.engine !== 'terraform' ||
        owner.deploymentId !== deployment.deploymentId ||
        owner.provider !== deployment.scope.cloud ||
        owner.account !== deployment.scope.account ||
        owner.region !== deployment.scope.region
      )
        throw new Error('Terraform deployment and cloud ownership differ');
      const shared = await platform();
      const store = await shared.storage(owner);
      if (deployment.stage !== undefined && !/^[a-z][a-z0-9-]{0,62}$/.test(deployment.stage))
        throw new Error('Invalid Terraform stage identity');
      const runner = new TerraformRunner(
        deployment.stage ? join(store.directory, 'terraform-stages', deployment.stage) : store.directory,
        execute,
      );
      if (resume) await runner.resume(deployment.deploymentId, deployment, resume === 'current' ? 'current' : 'exact');
      else await runner.prepare(deployment);
      const checkOwner = async () => {
        await shared.storage(owner);
      };
      return {
        async readStateIdentity() {
          await checkOwner();
          return runner.readStateIdentity();
        },
        async assertApplied(receipt) {
          await checkOwner();
          return runner.assertApplied(receipt);
        },
        async readConfigurationSha256() {
          await checkOwner();
          return runner.readConfigurationSha256();
        },
        async readPlannedResourceFields(receipt, selections, env, signal) {
          await checkOwner();
          return runner.readPlannedResourceFields(receipt, selections, env, signal);
        },
        async readAppliedResourceFields(receipt, selections, env, signal) {
          await checkOwner();
          return runner.readAppliedResourceFields(receipt, selections, env, signal);
        },
        async readNoChangeResourceFields(receipt, selections, env, signal) {
          await checkOwner();
          return runner.readNoChangeResourceFields(receipt, selections, env, signal);
        },
        async readPlannedStateResourceFields(receipt, selections, env, signal) {
          await checkOwner();
          return runner.readPlannedStateResourceFields(receipt, selections, env, signal);
        },
        async readCurrentResourcePlanReceipt(env, signal) {
          await checkOwner();
          return runner.readCurrentResourcePlanReceipt(env, signal);
        },
        async readApplyCheckpoint(receipt) {
          await checkOwner();
          return runner.readApplyCheckpoint(receipt);
        },
        async readApplyAttemptResourceFields(receipt, selections, env, signal) {
          await checkOwner();
          return runner.readApplyAttemptResourceFields(receipt, selections, env, signal);
        },
        async readPlannedResourceIds(receipt, addresses, env, signal) {
          await checkOwner();
          return runner.readPlannedResourceIds(receipt, addresses, env, signal);
        },
        async readConfiguration(expectedSha256) {
          await checkOwner();
          return runner.readConfiguration(expectedSha256);
        },
        async readOutputs(names, env, signal) {
          await checkOwner();
          return runner.readOutputs(names, env, signal);
        },
        async reviseConfiguration(expectedSha256, configuration) {
          await checkOwner();
          return runner.reviseConfiguration(expectedSha256, configuration);
        },
        async reconcileApplyFromEvidence(receipt, evidenceSha256) {
          await checkOwner();
          return runner.reconcileApplyFromEvidence(receipt, evidenceSha256);
        },
        async planDestroy(env, signal) {
          await checkOwner();
          return runner.planDestroy(env, signal);
        },
        async planAction(intent, env, signal) {
          await checkOwner();
          return runner.planAction(intent, env, signal);
        },
        async plan(env, signal) {
          await checkOwner();
          return runner.plan(env, signal);
        },
        async apply(receipt, env, signal) {
          await checkOwner();
          await runner.apply(receipt, env, signal);
        },
      };
    },
  };
}
export function registerCeTerraformService(bus: CeEventBus, service: CeTerraformService): () => void {
  return bus.on(TERRAFORM_SERVICE_CHANNEL, (data) => {
    if (!data || typeof data !== 'object') return;
    const request = data as { version?: unknown; resolve?: unknown };
    if (request.version === 1 && typeof request.resolve === 'function') request.resolve(service);
  });
}

export function requestPlatform(bus: CeEventBus): Promise<CePlatformService> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Platform CE service is required for Terraform ownership')), 5000);
    try {
      bus.emit('xcsh:ce-platform:v2:service', {
        version: 2,
        resolve: (service: CePlatformService) => {
          clearTimeout(timer);
          resolve(service);
        },
      });
    } catch {
      clearTimeout(timer);
      reject(new Error('Platform CE service is unavailable'));
    }
  });
}
