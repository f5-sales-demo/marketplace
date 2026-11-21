// biome-ignore-all lint: Generated Bun bundle; lint the source modules instead.
// @bun
// plugins/azure/src/ce/platform.ts
function azurePlatformService(pi, signal) {
  const bus = pi.events;
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
      resolve: (service) => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        resolve(service);
      },
    });
  });
}
function azureTerraformService(pi, signal) {
  const bus = pi.events;
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
        resolve: (service) => {
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

export { azurePlatformService, azureTerraformService };
