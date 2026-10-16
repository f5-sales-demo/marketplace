import { afterEach, expect, test } from 'bun:test';
import { presentation } from '@f5-sales-demo/xcsh/presentation';
import { Type } from '@sinclair/typebox';
import { configurePersonProfile, configureSalesforceContext } from '../src/context/salesforce-context';
import { generatePipelineReport } from '../src/pipeline-report/generator';
import { renderPipelineReport } from '../src/pipeline-report/renderer';
import { presentTool as enrichTool } from '../src/presentation';

const presentTool = <T extends { name: string; label?: string }>(tool: T) => enrichTool(tool, presentation);

import { execSfJson } from '../src/sf/exec';
import { formatQueryResults } from '../src/sf/formatters';
import { createSfDescribeTool } from '../src/tools/sf-describe';
import { createSfExecTool } from '../src/tools/sf-exec';
import { createSfHelpTool } from '../src/tools/sf-help';
import { createSfOrgDisplayTool } from '../src/tools/sf-org-display';
import { createSfPipelineReportTool, fiscalPeriods } from '../src/tools/sf-pipeline-report';
import { createSfQueryTool } from '../src/tools/sf-query';

const pi = { typebox: { Type } };
const context = { cwd: '/tmp' };
const raw = (result: unknown) => ({ stdout: JSON.stringify({ status: 0, result }), stderr: '', exitCode: 0 });
afterEach(() => {
  configurePersonProfile();
  configureSalesforceContext();
});

test('expanded describe exposes custom fields, relationships and complete picklists', () => {
  const tool = presentTool({ name: 'sf_describe' });
  const result = {
    content: [],
    details: {
      described: {
        name: 'Opportunity',
        fields: [
          { name: 'Product__c', label: 'Product', custom: true, picklistValues: ['XC', 'FINAL_PICKLIST_VALUE'] },
        ],
        childRelationships: [{ childSObject: 'OpportunityLineItem', relationshipName: 'OpportunityLineItems' }],
      },
    },
  };
  const collapsed = tool.presentation.result(result, { expanded: false, isPartial: false }, {});
  const expanded = tool.presentation.result(result, { expanded: true, isPartial: false }, {});
  expect(collapsed.warnings?.join(' ')).toContain('expanded');
  expect(JSON.stringify(expanded.sections)).toContain('Product__c');
  expect(JSON.stringify(expanded.sections)).toContain('OpportunityLineItems');
  expect(JSON.stringify(expanded.sections)).toContain('FINAL_PICKLIST_VALUE');
});

test('CLI output retains content beyond the previous 50K limit and stderr warnings', async () => {
  const output = `${'x'.repeat(50001)}\nFINAL_RECORD`;
  const tool = createSfExecTool(pi, () => ({
    exec: async () => ({ stdout: output, stderr: 'CLI_WARNING', exitCode: 0 }),
  }));
  const result = await tool.execute('large', { args: ['org', 'list'] }, undefined, undefined, context);
  expect(result.content.map((c) => c.text).join('\n')).toContain('FINAL_RECORD');
  expect(result.content.map((c) => c.text).join('\n')).toContain('CLI_WARNING');
});

test('query text preserves null, false, zero, nested fields, pipes and multiline cells', () => {
  const text = formatQueryResults({
    totalSize: 1,
    done: true,
    records: [
      {
        Name: 'Synthetic | 北方\nsecond line',
        Amount: 0,
        IsWon: false,
        NextStep: null,
        Account: { Name: 'Synthetic account', Parent: { Name: 'Synthetic parent' } },
        OpportunityLineItems: { records: [{ Product2: { Name: 'F5 XC' } }], done: false },
      },
    ],
  });
  expect(text).toContain('null');
  expect(text).toContain('false');
  expect(text).toContain('Synthetic parent');
  expect(text).toContain('F5 XC');
  expect(text).not.toContain('[object Object]');
  expect(text).toContain('\\|');
  expect(text).toContain('second line');
});

test('CLI JSON errors cannot appear successful without a message or with nonzero exit', async () => {
  for (const response of [
    { stdout: '{"status":1}', stderr: 'permission denied', exitCode: 1 },
    { stdout: '{"status":0,"result":{}}', stderr: 'process failure', exitCode: 1 },
    { stdout: '', stderr: 'network unavailable', exitCode: 1 },
    { stdout: 'null', stderr: '', exitCode: 0 },
  ]) {
    await expect(execSfJson({ exec: async () => response }, ['data', 'query'])).rejects.toThrow();
  }
});

test('missing query payload is an error, not a verified empty result', async () => {
  const tool = createSfQueryTool(pi, () => ({ exec: async () => raw({}) }));
  const result = await tool.execute('invalid', { query: 'SELECT Id FROM Account' }, undefined, undefined, context);
  expect(result.isError).toBe(true);
});

test('help command failure remains an error', async () => {
  const tool = createSfHelpTool(pi, () => ({
    exec: async () => ({ stdout: '', stderr: 'Unknown command', exitCode: 1 }),
  }));
  const result = await tool.execute('help', { command_path: 'missing' }, undefined, undefined, context);
  expect(result.isError).toBe(true);
  expect(result.content[0].text).toContain('Unknown command');
});

test('org display does not invent a false default-org flag when the CLI omits it', async () => {
  const tool = createSfOrgDisplayTool(pi, () => ({
    exec: async () =>
      raw({ username: 'example@example.com', instanceUrl: 'https://example.com', id: '00D000000000000' }),
  }));
  const result = await tool.execute('org-default-evidence', {}, undefined, undefined, context);
  expect(result.isError).not.toBe(true);
  expect(result.details.orgs?.[0]?.isDefault).toBeUndefined();
});

test('pipeline failures and partial pages never report successful zero totals', async () => {
  configurePersonProfile(async () => ({ identifiers: { salesforceId: '005000000000001' } }));
  configureSalesforceContext(async () => ({ userId: '005000000000001', orgAlias: 'synthetic' }) as never);
  for (const response of [
    {
      stdout: JSON.stringify({ status: 1, name: 'INVALID_FIELD', message: 'Missing synthetic field' }),
      stderr: '',
      exitCode: 1,
    },
    raw({ records: [], totalSize: 100, done: false }),
  ]) {
    const tool = createSfPipelineReportTool(pi, () => ({ exec: async () => response }));
    const result = await tool.execute('pipeline', {}, undefined, undefined, context);
    expect(result.isError).toBe(true);
  }
});

test('pipeline forwards cancellation and reports query progress', async () => {
  configurePersonProfile(async () => ({ identifiers: { salesforceId: '005000000000001' } }));
  configureSalesforceContext(async () => ({ userId: '005000000000001', orgAlias: 'synthetic' }) as never);
  const controller = new AbortController();
  const signals: (AbortSignal | undefined)[] = [];
  const updates: unknown[] = [];
  const tool = createSfPipelineReportTool(pi, () => ({
    exec: async (_command, _args, options) => {
      signals.push(options?.signal);
      return raw({
        records: _args.some((arg) => arg.includes('FROM Period'))
          ? [
              { Type: 'Quarter', StartDate: '2026-08-01', EndDate: '2026-10-31' },
              { Type: 'Year', StartDate: '2025-11-01', EndDate: '2026-10-31' },
            ]
          : [],
        totalSize: 0,
        done: true,
      });
    },
  }));
  await tool.execute('pipeline', {}, controller.signal, (update) => updates.push(update), context);
  expect(signals.length).toBeGreaterThan(0);
  expect(signals.every((signal) => signal === controller.signal)).toBe(true);
  expect(updates.length).toBeGreaterThan(0);
});

test('fallback opportunity amounts have unverified product classification and zero bookings remain visible', async () => {
  const report = await generatePipelineReport(
    { userIds: ['005000000000001'], quarterStart: '2026-10-01', quarterEnd: '2026-12-31' },
    async (query) => {
      if (query.includes('SUM(Amount)')) return [{ total: 0 }];
      if (query.includes('FROM OpportunityLineItem') || query.includes('IsWon = true') || query.includes('Renewal'))
        return [];
      return [
        {
          Id: '006000000000001',
          Name: 'Synthetic unrelated appliance',
          Amount: 100,
          Account: { Name: 'Synthetic' },
          ForecastCategoryName: 'Pipeline',
        },
      ];
    },
  );
  expect(report.netNew.totals.platform).toBe(0);
  expect(report.netNew.totals.other).toBe(100);
  expect(report.fyBookedTotal).toBe(0);
  expect(report.anomalies.some((a) => /product|classif/i.test(a.message))).toBe(true);
  const text = renderPipelineReport(report, '');
  expect(text).toContain('100.00');
  expect(text).toContain('Other');
  expect(text).not.toContain('No open net new pipeline');
  expect(text).toContain('YTD Booked: 0');
  expect(text).not.toContain('$');
});

test('fiscal periods preserve selected-org custom dates across year rollover', () => {
  expect(
    fiscalPeriods([
      { Type: 'Quarter', StartDate: '2026-11-02', EndDate: '2027-02-01' },
      { Type: 'Year', StartDate: '2026-11-02', EndDate: '2027-11-01' },
    ]),
  ).toEqual({ start: '2026-11-02', end: '2027-02-01', yearStart: '2026-11-02', yearEnd: '2027-11-01' });
  expect(() => fiscalPeriods([])).toThrow('not verified');
});

test('all typed data tools preserve real cancellation instead of converting it to an error result', async () => {
  const abort = new DOMException('Synthetic cancellation', 'AbortError');
  const api = () => ({
    exec: async () => {
      throw abort;
    },
  });
  for (const [tool, params] of [
    [createSfQueryTool(pi, api), { query: 'SELECT Id FROM Account' }],
    [createSfDescribeTool(pi, api), { sobject: 'Account' }],
    [createSfOrgDisplayTool(pi, api), {}],
  ] as const) {
    await expect(tool.execute('cancel', params as never, undefined, undefined, context)).rejects.toBe(abort);
  }
});

test('a different target org discovers its own identity and schema before reporting', async () => {
  configurePersonProfile(
    async () =>
      ({
        identifiers: { salesforceId: '005000000000001' },
        territories: ['Wrong org territory'],
        partner: { id: '005000000000003' },
      }) as never,
  );
  configureSalesforceContext(async () => ({ userId: '005000000000001', orgAlias: 'first-org' }) as never);
  const calls: string[][] = [];
  const tool = createSfPipelineReportTool(pi, () => ({
    exec: async (_command, args) => {
      calls.push(args);
      if (args[0] === 'org')
        return raw({ username: 'synthetic@example.com', instanceUrl: 'https://second.example.com' });
      if (args[0] === 'sobject') return raw({ name: args[3], fields: [{ name: 'Id' }], childRelationships: [] });
      const query = args[args.indexOf('--query') + 1] ?? '';
      return raw({
        records: query.includes('FROM User')
          ? [{ Id: '005000000000002' }]
          : query.includes('FROM Period')
            ? [
                { Type: 'Quarter', StartDate: '2026-08-01', EndDate: '2026-10-31' },
                { Type: 'Year', StartDate: '2025-11-01', EndDate: '2026-10-31' },
              ]
            : [],
        done: true,
      });
    },
  }));
  const result = await tool.execute('org-scope', { target_org: 'second-org' }, undefined, undefined, context);
  expect(result.isError).not.toBe(true);
  expect(calls.every((args) => args.includes('second-org'))).toBe(true);
  const queries = calls
    .filter((args) => args.includes('--query'))
    .flat()
    .join(' ');
  expect(queries).toContain('005000000000002');
  expect(queries).not.toContain('005000000000001');
  expect(JSON.stringify(result.details)).not.toContain('Wrong org territory');
});

test('renewal summaries query and preserve owner, stage and next step', async () => {
  const report = await generatePipelineReport(
    {
      userIds: ['005000000000001'],
      quarterStart: '2026-10-01',
      quarterEnd: '2026-12-31',
      capabilities: { opportunityFields: ['Id', 'Name', 'Amount', 'Renewal__c', 'Product_Segmentation__c'] },
    },
    async (query) => {
      if (query.includes('SUM(Amount)')) return [{ total: 0 }];
      if (!query.includes('Renewal__c = true')) return [];
      return [
        {
          Id: '006000000000001',
          Name: 'Example renewal',
          Account: { Name: 'Example' },
          Amount: 100,
          Product_Segmentation__c: 'XC',
          ...(query.includes('Owner.Name') ? { Owner: { Name: 'Example owner' } } : {}),
          ...(query.includes('StageName') ? { StageName: 'Technical validation' } : {}),
          ...(query.includes('NextStep') ? { NextStep: 'Confirm renewal terms' } : {}),
        },
      ];
    },
  );
  expect(report.topRenewals?.[0]?.ownerName).toBe('Example owner');
  expect(report.topRenewals?.[0]?.stage).toBe('Technical validation');
  expect(report.topRenewals?.[0]?.nextStep).toBe('Confirm renewal terms');
});

test('pipeline presentation separates record currencies and does not publish a combined monetary total', async () => {
  const report = await generatePipelineReport(
    {
      userIds: ['005000000000001'],
      quarterStart: '2026-10-01',
      quarterEnd: '2026-12-31',
      capabilities: { opportunityFields: ['CurrencyIsoCode'] },
    },
    async (query) => {
      if (query.includes('SUM(')) return [{ total: 0 }];
      if (!query.includes('FROM Opportunity ') || !query.includes('IsClosed = false')) return [];
      return [
        {
          Id: '006000000000001',
          Account: { Name: 'Example' },
          Name: 'Example CAD',
          Amount: 100,
          CurrencyIsoCode: 'CAD',
        },
        {
          Id: '006000000000002',
          Account: { Name: 'Example' },
          Name: 'Example USD',
          Amount: 200,
          CurrencyIsoCode: 'USD',
        },
      ];
    },
  );
  expect(report.currencyBreakdown?.map((group) => [group.currency, group.netNew.totals.other])).toEqual([
    ['CAD', 100],
    ['USD', 200],
  ]);
  const text = renderPipelineReport(report, '');
  expect(text).toContain('Currency: CAD');
  expect(text).toContain('Currency: USD');
  expect(text).not.toContain('300.00');
  const view = presentTool({ name: 'sf_pipeline_report' }).presentation.result(
    { content: [], details: { pipelineReport: report } },
    { expanded: false, isPartial: false },
    {},
  );
  expect(view.summary).toContain('CAD / USD');
  expect(JSON.stringify(view.sections)).not.toContain('300.00');
});
