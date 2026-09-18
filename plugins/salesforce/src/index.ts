import type { ExtensionFactory } from '@f5-sales-demo/xcsh';
import { mapSalesforceToProfile } from './context/profile-mapper';
import type { SalesforceContext, UserProfile } from './context/salesforce-context';
import type { SfToolDetails } from './tools/shared';
import { detectErrorType, errorResult, renderError } from './tools/shared';

interface IntegrationApi {
  integrations: {
    register<T>(definition: unknown): { get(signal?: AbortSignal): Promise<{ state: string; value?: T }> };
  };
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

export function withErrorType<T extends { name?: string; execute: (...args: never[]) => Promise<unknown> }>(
  tool: T,
): T {
  const originalExecute = tool.execute.bind(tool) as (...args: unknown[]) => Promise<unknown>;
  const toolName = tool.name as SfToolDetails['tool'];
  return {
    ...tool,
    execute: (async (...args: unknown[]) => {
      try {
        return await originalExecute(...args);
      } catch (err) {
        if (err instanceof Error && (err.name === 'AbortError' || err.name === 'ToolAbortError')) throw err;
        return errorResult(renderError(err), { tool: toolName, errorType: detectErrorType(err) });
      }
    }) as T['execute'],
  };
}

type CanonicalExtensionAPI = Parameters<ExtensionFactory>[0] &
  IntegrationApi & {
    personProfile: { get(): Promise<{ facts: UserProfile }> };
  };

const HUMAN_SALESFORCE_USER_TYPES = new Set([
  'standard',
  'powerpartner',
  'partnercommunity',
  'customerportal',
  'customercommunity',
  'cspliteportal',
  'cspuser',
  'highvolumeportal',
]);

const factory = async (pi: CanonicalExtensionAPI) => {
  if (!pi.personProfile || typeof pi.personProfile.get !== 'function') {
    throw new Error('Salesforce plugin requires the xcsh personProfile API');
  }
  const { configurePersonProfile, configureSalesforceContext } = await import('./context/salesforce-context');
  configurePersonProfile(async () => (await pi.personProfile.get()).facts);
  pi.setLabel('Salesforce');

  const integration = pi.integrations.register<SalesforceContext>({
    id: 'salesforce',
    name: 'Salesforce',
    plugin: 'salesforce',
    kind: 'network',
    setup: {
      pluginDependencies: [],
      requiredEnvironment: [],
      profileFields: ['accounts', 'identifiers', 'manager', 'partner', 'territories', 'role'],
      steps: [
        {
          kind: 'install',
          argv: ['npm', 'install', '--global', '@salesforce/cli'],
          timeoutMs: 300_000,
        },
        {
          kind: 'login',
          argv: ['sf', 'org', 'login', 'web', '--set-default', '--alias', 'SFDC'],
          timeoutMs: 300_000,
          stdin: 'inherit',
        },
      ],
      verification: [{ argv: ['sf', 'org', 'display', '--json'], timeoutMs: 30_000 }],
    },
    async probe() {
      const checker = process.platform === 'win32' ? 'where' : 'which';
      if (Bun.spawnSync([checker, 'sf']).exitCode !== 0) return { state: 'setup_required', reason: 'cli_missing' };
      const org = Bun.spawnSync(['sf', 'org', 'display', '--json']);
      if (org.exitCode !== 0) {
        const rawError = new TextDecoder().decode(org.stderr);
        const error = rawError.toLowerCase();
        if (/rate limit|too many requests|request_limit_exceeded|429/.test(error))
          return { state: 'rate_limited', reason: 'rate_limited', retryAfterMs: retryAfterMsFromHeaders(rawError) };
        if (error.includes('expired')) return { state: 'setup_required', reason: 'expired' };
        if (error.includes('denied') || error.includes('forbidden'))
          return { state: 'unavailable', reason: 'permission_denied' };
        if (error.includes('connect') || error.includes('network')) return { state: 'unavailable', reason: 'network' };
        return { state: 'setup_required', reason: 'not_authenticated' };
      }
      const { seedSalesforceContext } = await import('./context/salesforce-context');
      const value = await seedSalesforceContext();
      return value ? { state: 'ready', value } : { state: 'error', reason: 'invalid_response' };
    },
    profile(value: SalesforceContext) {
      const userType = value.userType?.toLowerCase();
      const principalType = userType ? (HUMAN_SALESFORCE_USER_TYPES.has(userType) ? 'user' : 'service') : 'unknown';
      return {
        facts: {
          ...(principalType === 'user' ? mapSalesforceToProfile(value) : {}),
          ...(principalType === 'user' ? { identifiers: { salesforceId: value.userId } } : {}),
          accounts: [
            {
              provider: 'salesforce',
              identifier: value.userId,
              principalType,
              accountId: value.instanceUrl,
              username: value.username,
            },
          ],
        },
        observations: [],
      };
    },
  });
  configureSalesforceContext(async () => {
    const snapshot = await integration.get();
    return snapshot.state === 'ready' ? (snapshot.value ?? null) : null;
  });

  let sfAvailable = false;
  try {
    const checker = process.platform === 'win32' ? 'where' : 'which';
    sfAvailable = Bun.spawnSync([checker, 'sf']).exitCode === 0;
  } catch {}

  if (sfAvailable) {
    const { createSfQueryTool } = await import('./tools/sf-query');
    const { createSfOrgDisplayTool } = await import('./tools/sf-org-display');
    const { createSfPipelineReportTool } = await import('./tools/sf-pipeline-report');
    const { createSfHelpTool } = await import('./tools/sf-help');
    const { createSfExecTool } = await import('./tools/sf-exec');
    const { createSfDescribeTool } = await import('./tools/sf-describe');
    for (const tool of [
      createSfQueryTool(pi),
      createSfDescribeTool(pi),
      createSfOrgDisplayTool(pi),
      createSfPipelineReportTool(pi),
      createSfHelpTool(pi),
      createSfExecTool(pi),
    ])
      pi.registerTool(withErrorType(tool));

    pi.on('before_agent_start', async () => {
      const { buildSalesforceHint } = await import('./context/salesforce-context');
      const snapshot = await integration.get();
      if (snapshot.state !== 'ready' || !snapshot.value) return;
      const hint = buildSalesforceHint(snapshot.value);
      if (!hint) return;
      const lines = [
        `Pipeline: ${hint.pipelineTotal} (${hint.dealCount} deals, ${hint.accountCount} accounts)`,
        hint.territories ? `Territories: ${hint.territories}` : '',
        hint.forecastBreakdown ? `Forecast: ${hint.forecastBreakdown}` : '',
        hint.partnerName ? `Partner: ${hint.partnerName} (${hint.partnerRole ?? 'Partner'})` : '',
        hint.orgAlias ? `Org: ${hint.orgAlias}` : '',
        hint.stages ? `Opportunity stages (this org): ${hint.stages}` : '',
        hint.forecastCategories ? `Forecast categories (this org): ${hint.forecastCategories}` : '',
        hint.territoryField ? `Territory field (this org): ${hint.territoryField}` : '',
      ]
        .filter(Boolean)
        .join('\n');
      return { message: { customType: 'salesforce_hint', content: lines, display: false } };
    });
  }

  pi.on('session_start', () => {
    if (!sfAvailable) pi.logger.debug('Salesforce: sf CLI not found');
  });
};

export default factory;
