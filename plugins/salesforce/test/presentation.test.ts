import { expect, test } from 'bun:test';
import { presentation } from '@f5-sales-demo/xcsh/presentation';
import { presentTool as enrichTool } from '../src/presentation';

const presentTool = <T extends { name: string; label?: string }>(tool: T) => enrichTool(tool, presentation);

const options = { expanded: false, isPartial: false };
test('query aggregates retain zero and incomplete-result guidance in the summary', () => {
  const tool = presentTool({ name: 'sf_query', label: 'Salesforce query' });
  const view = tool.presentation.result(
    { content: [], details: { queryResult: { records: [{ total: 0 }], totalSize: 1, done: false } } },
    options,
    {},
  );
  expect(view.summary).toBe('total = 0');
  expect(view.warnings?.join(' ')).toContain('incomplete');
});
test('exec displays a readable exact command and exposes zero JSON aggregates', () => {
  const tool = presentTool({ name: 'sf_exec' });
  expect(
    JSON.stringify(
      tool.presentation.call(
        {
          args: ['data', 'query', '--query', "SELECT Id FROM Opportunity WHERE Name = 'synthetic'"],
        },
        options,
      ),
    ),
  ).toContain('sf data query --query');
  const view = tool.presentation.result(
    {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ result: { records: [{ attributes: { type: 'AggregateResult' }, total: 0 }] } }),
        },
      ],
    },
    options,
    {},
  );
  expect(view.summary).toBe('total = 0');
});
test('describe applies its requested match while retaining total scope', () => {
  const tool = presentTool({ name: 'sf_describe' });
  const view = tool.presentation.result(
    {
      content: [],
      details: {
        described: {
          name: 'Opportunity',
          fields: [
            { name: 'Id', label: 'Identifier', custom: false },
            { name: 'Synthetic__c', label: 'Other', custom: true },
          ],
          childRelationships: [],
        },
      },
    },
    options,
    { match: 'Id' },
  );
  expect(view.summary).toContain('1 matching fields (2 total)');
  expect(JSON.stringify(view.sections)).toContain('Identifier');
  expect(JSON.stringify(view.sections)).not.toContain('Synthetic__c');
});
test('pipeline uses summary tables with warnings and detail records', () => {
  const tool = presentTool({ name: 'sf_pipeline_report' });
  const view = tool.presentation.result(
    {
      content: [],
      details: {
        pipelineReport: {
          netNew: {
            totals: { platform: 0, shape: 0, other: 0 },
            quotaTotal: 0,
            accounts: [{ name: 'Synthetic account', platform: 0 }],
          },
          unavailable: ['Synthetic unavailable section'],
          anomalies: [{ message: 'Synthetic warning' }],
        },
      },
    },
    options,
    {},
  );
  expect(JSON.stringify(view.sections)).toContain('Pipeline summary');
  expect(JSON.stringify(view.sections)).toContain('Synthetic account');
  expect(view.warnings).toContain('Synthetic warning');
});
test('org, help and errors preserve their supplied data', () => {
  for (const name of ['sf_org_display', 'sf_help']) {
    const tool = presentTool({ name });
    expect(
      JSON.stringify(
        tool.presentation.result({ content: [{ type: 'text', text: 'Synthetic help and org output' }] }, options, {}),
      ),
    ).toContain('Synthetic help');
    expect(
      JSON.stringify(
        tool.presentation.result(
          { isError: true, content: [{ type: 'text', text: 'Complete corrective guidance' }] },
          options,
          {},
        ),
      ),
    ).toContain('Complete corrective guidance');
  }
});
