import type { ExtensionFactory } from '@f5-sales-demo/xcsh';
import { detectErrorType, errorResult, renderError } from './tools/shared';

function sanitizeHintField(value: unknown, maxLen = 200): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[^\x20-\x7E]/g, '').slice(0, maxLen);
}

/**
 * Wrap a factory tool so any error that still propagates out of its execute()
 * is converted into a structured error result carrying details.errorType.
 *
 * The per-tool handlers already catch gcloud errors and return a friendly
 * errorResult (a normal result); those never reach this wrapper. A genuine
 * cancellation (AbortError / ToolAbortError) is re-thrown so the agent loop
 * can distinguish user cancellation from a real tool failure.
 */
export function withErrorType<T extends { name: string; execute: (...args: never[]) => Promise<unknown> }>(tool: T): T {
  const originalExecute = tool.execute.bind(tool) as (...args: unknown[]) => Promise<unknown>;
  return {
    ...tool,
    execute: (async (...args: unknown[]) => {
      try {
        return await originalExecute(...args);
      } catch (err) {
        const name = (err as { name?: string } | null | undefined)?.name;
        if (name === 'AbortError' || name === 'ToolAbortError') throw err;
        return errorResult(renderError(err), { tool: tool.name, errorType: detectErrorType(err) });
      }
    }) as T['execute'],
  };
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

  // Only register tools when the gcloud CLI is present.
  if (gcloudAvailable && typeof pi.registerTool === 'function') {
    const { createGcloudConfigListTool } = await import('./tools/gcloud-config-list');
    const { createGcloudProjectsListTool } = await import('./tools/gcloud-projects-list');
    const { createGcloudComputeInstancesListTool } = await import('./tools/gcloud-compute-instances-list');
    const { createGcloudStorageBucketsListTool } = await import('./tools/gcloud-storage-buckets-list');
    const { createGcloudExecTool } = await import('./tools/gcloud-exec');
    const { createGcloudHelpTool } = await import('./tools/gcloud-help');

    pi.registerTool(withErrorType(createGcloudConfigListTool(pi)));
    pi.registerTool(withErrorType(createGcloudProjectsListTool(pi)));
    pi.registerTool(withErrorType(createGcloudComputeInstancesListTool(pi)));
    pi.registerTool(withErrorType(createGcloudStorageBucketsListTool(pi)));
    pi.registerTool(withErrorType(createGcloudExecTool(pi)));
    pi.registerTool(withErrorType(createGcloudHelpTool(pi)));
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
