import type { ExtensionFactory } from '@f5xc-salesdemos/xcsh';

const factory: ExtensionFactory = async (pi) => {
  pi.setLabel('AWS Status');

  // Always register setup command (even without aws CLI)
  if (typeof pi.registerCommand === 'function') {
    pi.registerCommand('aws-status:setup', {
      description: 'Install and configure AWS CLI',
      async handler(_args, ctx) {
        const { runSetupWizard } = await import('./wizard');
        await runSetupWizard(pi, ctx);
      },
    });
  }

  // Check if aws CLI is available
  let awsAvailable = false;
  try {
    const checker = process.platform === 'win32' ? 'where' : 'which';
    awsAvailable = Bun.spawnSync([checker, 'aws']).exitCode === 0;
  } catch {
    // aws not available
  }

  // Always register service status (shows unavailable when CLI missing)
  if (typeof pi.registerServiceStatus === 'function') {
    pi.registerServiceStatus({
      name: 'AWS',
      async check() {
        try {
          const whichChecker = process.platform === 'win32' ? 'where' : 'which';
          const whichResult = Bun.spawnSync([whichChecker, 'aws']);
          if (whichResult.exitCode !== 0) {
            return { state: 'unavailable', hint: 'run: /aws-status:setup' };
          }
          const result = Bun.spawnSync(['aws', 'sts', 'get-caller-identity', '--output', 'json']);
          if (result.exitCode === 0) return { state: 'connected' };
          const stderr = new TextDecoder().decode(result.stderr).toLowerCase();
          if (stderr.includes('sso token') || stderr.includes('expired'))
            return {
              state: 'unauthenticated',
              hint: 'SSO expired, run: /aws-status:setup',
            };
          if (stderr.includes('could not find profile') || stderr.includes('profile'))
            return {
              state: 'unauthenticated',
              hint: 'profile not found, run: /aws-status:setup',
            };
          if (stderr.includes('could not connect') || stderr.includes('network'))
            return { state: 'unavailable', hint: 'network error' };
          return { state: 'unauthenticated', hint: 'run: /aws-status:setup' };
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

  // Session start: notify if CLI missing
  if (typeof pi.on === 'function') {
    pi.on('session_start', async (_event: unknown, _ctx: { cwd: string }) => {
      if (!awsAvailable) {
        pi.logger.debug('AWS: aws CLI not found');
      }
    });
  }
};

export default factory;
