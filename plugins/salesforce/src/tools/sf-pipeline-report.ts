import { getLoadProfile, loadSalesforceContext } from '../context/salesforce-context';
import { generatePipelineReport, type SfQueryFn } from '../pipeline-report/generator';
import { renderPipelineReport } from '../pipeline-report/renderer';
import type { PipelineReportData, PipelineReportOptions } from '../pipeline-report/types';
import sfPipelineReportDescription from '../prompts/sf-pipeline-report.md' with { type: 'text' };
import { execSfJson } from '../sf/exec';
import { ORG_ALIAS_PATTERN } from '../sf/types';
import type { SfErrorType, SfToolDetails } from './shared';
import { detectErrorType, makeExecApi } from './shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fiscalQuarterDates(): { start: string; end: string } {
  const now = new Date();
  const m = now.getMonth();
  const y = now.getFullYear();

  let start: Date;
  let end: Date;

  if (m >= 10) {
    start = new Date(y, 10, 1);
    end = new Date(y + 1, 1, 0);
  } else if (m === 0) {
    start = new Date(y - 1, 10, 1);
    end = new Date(y, 1, 0);
  } else if (m <= 3) {
    start = new Date(y, 1, 1);
    end = new Date(y, 4, 0);
  } else if (m <= 6) {
    start = new Date(y, 4, 1);
    end = new Date(y, 7, 0);
  } else {
    start = new Date(y, 7, 1);
    end = new Date(y, 10, 0);
  }

  const fmt = (d: Date) => d.toISOString().split('T')[0]!;
  return { start: fmt(start), end: fmt(end) };
}

function buildQueryFn(cwd: string, orgAlias?: string): SfQueryFn {
  const api = makeExecApi(cwd);
  return async (soql: string, queryOrgAlias?: string): Promise<Record<string, unknown>[]> => {
    const org = queryOrgAlias ?? orgAlias;
    const args = ['data', 'query', '--query', soql];
    if (org) args.push('--target-org', org);
    try {
      const result = await execSfJson(api, args, undefined, soql);
      const data = result.result as { records?: Record<string, unknown>[] };
      return data.records ?? [];
    } catch {
      return [];
    }
  };
}

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

export function createSfPipelineReportTool(pi: any) {
  const { Type } = pi.typebox;

  const parameters = Type.Object({
    target_org: Type.Optional(Type.String({ description: 'Org alias or username to run report against' })),
  });

  return {
    name: 'sf_pipeline_report',
    label: 'Salesforce Pipeline Report',
    description: sfPipelineReportDescription,
    parameters,
    async execute(
      _toolCallId: string,
      params: { target_org?: string },
      _signal: any,
      _onUpdate: any,
      ctx: { cwd: string },
    ) {
      const base: SfToolDetails = { tool: 'sf_pipeline_report' };

      if (params.target_org && !ORG_ALIAS_PATTERN.test(params.target_org)) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error: invalid org alias "${params.target_org}". Only alphanumeric characters, dots, underscores, hyphens, and @ are allowed.`,
            },
          ],
          isError: true,
          details: { ...base, errorType: 'exec_error' as SfErrorType },
        };
      }

      const loadProfile = getLoadProfile();
      const profile = loadProfile ? await loadProfile() : ({} as any);
      const sfContext = await loadSalesforceContext();

      const userId = profile.identifiers?.salesforceId;
      if (!userId) {
        return {
          content: [
            {
              type: 'text' as const,
              text: "No Salesforce user ID found. Run sf_setup with action 'status' first, then read `xcsh://user` to confirm your salesforceId is set.",
            },
          ],
          isError: true,
          details: { ...base, errorType: 'auth_required' as SfErrorType },
        };
      }

      const partnerId = profile.partner?.id;
      const userIds = partnerId ? [userId, partnerId] : [userId];
      const { start, end } = fiscalQuarterDates();

      const staleDate = new Date();
      staleDate.setFullYear(staleDate.getFullYear() - 1);
      const staleCutoff = staleDate.toISOString().split('T')[0]!;

      const partnerName = profile.partner?.name;
      const selfName = [profile.givenName, profile.familyName].filter(Boolean).join(' ').trim();
      const teamMemberNames = partnerName && selfName ? [selfName, partnerName] : selfName ? [selfName] : undefined;

      const orgAlias = params.target_org ?? sfContext?.orgAlias;

      const options: PipelineReportOptions = {
        userIds,
        orgAlias,
        quarterStart: start,
        quarterEnd: end,
        staleCutoff,
        confirmedTerritories: profile.territories ?? sfContext?.confirmedTerritories ?? sfContext?.territories,
        teamMemberNames,
      };

      try {
        const queryFn = buildQueryFn(ctx.cwd, orgAlias);
        const data: PipelineReportData = await generatePipelineReport(options, queryFn);
        const report = renderPipelineReport(data, sfContext?.instanceUrl ?? '');

        return {
          content: [{ type: 'text' as const, text: report }],
          details: { ...base, pipelineReport: data },
        };
      } catch (err) {
        const errorType = detectErrorType(err);
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: message }],
          isError: true,
          details: { ...base, errorType },
        };
      }
    },
  };
}
