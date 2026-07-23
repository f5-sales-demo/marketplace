import type { ExtensionFactory } from '@f5-sales-demo/xcsh';
import type { SfToolDetails } from './tools/shared';
import { detectErrorType, errorResult, renderError } from './tools/shared';

/**
 * Wrap a factory tool so any error that still propagates out of its execute()
 * is converted into a structured error result carrying details.errorType.
 *
 * The per-tool handlers already catch Sf*Error and return their own
 * errorResult(message, { ...base, errorType }); those never reach this wrapper.
 * A genuine cancellation (xcsh's ToolAbortError, or the web-standard AbortError
 * raised when an AbortSignal fires) is re-thrown untouched so the agent loop can
 * distinguish user cancellation from a real tool failure. Cancellation is matched
 * by error name (not instanceof) to avoid a runtime dependency on xcsh internals.
 */
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

const factory: ExtensionFactory = async (pi) => {
  pi.setLabel('Salesforce');

  // Always register setup command (even without sf CLI)
  if (typeof pi.registerCommand === 'function') {
    pi.registerCommand('salesforce:setup', {
      description: 'Install and configure Salesforce CLI',
      async handler(_args, ctx) {
        const { runSetupWizard } = await import('./wizard');
        await runSetupWizard(pi, ctx);
      },
    });
  }

  // Check if sf CLI is available
  let sfAvailable = false;
  try {
    const checker = process.platform === 'win32' ? 'where' : 'which';
    sfAvailable = Bun.spawnSync([checker, 'sf']).exitCode === 0;
  } catch {
    // sf not available
  }

  // Only register tools when sf CLI is present
  if (sfAvailable) {
    // Inject loadProfile dependency
    const { setLoadProfile } = await import('./context/salesforce-context');
    if (pi.pi?.loadProfile) {
      setLoadProfile(pi.pi.loadProfile);
    }

    // Register profile collector for person-data sync
    if (typeof pi.registerProfileCollector === 'function') {
      pi.registerProfileCollector({
        id: 'salesforce',
        name: 'Salesforce',
        authoritativeFields: ['manager', 'partner', 'territories'],
        async available() {
          const { loadSalesforceContext, getLoadProfile } = await import('./context/salesforce-context');
          const ctx = await loadSalesforceContext();
          if (ctx) return true;
          const loader = getLoadProfile();
          if (loader) {
            const profile = await loader();
            return !!profile.identifiers?.salesforceId;
          }
          const os = await import('node:os');
          const path = await import('node:path');
          try {
            const profile = await Bun.file(path.join(os.homedir(), '.xcsh', 'user-profile.json')).json();
            return !!profile?.identifiers?.salesforceId;
          } catch {
            return false;
          }
        },
        async collect() {
          const {
            loadSalesforceContext,
            salesforceContextIsStale,
            seedSalesforceContext,
            getLoadProfile,
            setLoadProfile,
          } = await import('./context/salesforce-context');
          if (!getLoadProfile()) {
            const os = await import('node:os');
            const path = await import('node:path');
            setLoadProfile(async () => {
              try {
                return await Bun.file(path.join(os.homedir(), '.xcsh', 'user-profile.json')).json();
              } catch {
                return {};
              }
            });
          }
          const { mapSalesforceToProfile } = await import('./context/profile-mapper');
          let ctx = await loadSalesforceContext();
          if (!ctx || salesforceContextIsStale(ctx)) {
            ctx = await seedSalesforceContext();
          }
          if (!ctx) return {};
          return mapSalesforceToProfile(ctx);
        },
      });
    }

    // Register tools
    const { createSfSetupTool } = await import('./tools/sf-setup');
    const { createSfQueryTool } = await import('./tools/sf-query');
    const { createSfOrgDisplayTool } = await import('./tools/sf-org-display');
    const { createSfPipelineReportTool } = await import('./tools/sf-pipeline-report');
    const { createSfHelpTool } = await import('./tools/sf-help');
    const { createSfExecTool } = await import('./tools/sf-exec');

    pi.registerTool(withErrorType(createSfSetupTool(pi)));
    pi.registerTool(withErrorType(createSfQueryTool(pi)));
    pi.registerTool(withErrorType(createSfOrgDisplayTool(pi)));
    pi.registerTool(withErrorType(createSfPipelineReportTool(pi)));
    pi.registerTool(withErrorType(createSfHelpTool(pi)));
    pi.registerTool(withErrorType(createSfExecTool(pi)));

    // Context injection (only when sf available)
    pi.on('before_agent_start', async () => {
      const { loadSalesforceContext, buildSalesforceHint } = await import('./context/salesforce-context');
      const sfContext = await loadSalesforceContext();
      if (!sfContext) return;
      const hint = buildSalesforceHint(sfContext);
      if (!hint) return;
      const lines = [
        `Pipeline: ${hint.pipelineTotal} (${hint.dealCount} deals, ${hint.accountCount} accounts)`,
        hint.territories ? `Territories: ${hint.territories}` : '',
        hint.forecastBreakdown ? `Forecast: ${hint.forecastBreakdown}` : '',
        hint.partnerName ? `Partner: ${hint.partnerName} (${hint.partnerRole ?? 'Partner'})` : '',
        hint.orgAlias ? `Org: ${hint.orgAlias}` : '',
      ]
        .filter(Boolean)
        .join('\n');
      return {
        message: { customType: 'salesforce_hint', content: lines, display: false },
      };
    });
  }

  // Always register service status (shows unavailable when CLI missing)
  if (typeof pi.registerServiceStatus === 'function') {
    pi.registerServiceStatus({
      name: 'Salesforce',
      async check() {
        try {
          const whichChecker = process.platform === 'win32' ? 'where' : 'which';
          const whichResult = Bun.spawnSync([whichChecker, 'sf']);
          if (whichResult.exitCode !== 0) {
            return { state: 'unavailable', hint: 'run: /salesforce:setup' };
          }
          const { execSfJson } = await import('./sf/exec');
          const { collectAllOrgs, makeExecApi } = await import('./tools/shared');
          const api = makeExecApi(process.cwd());
          const orgResult = await execSfJson(api, ['org', 'list']);
          const allOrgs = collectAllOrgs(orgResult.result as Record<string, unknown[]>);
          if (allOrgs.length === 0) return { state: 'unauthenticated', hint: 'run: /salesforce:setup' };
          const defaultOrg = allOrgs.find((o) => o.isDefault);
          if (!defaultOrg) return { state: 'unauthenticated', hint: 'run: /salesforce:setup' };
          if (defaultOrg.connectedStatus === 'Connected') return { state: 'connected' };
          return { state: 'unauthenticated', hint: 'session expired, run: /salesforce:setup' };
        } catch {
          return { state: 'unavailable', hint: 'sf CLI check failed' };
        }
      },
    });
  }

  // Session start: notify if CLI missing; probe org connectivity in the background
  // (non-blocking). The org check is diagnostic-only (debug log) — never block the
  // TUI paint for it.
  pi.on('session_start', (_event: unknown, ctx: { cwd: string }) => {
    if (!sfAvailable) {
      pi.logger.debug('Salesforce: sf CLI not found');
      return;
    }
    void (async () => {
      try {
        const { execSfJson } = await import('./sf/exec');
        const { collectAllOrgs, makeExecApi } = await import('./tools/shared');
        const api = makeExecApi(ctx.cwd);
        const orgResult = await execSfJson(api, ['org', 'list']);
        const allOrgs = collectAllOrgs(orgResult.result as Record<string, unknown[]>);
        if (allOrgs.length === 0) {
          pi.logger.debug('Salesforce: no authenticated orgs');
        }
      } catch {
        pi.logger.debug('Salesforce: welcome check failed (non-fatal)');
      }
    })();
  });
};

export default factory;
