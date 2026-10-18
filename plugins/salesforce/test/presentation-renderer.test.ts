import { expect, test } from 'bun:test';
import { presentation } from '@f5-sales-demo/xcsh/presentation';
import { presentTool } from '../src/presentation';

const theme = {
  fg: (_key: string, text: string) => text,
  bold: (text: string) => text,
  boxSharp: {
    horizontal: '-',
    vertical: '|',
    topLeft: '+',
    topRight: '+',
    bottomLeft: '+',
    bottomRight: '+',
    teeDown: '+',
    teeUp: '+',
    teeLeft: '+',
    teeRight: '+',
    cross: '+',
  },
};
test('actual render width keeps fitting commands literal and shows ordinary tables completely', () => {
  const tool = presentTool({ name: 'sf_query' }, presentation);
  const args = { query: 'SELECT Name FROM Account' };
  const result = {
    content: [],
    details: {
      queryResult: {
        records: Array.from({ length: 15 }, (_, i) => ({ Name: `Example ${i}` })),
        done: true,
        totalSize: 15,
      },
    },
  };
  const render = tool.renderResult(result, { expanded: false, isPartial: false }, theme, args);
  const wide = render.render(120).join('\n');
  expect(wide).toContain("sf data query --query 'SELECT Name FROM Account' --json");
  expect(wide).not.toContain('\\\n');
  expect(wide).toContain('Example 11');
  expect(wide).not.toContain('Example 12');
  expect(wide).toContain('3 more rows in expanded details');
  expect(render.render(40).join('\n')).toContain('\\');
  const expanded = tool.renderResult(result, { expanded: true, isPartial: false }, theme, args).render(120).join('\n');
  expect(expanded).toContain('Example 14');
  expect(expanded).toContain('Arguments');
});

test('interim pipeline shows one status and retains raw progress only in expansion', () => {
  const tool = presentTool({ name: 'sf_pipeline_report', label: 'Salesforce Pipeline Report' }, presentation);
  const result = {
    content: [{ type: 'text', text: 'Pipeline queries: 0 completed, 1 running.' }],
    details: { tool: 'sf_pipeline_report' },
  };
  const collapsed = tool.renderResult(result, { expanded: false, isPartial: true }, theme, {}).render(76).join('\n');
  expect(collapsed).toContain('Pipeline: 0 completed · 1 query running');
  for (const noise of ['CLI output', 'Metadata', 'Output is still streaming', 'In progress', 'sf_pipeline_report'])
    expect(collapsed).not.toContain(noise);
  const expanded = tool.renderResult(result, { expanded: true, isPartial: true }, theme, {}).render(76).join('\n');
  expect(expanded).toContain('Pipeline queries: 0 completed, 1 running.');
  expect(expanded).toContain('Metadata');
  expect(expanded).toContain('sf_pipeline_report');
});

test('pipeline monthly distributions remain compact tables at normal transcript width', () => {
  const tool = presentTool({ name: 'sf_pipeline_report', label: 'Salesforce Pipeline Report' }, presentation);
  const result = {
    content: [],
    details: {
      pipelineReport: {
        currency: 'USD',
        closeDistribution: [
          {
            label: 'January 2029',
            yearMonth: '2029-01',
            amount: 123456.78,
            commit: 0,
            bestCase: 0,
            pipeline: 123456.78,
            oppCount: 2,
          },
        ],
        renewalDistribution: [{ label: 'February 2029', amount: 0, commit: 0, bestCase: 0, pipeline: 0, oppCount: 1 }],
      },
    },
  };
  const text = tool.renderResult(result, { expanded: false, isPartial: false }, theme, {}).render(76).join('\n');
  expect(text).toContain('Month');
  expect(text).toContain('Opportunities');
  expect(text).toContain('January 2029');
  expect(text).not.toContain('Year Month:');
  expect(text).not.toContain('Commit:');
});
