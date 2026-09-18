import type { PluginInterface } from './az/types';

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
  exec(command: string, args: string[]): Promise<{ stdout: string; stderr: string; code: number }>;
  setLabel(label: string): void;
  registerTool?(tool: unknown): void;
  integrations: {
    register<T>(definition: unknown): { get(signal?: AbortSignal): Promise<IntegrationSnapshot<T>> };
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

export type AzureCePromptIntent = 'none' | 'deployment' | 'inventory';

export function classifyAzureCePrompt(prompt: string): AzureCePromptIntent {
  const normalized = prompt.toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  const azureContext = /\bazure\b|\bmarketplace\b/.test(normalized);
  const ceContext =
    /\bcustomer edge\b|\bf5 ce\b|\bxc ce\b|\bsecure mesh\b|\bce site\b|\bce node\b|\bce image\b/.test(normalized) ||
    /\bf5\b.*\b(distributed cloud|xc|edge|appliance|route server|bgp)\b/.test(normalized) ||
    /\bdistributed cloud\b.*\b(node|edge|appliance|azure|marketplace)\b/.test(normalized);
  if (!azureContext || !ceContext) return 'none';
  if (
    /\b(deploy|provision|plan|recommend|resize|replace|repair|delete|remove|tear down|teardown|configure|change|update|migrate)\b/.test(
      normalized,
    )
  )
    return 'deployment';
  if (/\bcreate\b/.test(normalized) && !/\bdid\b.*\bcreate\b/.test(normalized)) return 'deployment';
  if (
    /\b(existing|inventory|inventorize|list|show|which|what|owned|owner|ownership|created by|activity|footprint|currently|active|running|stopped|remnant)\b/.test(
      normalized,
    )
  )
    return 'inventory';
  return 'deployment';
}

export function isAzureCePrompt(prompt: string): boolean {
  return classifyAzureCePrompt(prompt) !== 'none';
}

export const AZURE_CE_RESEARCH_GATE = [
  'AZURE CUSTOMER EDGE ROUTE: Use the azure:azure-ce workflow for this request.',
  'Before any recommendation or azure_ce_plan call, use web_search to retrieve and read the dedicated f5xc-ce-automation/v1 contract from f5-sales-demo.github.io, the current official F5 Secure Mesh Site v2 Azure deployment guide from docs.cloud.f5.com, and Microsoft Marketplace image and subscription-aware VM SKU guidance from learn.microsoft.com.',
  'Then call az_account_show and azure_compute_discover. Omit publisher, offer, plan, version, and vmSize unless the user explicitly pinned them; live discovery must enumerate those values.',
  'Require the validated shared-contract identity and normalized digest, the azure-cli-live provider-source receipts, and the discovery artifact. Never guess identifiers, use generic az_exec for CE research, plan before discovery, or mutate without approval.',
].join('\n');

export const AZURE_CE_INVENTORY_GATE = [
  'AZURE CUSTOMER EDGE INVENTORY ROUTE: Use the azure:azure-ce workflow for this existing-state request.',
  'Call az_account_show, then azure_ce_inventory. The inventory tool owns Resource Graph paging, VM instance-view state, Activity Log evidence, correlation, classification, and the canonical artifact.',
  'Do not use web_search, generic delegation, az_exec, azure_compute_discover, azure_ce_plan, deployment research, or any mutation tool.',
  'Caller association is evidence, never an ownership claim. Keep Azure runtime, platform state, routing evidence, and traffic health independent.',
].join('\n');

const factory: ExtensionFactory = async (pi) => {
  pi.setLabel('Azure');

  const integration = pi.integrations.register<AzureAccount>({
    id: 'azure',
    name: 'Azure',
    plugin: 'azure',
    kind: 'network',
    setup: {
      pluginDependencies: ['platform'],
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
      ],
      verification: [{ argv: ['az', 'account', 'show', '--output', 'json'], timeoutMs: 30_000 }],
    },
    async probe() {
      const checker = process.platform === 'win32' ? 'where' : 'which';
      if (Bun.spawnSync([checker, 'az']).exitCode !== 0) return { state: 'setup_required', reason: 'cli_missing' };
      const result = Bun.spawnSync(['az', 'account', 'show', '--output', 'json']);
      if (result.exitCode !== 0) {
        const rawError = new TextDecoder().decode(result.stderr);
        const error = rawError.toLowerCase();
        if (/rate limit|too many requests|throttl|429/.test(error))
          return { state: 'rate_limited', reason: 'rate_limited', retryAfterMs: retryAfterMsFromHeaders(rawError) };
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

    pi.registerTool(createAzAccountShowTool(pi));
    pi.registerTool(createAzGroupListTool(pi));
    pi.registerTool(createAzResourceListTool(pi));
    pi.registerTool(createAzVmListTool(pi));
    pi.registerTool(createAzResourceGraphQueryTool(pi));
    pi.registerTool(createAzActivityLogListTool(pi));
    pi.registerTool(createAzureCeInventoryTool(pi));
    pi.registerTool(createAzExecTool(pi));
    pi.registerTool(createAzHelpTool(pi));
    pi.registerTool(createAzureComputeDiscoverTool(pi));
    pi.registerTool(createAzureCePlanTool(pi));
    pi.registerTool(createAzureCeApplyTool(pi));
    pi.registerTool(createAzureCeStatusTool(pi));
    pi.registerTool(createAzureCeDiagnoseTool(pi));
    pi.registerTool(createAzureCloudInitAnalyzeTool(pi));
  }

  if (typeof pi.on === 'function') {
    pi.on('before_agent_start', async (event: { prompt?: string }, _ctx: { cwd: string }) => {
      const ceIntent = classifyAzureCePrompt(String(event?.prompt ?? ''));
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
        // The research gate must still be injected when account observation fails.
      }
      const gate =
        ceIntent === 'inventory'
          ? AZURE_CE_INVENTORY_GATE
          : ceIntent === 'deployment'
            ? AZURE_CE_RESEARCH_GATE
            : undefined;
      const content = [...(gate ? [gate] : []), ...accountLines].join('\n');
      if (!content) return;
      return {
        message: {
          customType:
            ceIntent === 'inventory'
              ? 'azure_ce_inventory_gate'
              : ceIntent === 'deployment'
                ? 'azure_ce_research_gate'
                : 'azure_hint',
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
