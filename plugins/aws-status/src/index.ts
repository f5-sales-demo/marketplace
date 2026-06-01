import type { ExtensionFactory } from '@f5xc-salesdemos/xcsh';

const factory: ExtensionFactory = async (pi) => {
  pi.setLabel('AWS Status');

  try {
    const which = Bun.spawnSync(['which', 'aws']);
    if (which.exitCode !== 0) return;
  } catch {
    return;
  }

  if (typeof pi.registerServiceStatus === 'function') {
    pi.registerServiceStatus({
      name: 'AWS',
      async check() {
        try {
          const result = Bun.spawnSync(['aws', 'sts', 'get-caller-identity', '--output', 'json']);
          if (result.exitCode === 0) return { state: 'connected' };
          const stderr = new TextDecoder().decode(result.stderr).toLowerCase();
          if (stderr.includes('sso token') || stderr.includes('expired'))
            return {
              state: 'unauthenticated',
              hint: 'SSO expired, run: aws sso login',
            };
          if (stderr.includes('could not find profile') || stderr.includes('profile'))
            return {
              state: 'unauthenticated',
              hint: 'profile not found, run: aws configure',
            };
          if (stderr.includes('could not connect') || stderr.includes('network'))
            return { state: 'unavailable', hint: 'network error' };
          return { state: 'unauthenticated', hint: 'run: aws configure' };
        } catch {
          return { state: 'unavailable', hint: 'aws CLI check failed' };
        }
      },
      fix: {
        prompt: 'AWS SSO session expired',
        command: ['aws', 'sso', 'login'],
      },
    });
  }
};

export default factory;
