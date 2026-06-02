import type { ExtensionFactory } from '@f5xc-salesdemos/xcsh';

function sanitizeHintField(value: unknown, maxLen = 200): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[^\x20-\x7E]/g, '').slice(0, maxLen);
}

const factory: ExtensionFactory = async (pi) => {
  pi.setLabel('Azure');

  if (typeof pi.registerCommand === 'function') {
    pi.registerCommand('azure:setup', {
      description: 'Install and configure Azure CLI',
      async handler(_args, ctx) {
        const { runSetupWizard } = await import('./wizard');
        await runSetupWizard(pi, ctx);
      },
    });
  }

  let azAvailable = false;
  try {
    const checker = process.platform === 'win32' ? 'where' : 'which';
    azAvailable = Bun.spawnSync([checker, 'az']).exitCode === 0;
  } catch {
    // az not available
  }

  if (azAvailable && typeof pi.registerTool === 'function') {
    const { createAzAccountShowTool } = await import('./tools/az-account-show');
    const { createAzGroupListTool } = await import('./tools/az-group-list');
    const { createAzResourceListTool } = await import('./tools/az-resource-list');
    const { createAzVmListTool } = await import('./tools/az-vm-list');
    const { createAzExecTool } = await import('./tools/az-exec');
    const { createAzHelpTool } = await import('./tools/az-help');

    pi.registerTool(createAzAccountShowTool(pi));
    pi.registerTool(createAzGroupListTool(pi));
    pi.registerTool(createAzResourceListTool(pi));
    pi.registerTool(createAzVmListTool(pi));
    pi.registerTool(createAzExecTool(pi));
    pi.registerTool(createAzHelpTool(pi));
  }

  if (typeof pi.registerServiceStatus === 'function') {
    pi.registerServiceStatus({
      name: 'Azure',
      async check() {
        try {
          const whichChecker = process.platform === 'win32' ? 'where' : 'which';
          const whichResult = Bun.spawnSync([whichChecker, 'az']);
          if (whichResult.exitCode !== 0) {
            return { state: 'unavailable', hint: 'run: /azure:setup' };
          }
          const result = Bun.spawnSync(['az', 'account', 'show', '--output', 'json']);
          if (result.exitCode === 0) return { state: 'connected' };
          return { state: 'unauthenticated', hint: 'run: /azure:setup' };
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

  if (azAvailable && typeof pi.on === 'function') {
    pi.on('before_agent_start', async (_event: unknown, ctx: { cwd: string }) => {
      try {
        const cwd = ctx?.cwd || process.cwd();
        const result = Bun.spawnSync(['az', 'account', 'show', '--output', 'json'], { cwd });
        if (result.exitCode !== 0) return;
        const account = JSON.parse(new TextDecoder().decode(result.stdout));
        const lines = [
          account.name ? `Subscription: ${sanitizeHintField(account.name)} (${sanitizeHintField(account.id)})` : '',
          account.tenantId ? `Tenant: ${sanitizeHintField(account.tenantId)}` : '',
          account.user?.name
            ? `User: ${sanitizeHintField(account.user.name)} (${sanitizeHintField(account.user.type)})`
            : '',
          account.environmentName ? `Cloud: ${sanitizeHintField(account.environmentName)}` : '',
        ]
          .filter(Boolean)
          .join('\n');
        if (!lines) return;
        return {
          message: { customType: 'azure_hint', content: lines, display: false },
        };
      } catch {
        return;
      }
    });
  }

  if (typeof pi.on === 'function') {
    pi.on('session_start', async (_event: unknown, _ctx: { cwd: string }) => {
      if (!azAvailable) {
        pi.logger.debug('Azure: az CLI not found');
      }
    });
  }
};

export default factory;
