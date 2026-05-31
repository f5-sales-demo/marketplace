import type { ExtensionFactory } from '@f5xc-salesdemos/xcsh';

const factory: ExtensionFactory = async (pi) => {
  pi.setLabel('Salesforce');

  // Check if sf CLI is available
  try {
    const result = Bun.spawnSync(['which', 'sf']);
    if (result.exitCode !== 0) {
      pi.logger.debug('Salesforce CLI (sf) not found — skipping tool registration');
      return;
    }
  } catch {
    pi.logger.debug('Salesforce CLI (sf) not found — skipping tool registration');
    return;
  }

  // Inject loadProfile dependency from xcsh's internal API
  const { setLoadProfile } = await import('./context/salesforce-context');
  if (pi.pi?.loadProfile) {
    setLoadProfile(pi.pi.loadProfile);
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

  // Context injection — inject Salesforce pipeline hint before each agent turn
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

  // Welcome check — verify org connectivity at session start (non-fatal)
  pi.on('session_start', async (_event: unknown, ctx: { cwd: string }) => {
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
