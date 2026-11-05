import type { CeTerraformService } from '../../../terraform/src/service';
import { TERRAFORM_SERVICE_CHANNEL } from '../../../terraform/src/service';

export class GcpTerraformSetupRequired extends Error {
  constructor() {
    super('Install and set up the Terraform plugin before selecting the Terraform engine');
  }
}

/** The public path must use the installed service, including its configured runner. */
export function requestGcpTerraformService(events: unknown, signal?: AbortSignal): Promise<CeTerraformService> {
  const bus = events as { emit?(channel: string, data: unknown): void } | undefined;
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    if (typeof bus?.emit !== 'function') return reject(new GcpTerraformSetupRequired());
    const finish = (error?: unknown, service?: CeTerraformService) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      if (error) reject(error);
      else if (service && typeof service.open === 'function') resolve(service);
      else reject(new GcpTerraformSetupRequired());
    };
    const cancel = () => finish(signal?.reason);
    const timer = setTimeout(() => finish(new GcpTerraformSetupRequired()), 2000);
    signal?.addEventListener('abort', cancel, { once: true });
    try {
      bus.emit(TERRAFORM_SERVICE_CHANNEL, {
        version: 1,
        resolve: (service: CeTerraformService) => finish(undefined, service),
      });
    } catch {
      finish(new GcpTerraformSetupRequired());
    }
  });
}
