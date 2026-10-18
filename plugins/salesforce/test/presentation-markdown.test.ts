import { expect, test } from 'bun:test';
import { presentation } from '@f5-sales-demo/xcsh/presentation';
import { evidence } from '../src/presentation/shared';

test('formatted Salesforce reports retain complete literal report evidence', () => {
  const text = '## Forecast\n\n**Commit:** 0\n\n| Currency | Amount |\n| --- | --- |\n| USD | 0 |';
  for (const tool of ['sf_describe', 'sf_org_display', 'sf_pipeline_report']) {
    const sections = evidence(presentation, { content: [{ type: 'text', text }], details: { tool } }, {});
    expect(sections[0]).toEqual({ kind: 'code', title: 'CLI output', text });
    expect(sections.slice(1).some((section) => section.kind === 'code' && section.title === 'Metadata')).toBe(true);
  }
});

test('arbitrary CLI output and query data stay literal even when they contain Markdown syntax', () => {
  const text = "## literal output\n**not formatting**\n```sh\nprintf '%s' '# exact'\n```";
  for (const tool of ['sf_exec', 'sf_query', undefined]) {
    const sections = evidence(presentation, { content: [{ type: 'text', text }], details: { tool } }, {});
    expect(sections[0]).toEqual({ kind: 'code', title: 'CLI output', text });
  }
});
