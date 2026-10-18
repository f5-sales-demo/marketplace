import { expect, test } from 'bun:test';
import { presentation } from '@f5-sales-demo/xcsh/presentation';
import { presentTool } from '../src/presentation';
import type { Args, Result } from '../src/presentation/shared';

const render = (name: string, result: Result, expanded = false, args: Args = {}) =>
  presentTool({ name }, presentation, (key) => `host:${key}`).presentation.result(
    result,
    { expanded, isPartial: false },
    args,
  );

test('missing cells use one quiet legend while zero false empty and customer text survive', () => {
  const result = {
    content: [],
    details: {
      queryResult: {
        records: [
          { Name: 'No value | Not returned', Amount: 0, Flag: false, Empty: '', Nullable: null },
          { Name: 'Second', Amount: 4, Flag: true, Empty: '' },
        ],
        done: true,
        totalSize: 2,
      },
    },
  };
  const view = render('sf_query', result);
  const table = view.sections.find((s) => s.kind === 'table');
  expect(table?.kind === 'table' && table.rows[0]).toMatchObject({
    Name: 'No value | Not returned',
    Amount: '0',
    Flag: false,
    Empty: '',
    Nullable: 'host:status.disabled',
  });
  expect(view.sections.filter((s) => s.kind === 'markdown' && s.text === 'host:status.disabled No value')).toHaveLength(
    1,
  );
  const metadata = render('sf_query', result, true).sections.find((s) => s.title === 'Metadata');
  expect(metadata?.kind).toBe('code');
  const raw = metadata?.kind === 'code' ? JSON.parse(metadata.text).queryResult.records : [];
  expect(raw[0].Nullable).toBeNull();
  expect('Nullable' in raw[1]).toBe(false);
});
test('optional org values stay quiet and missing connection is never inferred', () => {
  const result = {
    content: [],
    details: {
      orgEvidence: {
        username: 'synthetic@example.com',
        instanceUrl: 'https://salesforce.example.com',
        alias: '',
        id: null,
        isDefaultUsername: false,
      },
    },
  };
  const collapsed = JSON.stringify(render('sf_org_display', result));
  expect(collapsed).toContain('Connection unknown');
  expect(collapsed).not.toContain('Alias');
  expect(collapsed).not.toContain('Org ID');
  expect(collapsed).not.toContain('isDefaultUsername');
  expect(JSON.stringify(render('sf_org_display', result, true))).toContain('isDefaultUsername');
});
test('unsupported renewals never show zero and known warnings summarize once with originals in expansion', () => {
  const zero = { totals: { platform: 0, shape: 0, other: 0 }, quotaTotal: 0, accounts: [] };
  const group = {
    netNew: zero,
    booked: zero,
    renewals: zero,
    forecast: { commit: 0 },
    topDeals: [],
    topRenewals: [],
    closeDistribution: [],
    renewalDistribution: [],
  };
  const result = {
    content: [],
    details: {
      pipelineReport: {
        currencyBreakdown: [
          { currency: 'CAD', ...group },
          { currency: 'USD', ...group },
        ],
        fyBookedTotal: 987654321,
        unavailable: ['Renewals section: missing custom renewal field'],
        anomalies: [
          {
            category: 'stalled-deals',
            severity: 'warning',
            message: 'Original no activity in >30 days',
            details: 'no activity recorded',
          },
          { category: 'stalled-deals', severity: 'warning', message: 'Second original activity warning' },
          {
            category: 'unverified_product_classification',
            severity: 'warning',
            message: 'Full SKU classification explanation',
          },
          { category: 'unfamiliar', severity: 'warning', message: 'Unfamiliar warning '.repeat(100) },
        ],
      },
    },
  };
  const collapsed = render('sf_pipeline_report', result);
  const text = JSON.stringify(collapsed);
  expect(text).toContain('Renewals unavailable');
  expect(text).not.toContain('Renewals by account');
  expect(text).not.toContain('987654321');
  expect(text).not.toContain('>30 days');
  expect(
    collapsed.sections.filter((s) => s.kind === 'markdown' && s.text.endsWith('Activity needs review')),
  ).toHaveLength(1);
  expect(text).toContain('quota eligibility unknown');
  expect(text).toContain('Unfamiliar warning '.repeat(100));
  expect(collapsed.sections.filter((s) => s.kind === 'markdown' && s.text.startsWith('No records'))).toHaveLength(2);
  for (const s of collapsed.sections.filter((s) => s.kind === 'table' && s.title?.startsWith('Pipeline summary'))) {
    if (s.kind === 'table') expect(s.rows.map((r) => r.section)).toEqual(['Net new', 'Booked']);
  }
  const expanded = JSON.stringify(render('sf_pipeline_report', result, true));
  expect(expanded).toContain('Second original activity warning');
  expect(expanded).toContain('Full SKU classification explanation');
  expect(expanded).toContain('987,654,321');
});
test('empty help and relationship sections are omitted', () => {
  const help = render('sf_help', {
    content: [{ type: 'text', text: 'Purpose\nUSAGE\n sf version\nFLAGS\nEXAMPLES\n' }],
  });
  expect(help.sections.map((s) => s.title).filter(Boolean)).toEqual(['Usage']);
  const schema = render(
    'sf_describe',
    {
      content: [],
      details: { described: { fields: [{ name: 'Name', label: 'Name', type: 'string' }], childRelationships: [] } },
    },
    false,
    { match: 'Name' },
  );
  expect(JSON.stringify(schema)).not.toContain('Child relationships');
  expect(JSON.stringify(schema)).not.toContain('0 fields');
});

test('normal connected status is quiet while explicit connection problems remain visible', () => {
  for (const status of ['Connected', 'Disconnected']) {
    const result = {
      content: [],
      details: {
        orgEvidence: {
          username: 'synthetic@example.com',
          instanceUrl: 'https://salesforce.example.com',
          connectedStatus: status,
        },
      },
    };
    const view = render('sf_org_display', result);
    expect(JSON.stringify(view).includes(status)).toBe(status !== 'Connected');
    expect(JSON.stringify(render('sf_org_display', result, true))).toContain(status);
  }
});
