import { existsSync } from 'node:fs';
import type { PluginInterface } from './az/types';
import { presentTool as enrichTool } from './presentation';

interface IntegrationSnapshot<T> {
  state: 'ready' | 'setup_required' | 'unavailable' | 'degraded' | 'rate_limited' | 'error';
  value?: T;
}

interface AzureAccount {
  id: string;
  name?: string;
  tenantId?: string;
  environmentName?: string;
  user: { name: string; type?: string };
}

interface AzureExtensionApi extends PluginInterface {
  presentation: import('@f5-sales-demo/xcsh/presentation').PresentationAPI;
  exec(command: string, args: string[]): Promise<{ stdout: string; stderr: string; code: number }>;
  setLabel(label: string): void;
  registerTool?(tool: unknown): void;
  integrations: {
    register<T>(definition: unknown): {
      get(signal?: AbortSignal): Promise<IntegrationSnapshot<T>>;
    };
  };
  on?(event: string, handler: unknown): void;
  logger: { debug(message: string): void };
}

type ExtensionFactory = (pi: AzureExtensionApi) => void | Promise<void>;

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

export function azureInstallArgv(platform = process.platform): string[] {
  if (platform === 'darwin') return ['brew', 'install', 'azure-cli'];
  if (platform === 'win32') return ['winget', 'install', '--exact', '--id', 'Microsoft.AzureCLI'];
  return ['sudo', 'apt-get', 'install', '--yes', 'azure-cli'];
}

const bakedDesktop = () => existsSync('/etc/pi-desktop/desktop-lock.json');

const factory: ExtensionFactory = async (pi) => {
  const presentTool = <T extends { name: string; label?: string }>(tool: T) => enrichTool(tool, pi.presentation);
  pi.setLabel('Azure');

  const integration = pi.integrations.register<AzureAccount>({
    id: 'azure',
    name: 'Azure',
    plugin: 'azure',
    kind: 'network',
    setup: {
      pluginDependencies: [],
      requiredEnvironment: [],
      profileFields: ['accounts'],
      steps: [
        {
          kind: 'install',
          argv: azureInstallArgv(),
          timeoutMs: 300_000,
        },
        {
          kind: 'install',
          argv: ['az', 'extension', 'add', '--name', 'resource-graph', '--upgrade'],
          timeoutMs: 120_000,
        },
        {
          kind: 'login',
          argv: ['az', 'login', '--use-device-code'],
          timeoutMs: 300_000,
        },
      ].filter((step) => !bakedDesktop() || step.kind !== 'install'),
      verification: [
        {
          argv: ['az', 'account', 'show', '--output', 'json'],
          timeoutMs: 30_000,
        },
      ],
    },
    async probe() {
      const checker = process.platform === 'win32' ? 'where' : 'which';
      if (Bun.spawnSync([checker, 'az']).exitCode !== 0) return { state: 'setup_required', reason: 'cli_missing' };
      const result = Bun.spawnSync(['az', 'account', 'show', '--output', 'json']);
      if (result.exitCode !== 0) {
        const rawError = new TextDecoder().decode(result.stderr);
        const error = rawError.toLowerCase();
        if (/rate limit|too many requests|throttl|429/.test(error))
          return {
            state: 'rate_limited',
            reason: 'rate_limited',
            retryAfterMs: retryAfterMsFromHeaders(rawError),
          };
        if (error.includes('expired')) return { state: 'setup_required', reason: 'expired' };
        if (error.includes('denied') || error.includes('forbidden'))
          return { state: 'unavailable', reason: 'permission_denied' };
        if (error.includes('connect') || error.includes('network')) return { state: 'unavailable', reason: 'network' };
        return { state: 'setup_required', reason: 'not_authenticated' };
      }
      try {
        const value = JSON.parse(new TextDecoder().decode(result.stdout)) as AzureAccount;
        if (!value.id || !value.user?.name) return { state: 'error', reason: 'invalid_response' };
        return { state: 'ready', value };
      } catch {
        return { state: 'error', reason: 'invalid_response' };
      }
    },
    profile(value: AzureAccount) {
      const principalType = value.user?.type?.toLowerCase() === 'user' ? 'user' : 'service';
      return {
        facts: {
          accounts: [
            {
              provider: 'azure',
              identifier: value.user.name,
              principalType,
              accountId: value.id,
              tenantId: value.tenantId,
              username: value.user.name,
            },
          ],
        },
        observations: [],
      };
    },
  });

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
    const { createAzResourceGraphQueryTool } = await import('./tools/az-resource-graph-query');
    const { createAzActivityLogListTool } = await import('./tools/az-activity-log-list');
    const { createAzureCeInventoryTool } = await import('./tools/azure-ce-inventory');
    const { createAzExecTool } = await import('./tools/az-exec');
    const { createAzHelpTool } = await import('./tools/az-help');
    const { createAzureComputeDiscoverTool } = await import('./tools/azure-compute-discover');
    const { createAzureCePlanTool } = await import('./tools/azure-ce-plan');
    const { createAzureCeApplyTool } = await import('./tools/azure-ce-apply');
    const { createAzureCeStatusTool } = await import('./tools/azure-ce-status');
    const { createAzureCeDiagnoseTool } = await import('./tools/azure-ce-diagnose');
    const { createAzureCloudInitAnalyzeTool } = await import('./tools/azure-cloud-init-analyze');

    pi.registerTool(presentTool(createAzAccountShowTool(pi)));
    pi.registerTool(presentTool(createAzGroupListTool(pi)));
    pi.registerTool(presentTool(createAzResourceListTool(pi)));
    pi.registerTool(presentTool(createAzVmListTool(pi)));
    pi.registerTool(presentTool(createAzResourceGraphQueryTool(pi)));
    pi.registerTool(presentTool(createAzActivityLogListTool(pi)));
    pi.registerTool(presentTool(createAzureCeInventoryTool(pi)));
    pi.registerTool(presentTool(createAzExecTool(pi)));
    pi.registerTool(presentTool(createAzHelpTool(pi)));
    pi.registerTool(presentTool(createAzureComputeDiscoverTool(pi)));
    pi.registerTool(presentTool(createAzureCePlanTool(pi)));
    pi.registerTool(presentTool(createAzureCeApplyTool(pi)));
    pi.registerTool(presentTool(createAzureCeStatusTool(pi)));
    pi.registerTool(presentTool(createAzureCeDiagnoseTool(pi)));
    pi.registerTool(presentTool(createAzureCloudInitAnalyzeTool(pi)));
  }

  if (typeof pi.on === 'function') {
    pi.on('before_agent_start', async (_event: { prompt?: string }, _ctx: { cwd: string }) => {
      const accountLines: string[] = [];
      try {
        if (!azAvailable) throw new Error('az CLI unavailable');
        const snapshot = await integration.get();
        if (snapshot.state === 'ready' && snapshot.value) {
          const account = snapshot.value;
          accountLines.push(
            ...[
              account.name ? `Subscription: ${sanitizeHintField(account.name)} (${sanitizeHintField(account.id)})` : '',
              account.tenantId ? `Tenant: ${sanitizeHintField(account.tenantId)}` : '',
              account.user?.name
                ? `User: ${sanitizeHintField(account.user.name)} (${sanitizeHintField(account.user.type)})`
                : '',
              account.environmentName ? `Cloud: ${sanitizeHintField(account.environmentName)}` : '',
            ].filter(Boolean),
          );
        }
      } catch {
        // Account observation is informational and does not constrain the request.
      }
      const content = accountLines.join('\n');
      if (!content) return;
      return {
        message: {
          customType: 'azure_hint',
          content,
          display: false,
        },
      };
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
