import type { ExtensionFactory } from '@f5-sales-demo/xcsh';

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

    pi.registerTool(createSfSetupTool(pi));
    pi.registerTool(createSfQueryTool(pi));
    pi.registerTool(createSfOrgDisplayTool(pi));
    pi.registerTool(createSfPipelineReportTool(pi));

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

  // Session start: notify if CLI missing, check org connectivity if available
  pi.on('session_start', async (_event: unknown, ctx: { cwd: string }) => {
    if (!sfAvailable) {
      pi.logger.debug('Salesforce: sf CLI not found');
      return;
    }
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
  });
};

export default factory;
