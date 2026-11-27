import type { CePlatformService } from '../../../platform/src/ce/service';
import type { CeTerraformService } from '../../../terraform/src/service';

/** Type-only dependency; installed plugins communicate through the supported extension bus. */
export function azurePlatformService(pi: { [key: string]: unknown }, signal?: AbortSignal): Promise<CePlatformService> {
  const bus = pi.events as { emit?: (channel: string, data: unknown) => void } | undefined;
  if (typeof bus?.emit !== 'function') return Promise.reject(new Error('Platform CE v2 service is required'));
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('CE operation cancelled'));
      return;
    }
    const abort = () => {
      clearTimeout(timer);
      reject(new Error('CE operation cancelled'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      reject(new Error('Platform CE v2 service is not loaded'));
    }, 5000);
    signal?.addEventListener('abort', abort, { once: true });
    bus.emit?.('xcsh:ce-platform:v2:service', {
      version: 2,
      resolve: (service: CePlatformService) => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        resolve(service);
      },
    });
  });
}

/** Request the generic Terraform lifecycle service through the supported plugin event bus. */
export function azureTerraformService(
  pi: { [key: string]: unknown },
  signal?: AbortSignal,
): Promise<CeTerraformService> {
  const bus = pi.events as { emit?: (channel: string, value: unknown) => void } | undefined;
  return new Promise((resolve, reject) => {
    const fail = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', fail);
      reject(new Error('Terraform CE service unavailable or cancelled'));
    };
    const timer = setTimeout(fail, 5000);
    signal?.addEventListener('abort', fail, { once: true });
    if (signal?.aborted || typeof bus?.emit !== 'function') return fail();
    try {
      bus.emit('xcsh:ce-terraform:v1:service', {
        version: 1,
        resolve: (service: CeTerraformService) => {
          clearTimeout(timer);
          signal?.removeEventListener('abort', fail);
          resolve(service);
        },
      });
    } catch {
      fail();
    }
  });
}
