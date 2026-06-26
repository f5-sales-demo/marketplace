import type { ExtensionFactory } from '@f5-sales-demo/xcsh';

function sanitizeHintField(value: unknown, maxLen = 200): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[^\x20-\x7E]/g, '').slice(0, maxLen);
}

const factory: ExtensionFactory = async (pi) => {
  pi.setLabel('GCloud');

  // Always register setup command (even without gcloud CLI)
  if (typeof pi.registerCommand === 'function') {
    pi.registerCommand('gcloud:setup', {
      description: 'Install and configure Google Cloud CLI',
      async handler(_args, ctx) {
        const { runSetupWizard } = await import('./wizard');
        await runSetupWizard(pi, ctx);
      },
    });
  }

  // Check if gcloud CLI is available
  let gcloudAvailable = false;
  try {
    const checker = process.platform === 'win32' ? 'where' : 'which';
    gcloudAvailable = Bun.spawnSync([checker, 'gcloud']).exitCode === 0;
  } catch {
    // gcloud not available
  }

  // Always register service status (shows unavailable when CLI missing)
  if (typeof pi.registerServiceStatus === 'function') {
    pi.registerServiceStatus({
      name: 'GCloud',
      async check() {
        try {
          const whichChecker = process.platform === 'win32' ? 'where' : 'which';
          const whichResult = Bun.spawnSync([whichChecker, 'gcloud']);
          if (whichResult.exitCode !== 0) {
            return { state: 'unavailable', hint: 'run: /gcloud:setup' };
          }
          const result = Bun.spawnSync(['gcloud', 'auth', 'print-access-token', '--quiet']);
          if (result.exitCode === 0) return { state: 'connected' };
          const stderr = new TextDecoder().decode(result.stderr).toLowerCase();
          if (stderr.includes('expired') || stderr.includes('token'))
            return {
              state: 'unauthenticated',
              hint: 'token expired, run: /gcloud:setup',
            };
          return {
            state: 'unauthenticated',
            hint: 'run: /gcloud:setup',
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

  // Before agent start: inject gcloud config context
  if (gcloudAvailable && typeof pi.on === 'function') {
    pi.on('before_agent_start', async (_event: unknown, ctx: { cwd: string }) => {
      try {
        const cwd = ctx?.cwd || process.cwd();
        const result = Bun.spawnSync(['gcloud', 'config', 'list', '--format=json'], { cwd });
        if (result.exitCode !== 0) return;
        const config = JSON.parse(new TextDecoder().decode(result.stdout));
        const lines = [
          config.core?.project ? `Project: ${sanitizeHintField(config.core.project)}` : '',
          config.core?.account ? `Account: ${sanitizeHintField(config.core.account)}` : '',
          config.compute?.region ? `Region: ${sanitizeHintField(config.compute.region)}` : '',
          config.compute?.zone ? `Zone: ${sanitizeHintField(config.compute.zone)}` : '',
        ]
          .filter(Boolean)
          .join('\n');
        if (!lines) return;
        return {
          message: { customType: 'gcloud_hint', content: lines, display: false },
        };
      } catch {
        return;
      }
    });
  }

  // Session start: notify if CLI missing
  if (typeof pi.on === 'function') {
    pi.on('session_start', async (_event: unknown, _ctx: { cwd: string }) => {
      if (!gcloudAvailable) {
        pi.logger.debug('GCloud: gcloud CLI not found');
      }
    });
  }
};

export default factory;
