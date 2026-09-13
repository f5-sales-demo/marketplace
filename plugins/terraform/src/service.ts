import { join } from 'node:path';
import type { CeOwner } from '../../platform/src/ce/runtime';
import type { CeEventBus, CePlatformService } from '../../platform/src/ce/service';
import { type Deployment, type PlanReceipt, type TerraformActionIntent, TerraformRunner } from './runner';

export const TERRAFORM_SERVICE_CHANNEL = 'xcsh:ce-terraform:v1:service';
export interface TerraformSession {
  /** Current private configuration identity, used to reconcile an interrupted revision. */
  readConfigurationSha256?(): Promise<string>;
  /** Sensitive internal snapshot, bound to the caller's expected revision. */
  readConfiguration(expectedSha256: string): Promise<string>;
  /** Restricted ownership projection; selected fields must be nonsensitive. */
  readPlannedResourceFields(
    receipt: PlanReceipt,
    selections: Record<string, string[]>,
    env: Record<string, string | undefined>,
    signal?: AbortSignal,
  ): Promise<Record<string, Record<string, unknown> | null>>;
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

/** Cloud adapters translate intent; the runner owns isolated execution and exact saved-plan application. */
export function createCeTerraformService(platform: () => Promise<CePlatformService>): CeTerraformService {
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
      );
      if (resume) await runner.resume(deployment.deploymentId, deployment, resume === 'current' ? 'current' : 'exact');
      else await runner.prepare(deployment);
      const checkOwner = async () => {
        await shared.storage(owner);
      };
      return {
        async readConfigurationSha256() {
          await checkOwner();
          return runner.readConfigurationSha256();
        },
        async readPlannedResourceFields(receipt, selections, env, signal) {
          await checkOwner();
          return runner.readPlannedResourceFields(receipt, selections, env, signal);
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
