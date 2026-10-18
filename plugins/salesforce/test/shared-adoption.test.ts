import { expect, test } from 'bun:test';
import { presentation } from '@f5-sales-demo/xcsh/presentation';
import { presentTool } from '../src/presentation';

const names = ['sf_exec', 'sf_query', 'sf_describe', 'sf_org_display', 'sf_help', 'sf_pipeline_report'];
test('all Salesforce registrations are data-only with complete field and table declarations', () => {
  for (const name of names) {
    const tool = presentTool({ name }, presentation);
    expect('renderCall' in tool).toBe(false);
    expect('renderResult' in tool).toBe(false);
    const view = tool.presentation.result(
      { content: [], details: { queryResult: { records: [{ Name: 'Example', Amount: 0 }], done: true } } },
      { expanded: false, isPartial: false },
      {},
    );
    for (const section of view.sections ?? []) {
      if (section.kind === 'fields') expect(section.previewFields).toBe('all');
      if (section.kind === 'table') {
        expect(section.previewRows).toBe(12);
        for (const column of section.columns) expect(column.minWidth).toBeGreaterThanOrEqual(6);
      }
    }
  }
});

test('expanded failures preserve raw corrective evidence and metadata exactly once', () => {
  for (const name of names) {
    const view = presentTool({ name }, presentation).presentation.result(
      {
        isError: true,
        content: [{ type: 'text', text: 'UNIQUE_CORRECTIVE_EVIDENCE' }],
        details: { errorType: 'synthetic' },
      },
      { expanded: true, isPartial: false },
      { args: ['data', 'query'] },
    );
    expect(view.sections?.filter((s) => s.kind === 'code' && s.text === 'UNIQUE_CORRECTIVE_EVIDENCE')).toHaveLength(1);
    expect(view.sections?.filter((s) => s.title === 'Metadata')).toHaveLength(1);
  }
});

test('malformed domain payloads retain automatic completion warnings', () => {
  for (const [name, details] of [
    ['sf_query', { queryResult: { records: [null], done: false } }],
    ['sf_describe', { described: { fields: [null], done: false } }],
  ] as const) {
    const view = presentTool({ name }, presentation).presentation.result(
      { content: [], details },
      { expanded: false, isPartial: true },
      {},
    );
    expect(view.completeness).not.toBe('provided');
    expect(view.warnings?.join()).toContain('streaming');
  }
});
