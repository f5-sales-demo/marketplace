import {
  configurationFingerprint,
  loadOrgConfiguration,
  pipelineCapabilities,
  queryRecords,
  resolveIdentity,
  sameIdentity,
} from '../configuration';
import { rememberSalesforceReport } from '../context/salesforce-context';
import { generatePipelineReport, type SfQueryFn } from '../pipeline-report/generator';
import { renderPipelineReport } from '../pipeline-report/renderer';
import type { PipelineReportData, PipelineReportOptions } from '../pipeline-report/types';
import sfPipelineReportDescription from '../prompts/sf-pipeline-report.md' with { type: 'text' };
import type { SfExecApi } from '../sf/exec';
import { execSfJson } from '../sf/exec';
import { sanitize } from '../sf/sanitize';
import { ORG_ALIAS_PATTERN } from '../sf/types';
import type { PluginHost, ToolUpdateCallback } from './plugin-host';
import type { SfErrorType, SfToolDetails } from './shared';
import { detectErrorType, makeExecApi, withCommandEvidence } from './shared';

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
    const data = result.result as { records?: Record<string, unknown>[]; done?: boolean; totalSize?: number };
    if (!data || !Array.isArray(data.records))
      throw new Error('Invalid pipeline query response: records array is missing. Totals are not verified.');
    if (data.done !== true || (typeof data.totalSize === 'number' && data.totalSize > data.records.length))
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

  return withCommandEvidence({
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
        const api = makeApi(ctx.cwd);
        const identity = await resolveIdentity(api, params.target_org, signal);
        const configurationBefore = await configurationFingerprint();
        const config = await loadOrgConfiguration(api, identity, signal);
        const orgAlias = identity.username;
        const queryFn = buildQueryFn(makeApi, ctx.cwd, orgAlias, signal, onUpdate);
        let calendar: Record<string, unknown>[] = [];
        let periods: ReturnType<typeof fiscalPeriods> | undefined;
        const unavailable: string[] = [];
        try {
          calendar = await queryRecords(
            api,
            "SELECT Type, StartDate, EndDate FROM Period WHERE Type IN ('Quarter', 'Year') AND StartDate <= TODAY AND EndDate >= TODAY",
            identity,
            signal,
          );
          periods = fiscalPeriods(calendar);
        } catch (error) {
          signal?.throwIfAborted();
          if (/REQUEST_LIMIT_EXCEEDED|429|rate limit/i.test(String(error))) throw error;
          unavailable.push('Fiscal periods unavailable; quarter and fiscal-year bookings are not verified.');
        }
        const options: PipelineReportOptions = {
          userIds: [identity.userId],
          orgAlias,
          quarterStart: periods?.start,
          quarterEnd: periods?.end,
          fiscalYearStart: periods?.yearStart,
          fiscalYearEnd: periods?.yearEnd,
          teamMemberNames: [identity.username],
          mappings: config.mappings,
          unavailable: [...config.discovery.unavailable, ...unavailable],
          capabilities: pipelineCapabilities(config),
        };

        const data: PipelineReportData = await generatePipelineReport(options, queryFn);
        if (!sameIdentity(identity, await resolveIdentity(api, params.target_org, signal)))
          throw new Error('Salesforce organization changed during report; discard the report and retry.');
        if (configurationBefore !== (await configurationFingerprint()))
          throw new Error('Salesforce configuration changed during report; discard the report and retry.');
        await rememberSalesforceReport(identity, data, config.revision);
        const report = renderPipelineReport(data, identity.instanceUrl);

        return {
          content: [{ type: 'text' as const, text: report }],
          details: {
            ...base,
            pipelineReport: data,
            pipelineEvidence: {
              ...options,
              calendar,
              identity,
              configurationRevision: config.revision,
            },
          },
        };
      } catch (err) {
        if (err instanceof Error && (err.name === 'AbortError' || err.name === 'ToolAbortError')) throw err;
        const errorType = detectErrorType(err);
        const message = sanitize(err instanceof Error ? err.message : String(err));
        return {
          content: [{ type: 'text' as const, text: message }],
          isError: true,
          details: { ...base, errorType },
        };
      }
    },
  });
}
