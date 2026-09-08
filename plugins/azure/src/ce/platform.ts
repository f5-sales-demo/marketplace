import type { CePlatformService } from '../../../platform/src/ce/service';

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
