import { expect, test } from 'bun:test';
import { presentation } from '@f5-sales-demo/xcsh/presentation';
import { presentTool } from '../src/presentation';
import { sessionSymbols } from '../src/presentation/icons';

const options = { expanded: false, isPartial: false };
test('session theme is read at presentation time and decorative cues stay outside commands', () => {
  const symbols = sessionSymbols();
  const tool = presentTool({ name: 'sf_query' }, presentation, symbols.resolve);
  const args = { query: 'SELECT Id FROM Task', target_org: 'synthetic' };
  const result = { content: [], details: { queryResult: { records: [], done: false, totalSize: 0 } } };
  const before = tool.presentation.result(result, options, args);
  expect(before.sections[0].title).toBeUndefined();
  let preset = 'first';
  let reads = 0;
  const ctx = {
    hasUI: true,
    ui: {
      get theme() {
        reads++;
        return { symbol: (key: string) => `${preset}:${key}` };
      },
    },
  };
  symbols.bind(ctx);
  for (const expanded of [false, true]) {
    const rendered = tool.presentation.result(result, { ...options, expanded }, args);
    expect(rendered.sections[0].title).toBeUndefined();
    expect(rendered.summary).toContain('records returned');
    expect(rendered.sections[0].kind === 'code' && rendered.sections[0].text).toBe(
      before.sections[0].kind === 'code' && before.sections[0].text,
    );
    expect(rendered.summary).toContain('0 records returned');
    expect(JSON.stringify(rendered)).not.toContain('No records found');
    preset = 'second';
  }
  expect(reads).toBeGreaterThan(0);
  expect(JSON.stringify(tool.presentation.result(result, options, args))).toContain('second:status.warning');
  ctx.hasUI = false;
  expect(tool.presentation.result(result, options, args).sections[0].title).toBeUndefined();
});

test('expanded exec retains provenance once without repeating the runnable command', () => {
  const tool = presentTool({ name: 'sf_exec' }, presentation);
  const result = {
    content: [{ type: 'text', text: JSON.stringify({ result: { records: [{ total: 0 }], done: false } }) }],
  };
  const args = { args: ['data', 'query', '--query', 'SELECT COUNT(Id) total FROM Task', '--json'] };
  const view = tool.presentation.result(result, { ...options, expanded: true }, args);
  expect(view.sections.filter((s) => s.kind === 'code' && s.text.startsWith('sf data query'))).toHaveLength(1);
  expect(view.sections.filter((s) => s.title === 'Arguments')).toHaveLength(0);
  expect(JSON.stringify(tool.presentation.call(args, { ...options, expanded: true }))).toContain('COUNT(Id)');
  expect(view.sections.filter((s) => s.title === 'CLI output')).toHaveLength(1);
  expect(view.sections.some((s) => s.title === 'Pagination')).toBe(true);
  expect(JSON.stringify(view)).toContain('Partial results');
});

test('semantic headings share host keys across all six tools', () => {
  const symbols = (key: string) => `host/${key}`;
  const schema = {
    name: 'Event',
    fields: [{ name: 'Subject', label: 'Subject', type: 'string', custom: false }],
    childRelationships: [],
  };
  const cases = [
    ['sf_describe', { content: [], details: { described: schema } }, { sobject: 'Event' }, 'icon.file'],
    [
      'sf_exec',
      { content: [{ type: 'text', text: JSON.stringify({ result: schema }) }] },
      { args: ['sobject', 'describe', '--sobject', 'Event', '--json'] },
      'icon.file',
    ],
    [
      'sf_query',
      { content: [], details: { queryResult: { records: [], done: true } } },
      { query: 'SELECT Id FROM Task' },
      'lang.sql',
    ],
    ['sf_org_display', { content: [], details: { orgEvidence: { connectedStatus: 'Connected' } } }, {}, 'icon.host'],
    [
      'sf_help',
      { content: [{ type: 'text', text: 'Query data.\nUSAGE\n  sf data query -q <value>' }] },
      { command_path: 'data query' },
      'icon.extensionInstruction',
    ],
    [
      'sf_pipeline_report',
      { content: [], details: { pipelineReport: { currency: 'CAD', generated: 'Synthetic timestamp' } } },
      {},
      'lang.sql',
    ],
  ] as const;
  for (const [name, result, args, key] of cases) {
    const tool = presentTool({ name }, presentation, symbols);
    for (const expanded of [false, true]) {
      const view = tool.presentation.result(result, { ...options, expanded }, args);
      expect(JSON.stringify(view)).not.toContain('host/icon.extensionSlashCommand');
      expect(JSON.stringify(view)).not.toContain('copy and run');
      expect(JSON.stringify(view)).not.toContain('Expand for');
      if (name === 'sf_pipeline_report') {
        expect(JSON.stringify(view)).toContain('CAD');
        expect(JSON.stringify(view).includes('Synthetic timestamp')).toBe(expanded);
        expect(view.sections.filter((s) => s.title?.endsWith('Report scope'))).toHaveLength(1);
      }
    }
  }
});

test('session spinner uses injected live theme frames and clears on shutdown', () => {
  const symbols = sessionSymbols();
  let frames = ['a', 'b'];
  symbols.bind({
    hasUI: true,
    ui: {
      get theme() {
        return { symbol: () => 'status', spinnerFrames: frames };
      },
    },
  });
  expect(symbols.resolve.spinner?.(0)).toBe('a');
  expect(symbols.resolve.spinner?.(1)).toBe('b');
  frames = ['new'];
  expect(symbols.resolve.spinner?.(1)).toBe('new');
  symbols.clear();
  expect(symbols.resolve.spinner?.(0)).toBeUndefined();
  expect(symbols.resolve('status.running')).toBeUndefined();
});
