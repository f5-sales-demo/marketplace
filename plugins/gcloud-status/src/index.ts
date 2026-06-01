import type { ExtensionFactory } from '@f5xc-salesdemos/xcsh';

const factory: ExtensionFactory = async (pi) => {
  pi.setLabel('GCloud Status');

  try {
    const which = Bun.spawnSync(['which', 'gcloud']);
    if (which.exitCode !== 0) return;
  } catch {
    return;
  }

  if (typeof pi.registerServiceStatus === 'function') {
    pi.registerServiceStatus({
      name: 'GCloud',
      async check() {
        try {
          const result = Bun.spawnSync(['gcloud', 'auth', 'print-access-token', '--quiet']);
          if (result.exitCode === 0) return { state: 'connected' };
          const stderr = new TextDecoder().decode(result.stderr).toLowerCase();
          if (stderr.includes('expired') || stderr.includes('token'))
            return {
              state: 'unauthenticated',
              hint: 'token expired, run: gcloud auth login',
            };
          return {
            state: 'unauthenticated',
            hint: 'run: gcloud auth login',
          };
        } catch {
          return { state: 'unavailable', hint: 'gcloud CLI check failed' };
        }
      },
      fix: {
        prompt: 'Google Cloud token expired',
        command: ['gcloud', 'auth', 'login'],
      },
    });
  }
};

export default factory;
