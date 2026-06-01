import type { ExtensionFactory } from '@f5xc-salesdemos/xcsh';

const factory: ExtensionFactory = async (pi) => {
  pi.setLabel('Azure Status');

  try {
    const which = Bun.spawnSync(['which', 'az']);
    if (which.exitCode !== 0) return;
  } catch {
    return;
  }

  if (typeof pi.registerServiceStatus === 'function') {
    pi.registerServiceStatus({
      name: 'Azure',
      async check() {
        try {
          const result = Bun.spawnSync(['az', 'account', 'show', '--output', 'json']);
          if (result.exitCode === 0) return { state: 'connected' };
          return { state: 'unauthenticated', hint: 'run: az login' };
        } catch {
          return { state: 'unavailable', hint: 'az CLI check failed' };
        }
      },
      fix: {
        prompt: 'Azure session expired',
        command: ['az', 'login', '--use-device-code'],
      },
    });
  }
};

export default factory;
