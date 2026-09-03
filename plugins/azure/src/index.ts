import type { PluginInterface } from './az/types';
import type { runSetupWizard } from './wizard';

interface AzureExtensionApi extends PluginInterface {
  exec(command: string, args: string[]): Promise<{ stdout: string; stderr: string; code: number }>;
  setLabel(label: string): void;
  registerCommand?(
    name: string,
    command: {
      description: string;
      handler(args: string, ctx: Parameters<typeof runSetupWizard>[1]): Promise<void>;
    },
  ): void;
  registerTool?(tool: unknown): void;
  registerServiceStatus?(status: unknown): void;
  on?(event: string, handler: unknown): void;
  logger: { debug(message: string): void };
}

type ExtensionFactory = (pi: AzureExtensionApi) => void | Promise<void>;

function sanitizeHintField(value: unknown, maxLen = 200): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[^\x20-\x7E]/g, '').slice(0, maxLen);
}

export function isAzureCePrompt(prompt: string): boolean {
  const normalized = prompt.toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  const azureContext = /\bazure\b|\bmarketplace\b/.test(normalized);
  const ceContext =
    /\bcustomer edge\b|\bf5 ce\b|\bxc ce\b|\bsecure mesh\b|\bce site\b|\bce node\b|\bce image\b/.test(normalized) ||
    /\bf5\b.*\b(distributed cloud|xc|edge|appliance|route server|bgp)\b/.test(normalized) ||
    /\bdistributed cloud\b.*\b(node|edge|appliance|azure|marketplace)\b/.test(normalized);
  return azureContext && ceContext;
}

export const AZURE_CE_RESEARCH_GATE = [
  'AZURE CUSTOMER EDGE ROUTE: Use the azure:azure-ce workflow for this request.',
  'Before any recommendation or azure_ce_plan call, use web_search to retrieve and read the dedicated f5xc-ce-automation/v1 contract from f5-sales-demo.github.io, the current official F5 Secure Mesh Site v2 Azure deployment guide from docs.cloud.f5.com, and Microsoft Marketplace image and subscription-aware VM SKU guidance from learn.microsoft.com.',
  'Then call az_account_show and azure_compute_discover. Omit publisher, offer, plan, version, and vmSize unless the user explicitly pinned them; live discovery must enumerate those values.',
  'Require the validated shared-contract identity and normalized digest, the azure-cli-live provider-source receipts, and the discovery artifact. Never guess identifiers, use generic az_exec for CE research, plan before discovery, or mutate without approval.',
].join('\n');

const factory: ExtensionFactory = async (pi) => {
  pi.setLabel('Azure');

  if (typeof pi.registerCommand === 'function') {
    pi.registerCommand('azure:setup', {
      description: 'Install and configure Azure CLI and optional extensions',
      async handler(_args: string, ctx: Parameters<typeof runSetupWizard>[1]) {
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
    const { createAzResourceGraphQueryTool } = await import('./tools/az-resource-graph-query');
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
    pi.registerTool(createAzExecTool(pi));
    pi.registerTool(createAzHelpTool(pi));
    pi.registerTool(createAzureComputeDiscoverTool(pi));
    pi.registerTool(createAzureCePlanTool(pi));
    pi.registerTool(createAzureCeApplyTool(pi));
    pi.registerTool(createAzureCeStatusTool(pi));
    pi.registerTool(createAzureCeDiagnoseTool(pi));
    pi.registerTool(createAzureCloudInitAnalyzeTool(pi));
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

  if (typeof pi.on === 'function') {
    pi.on('before_agent_start', async (event: { prompt?: string }, ctx: { cwd: string }) => {
      const ceRequest = isAzureCePrompt(String(event?.prompt ?? ''));
      const accountLines: string[] = [];
      try {
        if (!azAvailable) throw new Error('az CLI unavailable');
        const cwd = ctx?.cwd || process.cwd();
        const result = Bun.spawnSync(['az', 'account', 'show', '--output', 'json'], { cwd });
        if (result.exitCode === 0) {
          const account = JSON.parse(new TextDecoder().decode(result.stdout));
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
      const content = [...(ceRequest ? [AZURE_CE_RESEARCH_GATE] : []), ...accountLines].join('\n');
      if (!content) return;
      return {
        message: {
          customType: ceRequest ? 'azure_ce_research_gate' : 'azure_hint',
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
