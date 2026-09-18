import type { ExtensionFactory } from '@f5-sales-demo/xcsh';
import { detectErrorType, errorResult, renderError } from './tools/shared';

interface GcloudContext {
  account: string;
  project?: string;
  region?: string;
  zone?: string;
}

interface GcloudIntegrationApi {
  integrations: {
    register<T>(definition: unknown): {
      get(signal?: AbortSignal): Promise<{ state: string; value?: T }>;
    };
  };
}

function sanitizeHintField(value: unknown, maxLen = 200): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[^\x20-\x7E]/g, '').slice(0, maxLen);
}

export function retryAfterMsFromHeaders(text: string, now = Date.now()): number | undefined {
  const retryAfter = text.match(/(?:^|\r?\n)retry-after:\s*([^\r\n]+)/i)?.[1]?.trim();
  if (retryAfter && /^\d+$/.test(retryAfter)) return Number(retryAfter) * 1000;
  if (retryAfter) {
    const retryAt = Date.parse(retryAfter);
    if (Number.isFinite(retryAt)) return Math.max(0, retryAt - now);
  }
  const reset = text.match(/(?:^|\r?\n)x-ratelimit-reset:\s*(\d+)/i)?.[1];
  return reset ? Math.max(0, Number(reset) * 1000 - now) : undefined;
}

export function gcloudInstallArgv(platform = process.platform): string[] {
  if (platform === 'darwin') return ['brew', 'install', '--cask', 'google-cloud-sdk'];
  if (platform === 'win32') return ['winget', 'install', '--exact', '--id', 'Google.CloudSDK'];
  return ['sudo', 'apt-get', 'install', '--yes', 'google-cloud-cli'];
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
  const integration = (pi as typeof pi & GcloudIntegrationApi).integrations.register<GcloudContext>({
    id: 'gcloud',
    name: 'Google Cloud',
    plugin: 'gcloud',
    kind: 'network',
    setup: {
      pluginDependencies: [],
      requiredEnvironment: [],
      profileFields: ['accounts'],
      steps: [
        {
          kind: 'install',
          argv: gcloudInstallArgv(),
          timeoutMs: 300_000,
        },
        { kind: 'login', argv: ['gcloud', 'auth', 'login'], timeoutMs: 300_000 },
      ],
      verification: [
        { argv: ['gcloud', 'auth', 'list', '--filter=status:ACTIVE', '--format=json'], timeoutMs: 30_000 },
      ],
    },
    async probe() {
      const checker = process.platform === 'win32' ? 'where' : 'which';
      if (Bun.spawnSync([checker, 'gcloud']).exitCode !== 0) return { state: 'setup_required', reason: 'cli_missing' };
      const auth = Bun.spawnSync(['gcloud', 'auth', 'list', '--filter=status:ACTIVE', '--format=json']);
      if (auth.exitCode !== 0) {
        const rawError = new TextDecoder().decode(auth.stderr);
        if (/rate limit|too many requests|resource_exhausted|429/i.test(rawError))
          return { state: 'rate_limited', reason: 'rate_limited', retryAfterMs: retryAfterMsFromHeaders(rawError) };
        return { state: 'setup_required', reason: 'not_authenticated' };
      }
      try {
        const accounts = JSON.parse(new TextDecoder().decode(auth.stdout)) as Array<{ account?: string }>;
        const account = accounts[0]?.account;
        if (!account) return { state: 'setup_required', reason: 'not_authenticated' };
        const configResult = Bun.spawnSync(['gcloud', 'config', 'list', '--format=json']);
        if (configResult.exitCode !== 0) {
          const rawError = new TextDecoder().decode(configResult.stderr);
          if (/rate limit|too many requests|resource_exhausted|429/i.test(rawError))
            return { state: 'rate_limited', reason: 'rate_limited', retryAfterMs: retryAfterMsFromHeaders(rawError) };
          return { state: 'degraded', reason: 'invalid_response' };
        }
        const config = JSON.parse(new TextDecoder().decode(configResult.stdout));
        return {
          state: 'ready',
          value: {
            account,
            project: config.core?.project,
            region: config.compute?.region,
            zone: config.compute?.zone,
          },
        };
      } catch {
        return { state: 'error', reason: 'invalid_response' };
      }
    },
    profile(value: GcloudContext) {
      const principalType = value.account.endsWith('.gserviceaccount.com') ? 'service' : 'user';
      return {
        facts: {
          accounts: [
            {
              provider: 'gcloud',
              identifier: value.account,
              principalType,
              accountId: value.project,
              username: value.account,
            },
          ],
        },
        observations: [],
      };
    },
  });

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

  // Before agent start: inject gcloud config context
  if (gcloudAvailable && typeof pi.on === 'function') {
    pi.on('before_agent_start', async () => {
      try {
        const snapshot = await integration.get();
        if (snapshot.state !== 'ready' || !snapshot.value) return;
        const config = snapshot.value;
        const lines = [
          config.project ? `Project: ${sanitizeHintField(config.project)}` : '',
          config.account ? `Account: ${sanitizeHintField(config.account)}` : '',
          config.region ? `Region: ${sanitizeHintField(config.region)}` : '',
          config.zone ? `Zone: ${sanitizeHintField(config.zone)}` : '',
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
