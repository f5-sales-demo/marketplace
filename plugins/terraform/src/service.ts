import type { CeOwner } from '../../platform/src/ce/runtime';
import type { CeEventBus, CePlatformService } from '../../platform/src/ce/service';
import { type Deployment, type PlanReceipt, TerraformRunner } from './runner';

export const TERRAFORM_SERVICE_CHANNEL = 'xcsh:ce-terraform:v1:service';
export interface TerraformSession {
  plan(env: Record<string, string | undefined>, signal?: AbortSignal): Promise<PlanReceipt>;
  apply(receipt: PlanReceipt, env: Record<string, string | undefined>, signal?: AbortSignal): Promise<void>;
}
export interface CeTerraformService {
  open(owner: CeOwner, deployment: Deployment, resume: boolean): Promise<TerraformSession>;
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
      const runner = new TerraformRunner(store.directory);
      if (resume) await runner.resume(deployment.deploymentId, deployment);
      else await runner.prepare(deployment);
      const checkOwner = async () => {
        await shared.storage(owner);
      };
      return {
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
