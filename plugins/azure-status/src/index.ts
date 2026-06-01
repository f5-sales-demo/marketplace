import type { ExtensionFactory } from '@f5xc-salesdemos/xcsh';

const factory: ExtensionFactory = async (pi) => {
  pi.setLabel('Azure Status');

  // Always register setup command (even without az CLI)
  if (typeof pi.registerCommand === 'function') {
    pi.registerCommand('azure-status:setup', {
      description: 'Install and configure Azure CLI',
      async handler(_args, ctx) {
        const { runSetupWizard } = await import('./wizard');
        await runSetupWizard(pi, ctx);
      },
    });
  }

  // Check if az CLI is available
  let azAvailable = false;
  try {
    const checker = process.platform === 'win32' ? 'where' : 'which';
    azAvailable = Bun.spawnSync([checker, 'az']).exitCode === 0;
  } catch {
    // az not available
  }

  // Always register service status (shows unavailable when CLI missing)
  if (typeof pi.registerServiceStatus === 'function') {
    pi.registerServiceStatus({
      name: 'Azure',
      async check() {
        try {
          const whichChecker = process.platform === 'win32' ? 'where' : 'which';
          const whichResult = Bun.spawnSync([whichChecker, 'az']);
          if (whichResult.exitCode !== 0) {
            return { state: 'unavailable', hint: 'run: /azure-status:setup' };
          }
          const result = Bun.spawnSync(['az', 'account', 'show', '--output', 'json']);
          if (result.exitCode === 0) return { state: 'connected' };
          return { state: 'unauthenticated', hint: 'run: /azure-status:setup' };
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

  // Session start: notify if CLI missing
  if (typeof pi.on === 'function') {
    pi.on('session_start', async (_event: unknown, _ctx: { cwd: string }) => {
      if (!azAvailable) {
        pi.logger.debug('Azure: az CLI not found');
      }
    });
  }
};

export default factory;
