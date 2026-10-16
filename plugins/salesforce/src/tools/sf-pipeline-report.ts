import { loadSalesforceContext, readPersonFacts } from '../context/salesforce-context';
import { generatePipelineReport, type SfQueryFn } from '../pipeline-report/generator';
import { renderPipelineReport } from '../pipeline-report/renderer';
import type { PipelineReportData, PipelineReportOptions } from '../pipeline-report/types';
import { DEFAULT_SKU_CLASSIFICATION, DEFAULT_SKU_PREFIXES } from '../pipeline-report/types';
import sfPipelineReportDescription from '../prompts/sf-pipeline-report.md' with { type: 'text' };
import { normalizeDescribe } from '../sf/describe';
import type { SfExecApi } from '../sf/exec';
import { execSfJson } from '../sf/exec';
import { ORG_ALIAS_PATTERN } from '../sf/types';
import type { PluginHost, ToolUpdateCallback } from './plugin-host';
import type { SfErrorType, SfToolDetails } from './shared';
import { detectErrorType, makeExecApi } from './shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function fiscalPeriods(records: Record<string, unknown>[]) {
  const quarter = records.filter((record) => record.Type === 'Quarter');
  const year = records.filter((record) => record.Type === 'Year');
  const validDate = (value: unknown): value is string =>
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`));
  if (
    quarter.length !== 1 ||
    year.length !== 1 ||
    !validDate(quarter[0]?.StartDate) ||
    !validDate(quarter[0]?.EndDate) ||
    !validDate(year[0]?.StartDate) ||
    !validDate(year[0]?.EndDate)
  ) {
    throw new Error(
      'Salesforce fiscal quarter/year periods are unavailable or ambiguous; period totals are not verified.',
    );
  }
  return {
    start: quarter[0].StartDate as string,
    end: quarter[0].EndDate as string,
    yearStart: year[0].StartDate as string,
    yearEnd: year[0].EndDate as string,
  };
}

function buildQueryFn(
  makeApi: (cwd: string) => SfExecApi,
  cwd: string,
  orgAlias?: string,
  signal?: AbortSignal,
  onUpdate?: ToolUpdateCallback,
): SfQueryFn {
  const api = makeApi(cwd);
  let started = 0;
  let completed = 0;
  return async (soql: string, queryOrgAlias?: string): Promise<Record<string, unknown>[]> => {
    const org = queryOrgAlias ?? orgAlias;
    const args = ['data', 'query', '--query', soql];
    if (org) args.push('--target-org', org);
    started++;
    onUpdate?.({
      content: [{ type: 'text', text: `Pipeline queries: ${completed} completed, ${started - completed} running.` }],
      details: { tool: 'sf_pipeline_report' },
    });
    const result = await execSfJson(api, args, signal, soql);
    const data = result.result as { records?: Record<string, unknown>[]; done?: boolean };
    if (!data || !Array.isArray(data.records))
      throw new Error('Invalid pipeline query response: records array is missing. Totals are not verified.');
    if (data.done === false)
      throw new Error(
        'Pipeline query returned incomplete results. Totals are not verified; use a narrower scope or a complete export.',
      );
    completed++;
    onUpdate?.({
      content: [{ type: 'text', text: `Pipeline queries: ${completed} completed, ${started - completed} running.` }],
      details: { tool: 'sf_pipeline_report' },
    });
    return data.records;
  };
}

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

/**
 * `makeApi` is injected by tests so a validation case can assert what the tool lets
 * through without spawning the real CLI.
 */
export function createSfPipelineReportTool(pi: PluginHost, makeApi: (cwd: string) => SfExecApi = makeExecApi) {
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
      signal: AbortSignal | undefined,
      onUpdate: ToolUpdateCallback | undefined,
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

      try {
        const profile = await readPersonFacts();
        let sfContext = await loadSalesforceContext();
        const differentOrg = Boolean(
          params.target_org && params.target_org !== sfContext?.orgAlias && params.target_org !== sfContext?.username,
        );
        // A different target org must never reuse another org's IDs, custom schema or territories.
        if (differentOrg && params.target_org) {
          const api = makeApi(ctx.cwd);
          const target = ['--target-org', params.target_org];
          const org = (await execSfJson(api, ['org', 'display', ...target], signal)).result as {
            username?: string;
            instanceUrl?: string;
          };
          if (!org?.username) throw new Error('Target Salesforce org identity is unavailable.');
          const user = (
            await execSfJson(
              api,
              [
                'data',
                'query',
                '--query',
                `SELECT Id FROM User WHERE Username = '${org.username.replaceAll("'", "\\'")}' LIMIT 1`,
                ...target,
              ],
              signal,
            )
          ).result as { records?: { Id?: string }[] };
          const [opportunity, lineItem] = await Promise.all(
            ['Opportunity', 'OpportunityLineItem'].map(async (sobject) =>
              normalizeDescribe(
                (await execSfJson(api, ['sobject', 'describe', '--sobject', sobject, ...target], signal)).result,
              ),
            ),
          );
          sfContext = {
            userId: user.records?.[0]?.Id ?? '',
            username: org.username,
            instanceUrl: org.instanceUrl ?? '',
            orgAlias: params.target_org,
            opportunityFields: opportunity!.fields.map((f) => f.name),
            lineItemFields: lineItem!.fields.map((f) => f.name),
            collectedAt: new Date().toISOString(),
          };
        }

        const userId = differentOrg ? sfContext?.userId : (profile.identifiers?.salesforceId ?? sfContext?.userId);
        if (!userId) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'No Salesforce user ID found. Run: xcsh plugin setup salesforce, then read `xcsh://user` to confirm your salesforceId is set.',
              },
            ],
            isError: true,
            details: { ...base, errorType: 'auth_required' as SfErrorType },
          };
        }

        const partnerId = differentOrg ? undefined : profile.partner?.id;
        const userIds = partnerId ? [userId, partnerId] : [userId];

        const staleDate = new Date();
        staleDate.setFullYear(staleDate.getFullYear() - 1);
        const staleCutoff = staleDate.toISOString().slice(0, 10);

        const partnerName = profile.partner?.name;
        const selfName = [profile.givenName, profile.familyName].filter(Boolean).join(' ').trim();
        const teamMemberNames = partnerName && selfName ? [selfName, partnerName] : selfName ? [selfName] : undefined;

        const orgAlias = params.target_org ?? sfContext?.orgAlias;

        const queryFn = buildQueryFn(makeApi, ctx.cwd, orgAlias, signal, onUpdate);
        const calendar = await queryFn(
          "SELECT Type, StartDate, EndDate FROM Period WHERE Type IN ('Quarter', 'Year') AND StartDate <= TODAY AND EndDate >= TODAY",
        );
        const { start, end, yearStart, yearEnd } = fiscalPeriods(calendar);

        const options: PipelineReportOptions = {
          userIds,
          orgAlias,
          quarterStart: start,
          quarterEnd: end,
          fiscalYearStart: yearStart,
          fiscalYearEnd: yearEnd,
          staleCutoff,
          confirmedTerritories: differentOrg
            ? undefined
            : (profile.territories ?? sfContext?.confirmedTerritories ?? sfContext?.territories),
          teamMemberNames,
          // Discovered schema, so the report builds only the sections this org can answer.
          // Absent context means "not described" and every section is attempted, as before.
          capabilities: {
            opportunityFields: sfContext?.opportunityFields,
            lineItemFields: sfContext?.lineItemFields,
            territoryField: sfContext?.territoryField,
          },
        };

        const data: PipelineReportData = await generatePipelineReport(options, queryFn);
        const report = renderPipelineReport(data, sfContext?.instanceUrl ?? '');

        return {
          content: [{ type: 'text' as const, text: report }],
          details: {
            ...base,
            pipelineReport: data,
            pipelineEvidence: {
              ...options,
              calendar,
              skuClassification: options.skuClassification ?? DEFAULT_SKU_CLASSIFICATION,
              skuPrefixes: options.skuPrefixes ?? DEFAULT_SKU_PREFIXES,
            },
          },
        };
      } catch (err) {
        if (err instanceof Error && (err.name === 'AbortError' || err.name === 'ToolAbortError')) throw err;
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
