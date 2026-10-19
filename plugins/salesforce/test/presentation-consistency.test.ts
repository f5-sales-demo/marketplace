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
test('Org and Exec org display share connection status and complete safe evidence', () => {
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
    expect(JSON.stringify(view)).toContain('Connected');
    expect(JSON.stringify(view)).not.toContain('Not returned');
  }
});
