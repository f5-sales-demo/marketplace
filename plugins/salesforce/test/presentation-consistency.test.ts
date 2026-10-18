import { expect, test } from 'bun:test';
import { presentation } from '@f5-sales-demo/xcsh/presentation';
import { presentTool } from '../src/presentation';

const options = { expanded: false, isPartial: false };
const output = (name: string, result: any, args: any = {}) =>
  presentTool({ name }, presentation).presentation.result(result, options, args);
test('Query and Exec share monetary values, partial scope, missing cells and literal arguments', () => {
  const query = 'SELECT SUM(Amount) total FROM Opportunity';
  const payload = {
    records: [{ attributes: { type: 'AggregateResult' }, total: 89511.48000000001 }],
    done: false,
    totalSize: 2,
  };
  for (const view of [
    output('sf_query', { content: [], details: { queryResult: payload } }, { query }),
    output(
      'sf_exec',
      { content: [{ type: 'text', text: JSON.stringify({ status: 0, result: payload }) }] },
      { args: ['data', 'query', '--query', query] },
    ),
  ]) {
    expect(JSON.stringify(view)).toContain('89,511.48');
    expect(JSON.stringify(view)).toContain('Partial results');
    expect(JSON.stringify(view)).toContain('Currency unknown');
    expect(JSON.stringify(view)).not.toContain('Org:');
  }
});
test('Org and Exec org display share quiet normal identity and complete safe evidence', () => {
  const org = {
    username: 'synthetic@example.com',
    instanceUrl: 'https://salesforce.example.com',
    connectedStatus: 'Connected',
    alias: '',
    isSandbox: false,
  };
  for (const view of [
    output('sf_org_display', { content: [], details: { orgEvidence: org } }),
    output(
      'sf_exec',
      { content: [{ type: 'text', text: JSON.stringify({ status: 0, result: org }) }] },
      { args: ['org', 'display'] },
    ),
  ]) {
    expect(JSON.stringify(view)).toContain('Production');
    expect(JSON.stringify(view)).not.toContain('Connected');
    expect(JSON.stringify(view)).not.toContain('Not returned');
  }
});
test('all six tools use one renderer and retain complete failure guidance at every width', () => {
  const correction = 'Synthetic error: verify your Salesforce organization before retrying.';
  const theme = {
    fg: (_k: string, s: string) => s,
    bold: (s: string) => s,
    boxSharp: { topLeft: '+', topRight: '+', bottomLeft: '+', bottomRight: '+', horizontal: '-', vertical: '|' },
  };
  for (const name of ['sf_query', 'sf_exec', 'sf_describe', 'sf_org_display', 'sf_help', 'sf_pipeline_report']) {
    const tool = presentTool({ name }, presentation);
    for (const width of [40, 76, 120, 153]) {
      const lines = tool
        .renderResult({ isError: true, content: [{ type: 'text', text: correction }] }, options, theme, {})
        .render(width);
      expect(lines.every((line) => line.length <= width)).toBe(true);
      expect(lines.join('').replace(/[\s|]/g, '')).toContain(correction.replace(/\s/g, ''));
    }
  }
});
