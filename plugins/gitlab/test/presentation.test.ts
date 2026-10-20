import { expect, test } from 'bun:test';
import { presentation } from '@f5-sales-demo/xcsh/presentation';
import { Type } from '@sinclair/typebox';
import { presentTool } from '../src/presentation';
import { createGlabExecTool } from '../src/tools/glab-exec';
import { createGlabHelpTool } from '../src/tools/glab-help';
import { createGlabIssueListTool } from '../src/tools/glab-issue-list';
import { createGlabIssueViewTool } from '../src/tools/glab-issue-view';

const options = { expanded: false, isPartial: false };
const result = (details: unknown, text = 'MODEL_PREVIEW', isError = false) => ({
  content: [{ type: 'text', text }],
  details,
  isError,
});
const view = (name: string, details: unknown, expanded = false) =>
  presentTool({ name }, presentation).presentation.result(result(details), { ...options, expanded }, {});

test('issue identity and complete guidance preserve zero, false, empty and unknown values', () => {
  const issue = {
    iid: 0,
    title: '',
    state: 'opened',
    description: 'BODY_GUIDANCE',
    notes: [{ body: 'COMMENT_GUIDANCE', system: false }],
  };
  const v = view('glab_issue_view', { project: 'synthetic/demo', issue });
  expect(v.sections.find((s) => s.title === 'Issue identity')).toMatchObject({
    previewFields: 'all',
    values: { Issue: 0, Title: '', Author: 'unknown' },
  });
  expect(JSON.stringify(v)).toContain('BODY_GUIDANCE');
  expect(v.sections.find((s) => s.title === 'Comments')).toMatchObject({ previewRows: 12 });
  const expanded = view('glab_issue_view', { project: 'synthetic/demo', issue }, true);
  expect(expanded.expandedEvidence).toBe('provided');
  expect(JSON.stringify(expanded).match(/COMMENT_GUIDANCE/g)).toHaveLength(1);
});
test('help and exec preserve complete stderr and exact executed arguments', async () => {
  const calls: string[][] = [];
  const api = (cwd: string) => ({
    cwd,
    exec: async (_command: string, args: string[]) => {
      calls.push(args);
      return { stdout: 'OUTPUT', stderr: 'STDERR_GUIDANCE', code: 0, killed: false };
    },
  });
  for (const [factory, input] of [
    [createGlabHelpTool, { command_path: ' issue  list ' }],
    [createGlabExecTool, { args: ['issue', 'list', '--search', 'literal $() ;'] }],
  ] as const) {
    const tool = presentTool(factory({ typebox: { Type } } as any, api), presentation);
    const r = await tool.execute('synthetic', input as any, undefined, undefined, { cwd: '/tmp' });
    expect(tool.presentation.result(r, options, input).sections.find((s) => s.kind === 'code')?.text).toBe(
      presentation.command(['glab', ...calls.at(-1)!]).text,
    );
    if (tool.name === 'glab_exec')
      expect(JSON.stringify(tool.presentation.result(r, options, input))).toContain('STDERR_GUIDANCE');
  }
});
for (const shell of ['bash', 'zsh']) {
  (Bun.which(shell) ? test : test.skip)(`literal command arguments reconstruct in ${shell}`, async () => {
    const { execFileSync } = await import('node:child_process');
    const args = ['', "quote'", '$literal', '`literal`', '|', ';', '☁', 'line\nbreak'];
    const text = presentation.command(['synthetic_harmless', ...args]).text;
    const bytes = execFileSync(shell, ['-c', `synthetic_harmless() { printf '%s\\0' "$@"; }; ${text}`]);
    expect(bytes.toString().split('\0').slice(0, -1)).toEqual(args);
  });
}
test('list and partial search use readable twelve-row previews with honest source status', () => {
  for (const name of ['glab_issue_list', 'glab_search']) {
    const v = view(name, {
      project: 'synthetic/demo',
      items: [],
      total: 0,
      partial: true,
      warnings: ['LITERAL_WARNING'],
      sources: { rest: true, graphql: false },
    });
    expect(v.sections.find((s) => s.title === 'Search and list outcome')).toMatchObject({
      values: { 'Returned rows': 0, 'Partial result': true, GraphQL: false },
    });
    expect(v.sections.find((s) => s.kind === 'table')).toMatchObject({ previewRows: 12 });
    expect(JSON.stringify(v)).toContain('LITERAL_WARNING');
    expect(JSON.stringify(v)).toContain('server-wide completeness');
  }
});
test('exec full output occurs once; failed, malformed and nontext results keep fallback', () => {
  for (const expanded of [false, true]) {
    const v = view('glab_exec', { fullOutput: 'COMPLETE_OUTPUT', modelPreviewTruncated: true }, expanded);
    expect(JSON.stringify(v).match(/COMPLETE_OUTPUT/g)).toHaveLength(1);
    expect(v.expandedEvidence).toBe('provided');
  }
  const tool = presentTool({ name: 'glab_issue_view' }, presentation);
  for (const r of [
    result({ issue: { iid: 1, title: 'x', notes: [null] } }, 'CORRECTIVE'),
    result({}, 'CORRECTIVE', true),
    { content: [{ type: 'image' }], details: {} },
  ]) {
    expect(tool.presentation.result(r, options, {}).expandedEvidence).not.toBe('provided');
  }
});
test('list and view command evidence exactly matches execution after effective project resolution', async () => {
  const calls: string[][] = [];
  const api = () => ({
    cwd: '/tmp',
    exec: async (_cmd: string, args: string[]) => {
      calls.push(args);
      return {
        stdout:
          args[1] === 'view'
            ? JSON.stringify({
                iid: 1,
                title: 'x',
                author: { username: 'synthetic' },
                created_at: '',
                updated_at: '',
                labels: [],
                assignees: [],
                description: '',
              })
            : '[]',
        stderr: '',
        code: 0,
        killed: false,
      };
    },
  });
  for (const [factory, input] of [
    [
      createGlabIssueListTool,
      { project: 'synthetic/demo', state: 'all', search: 'literal $() ;', limit: 200, order: 'asc' },
    ],
    [createGlabIssueViewTool, { project: 'synthetic/demo', issue: 1, comments: false }],
  ] as const) {
    const tool = presentTool(factory({ typebox: { Type } } as any, api), presentation);
    const r = await tool.execute('synthetic', input as any, undefined, undefined, { cwd: '/tmp' });
    const v = tool.presentation.result(r, options, input);
    expect(v.sections.find((s) => s.kind === 'code')?.text).toBe(presentation.command(['glab', ...calls.at(-1)!]).text);
  }
  expect(
    presentTool({ name: 'glab_search' }, presentation)
      .presentation.call({ project: 'synthetic/demo', query: 'x' }, options)
      .sections.some((s) => s.argv),
  ).toBe(false);
});

test('invalid list records and opaque exec output retain automatic evidence', () => {
  for (const [name, details] of [
    ['glab_issue_list', { items: [{}] }],
    ['glab_search', { items: [{ iid: 1, title: null }] }],
    ['glab_exec', { fullOutput: { opaque: 'LITERAL_OPAQUE_RESULT' } }],
  ] as const) {
    for (const expanded of [false, true]) {
      const v = view(name, details, expanded);
      expect(v.expandedEvidence).not.toBe('provided');
      expect(JSON.stringify(v)).toContain('MODEL_PREVIEW');
    }
  }
});
