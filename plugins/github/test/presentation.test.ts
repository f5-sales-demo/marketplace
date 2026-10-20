import { afterEach, expect, spyOn, test } from 'bun:test';
import { presentation } from '@f5-sales-demo/xcsh/presentation';
import { Type } from '@sinclair/typebox';
import { presentTool } from '../src/presentation';
import * as gh from '../src/tools/gh';
import * as git from '../src/utils/git';

const options = { expanded: false, isPartial: false };
const result = (details: unknown, text = 'SYNTHETIC_TEXT_MARKER', isError = false) => ({
  content: [{ type: 'text', text }],
  details,
  isError,
});
afterEach(() => {
  mockRestore();
});
let mockRestore = () => {};

test('repository identity preserves empty, zero, false and unknown values', () => {
  const view = presentTool({ name: 'gh_repo_view' }, presentation).presentation.result(
    result({
      data: {
        nameWithOwner: 'synthetic/demo',
        description: '',
        visibility: 'PUBLIC',
        forkCount: 0,
        stargazerCount: 0,
        isArchived: false,
        isFork: false,
      },
    }),
    options,
    {},
  );
  expect(view.sections.find((s) => s.title === 'Repository identity')).toMatchObject({
    previewFields: 'all',
    values: {
      Repository: 'synthetic/demo',
      Description: '',
      Stars: 0,
      Forks: 0,
      Archived: false,
      Fork: false,
      'Default branch': 'unknown',
    },
  });
});
test('issue and PR previews include bodies and twelve readable rows; expanded evidence appears once', () => {
  const comments = Array.from({ length: 13 }, (_, i) => ({ author: { login: `person-${i}` }, body: `COMMENT_${i}` }));
  const files = Array.from({ length: 13 }, (_, i) => ({ path: `file-${i}`, additions: 0, deletions: 0 }));
  for (const [name, data, title] of [
    ['gh_issue_view', { number: 1, title: 'Issue', body: 'BODY_MARKER', comments }, 'Comments'],
    ['gh_pr_view', { number: 2, title: 'PR', body: 'BODY_MARKER', files, isDraft: false }, 'Files'],
  ] as const) {
    const tool = presentTool({ name }, presentation);
    const view = tool.presentation.result(result({ data }), options, {});
    expect(view.sections.find((s) => s.title === title)).toMatchObject({ previewRows: 12 });
    expect(JSON.stringify(view)).toContain('BODY_MARKER');
    const expanded = tool.presentation.result(result({ data }), { ...options, expanded: true }, {});
    expect(expanded.expandedEvidence).toBe('provided');
    expect(JSON.stringify(expanded).match(/BODY_MARKER/g)).toHaveLength(1);
    expect(JSON.stringify(expanded)).not.toContain('SYNTHETIC_TEXT_MARKER');
  }
});
test('search distinguishes zero matches and declares twelve rows', () => {
  for (const name of ['gh_search_issues', 'gh_search_prs']) {
    const tool = presentTool({ name }, presentation);
    const view = tool.presentation.result(result({ items: [] }), options, { query: 'literal $query' });
    expect(JSON.stringify(view)).toContain('No matches');
    expect(view.sections.find((s) => s.title === 'Search outcome')).toMatchObject({ values: { 'Returned rows': 0 } });
    expect(view.sections.find((s) => s.kind === 'table')).toMatchObject({ previewRows: 12 });
  }
});
test('full output is supplied once; malformed and failed evidence retain automatic fallback and literal guidance', () => {
  for (const name of ['gh_exec', 'gh_help', 'gh_pr_diff']) {
    const view = presentTool({ name }, presentation).presentation.result(
      result({ fullOutput: 'COMPLETE_MARKER' }, 'COMPLETE_MARKER'),
      options,
      {},
    );
    expect(JSON.stringify(view).match(/COMPLETE_MARKER/g)).toHaveLength(1);
    expect(view.expandedEvidence).toBe('provided');
  }
  for (const details of [{ data: { wrong: true } }, { data: { number: 1, title: 'partial', comments: [null] } }]) {
    const view = presentTool({ name: 'gh_issue_view' }, presentation).presentation.result(
      result(details, 'Run exactly: xcsh plugin setup github'),
      options,
      {},
    );
    expect(view.expandedEvidence).not.toBe('provided');
    expect(JSON.stringify(view)).toContain('Run exactly: xcsh plugin setup github');
  }
  const failure = presentTool({ name: 'gh_exec' }, presentation).presentation.result(
    result({ fullOutput: 'partial' }, 'LITERAL_CORRECTION', true),
    options,
    {},
  );
  expect(failure.expandedEvidence).not.toBe('provided');
  expect(JSON.stringify(failure)).toContain('LITERAL_CORRECTION');
});
test('workflow preserves advisories, false cleanup, zero retry and records real operations without inventing commands', () => {
  const details = {
    action: 'status',
    repository: { nameWithOwner: 'synthetic/demo' },
    operations: [
      { command: 'git', args: ['status', '--short'], cwd: '/synthetic', exitCode: 0, stdout: '', stderr: '' },
    ],
    advisories: [{ code: 'synthetic', severity: 'warning', message: 'FULL_ADVISORY' }],
    checkState: 'unknown',
    retryAfterMs: 0,
    cleanup: { mergeVerified: false, branchDeleted: false, worktreeRemoved: false },
  };
  const tool = presentTool({ name: 'github_workflow' }, presentation);
  expect(tool.presentation.call({}, options).sections.some((s) => s.kind === 'code' && s.argv)).toBe(false);
  const view = tool.presentation.result(result(details, JSON.stringify(details)), options, {});
  expect(view.sections.find((s) => s.title === 'Workflow outcome')).toMatchObject({
    values: { 'Check state': 'unknown', 'Retry after (milliseconds)': 0, 'Merge verified': false },
  });
  expect(view.sections.find((s) => s.kind === 'code')?.text).toBe(
    presentation.command(['git', 'status', '--short']).text,
  );
  expect(JSON.stringify(view).match(/FULL_ADVISORY/g)).toHaveLength(1);
});
test('redacted workflow arguments remain evidence without an executable argv claim', () => {
  const details = {
    action: 'publish',
    repository: { nameWithOwner: 'synthetic/demo' },
    advisories: [],
    operations: [
      {
        command: 'gh',
        args: ['pr', 'create', '--body', '[redacted]'],
        cwd: '/synthetic',
        exitCode: 0,
        stdout: '',
        stderr: '',
      },
    ],
  };
  const view = presentTool({ name: 'github_pr_create' }, presentation).presentation.result(
    result(details),
    options,
    {},
  );
  expect(view.sections.some((s) => s.kind === 'code' && s.argv)).toBe(false);
  expect(JSON.stringify(view)).toContain('Redacted operation evidence');
});
test('partial and malformed watch or lifecycle updates retain full literal fallback', () => {
  for (const [name, details] of [
    ['gh_run_watch', { watch: { state: 'watching', repo: 'synthetic/demo', run: { jobs: [null] } } }],
    [
      'github_workflow',
      { action: 'status', repository: { nameWithOwner: 'synthetic/demo' }, operations: [{}], advisories: [] },
    ],
  ] as const) {
    const view = presentTool({ name }, presentation).presentation.result(
      result(details, 'LITERAL_PARTIAL'),
      { ...options, isPartial: true },
      {},
    );
    expect(view.expandedEvidence).not.toBe('provided');
    expect(JSON.stringify(view)).toContain('LITERAL_PARTIAL');
  }
});
test('watch keeps poll zero, duration units, failed log guidance and completed state', () => {
  const view = presentTool({ name: 'gh_run_watch' }, presentation).presentation.result(
    result({
      watch: {
        mode: 'run',
        state: 'completed',
        repo: 'synthetic/demo',
        pollCount: 0,
        run: { id: 1, status: 'completed', conclusion: 'success', jobs: [{ name: 'job', durationSeconds: 0 }] },
        failedLogs: [{ jobName: 'failed', available: false, tail: 'LITERAL_LOG' }],
      },
    }),
    options,
    {},
  );
  expect(view.sections.find((s) => s.title === 'Run watch outcome')).toMatchObject({
    values: { State: 'completed', 'Poll count': 0 },
  });
  expect(view.sections.find((s) => s.title === 'Jobs')?.columns).toContainEqual({
    key: 'durationSeconds',
    label: 'Duration (seconds)',
  });
  expect(JSON.stringify(view)).toContain('LITERAL_LOG');
});
test('typed command previews equal executed argv with effective defaults, URLs, flags and literal values', async () => {
  gh.setTypebox({ Type });
  const calls: string[][] = [];
  const spies = [
    spyOn(git.github, 'json').mockImplementation(async (_cwd, args) => {
      calls.push(args);
      return [];
    }),
    spyOn(git.github, 'text').mockImplementation(async (_cwd, args) => {
      calls.push(args);
      return '';
    }),
    spyOn(git.github, 'run').mockImplementation(async (_cwd, args) => {
      calls.push(args);
      return { stdout: '', stderr: '', exitCode: 0 };
    }),
  ];
  mockRestore = () => {
    spies.forEach((s) => {
      s.mockRestore();
    });
  };
  const session = { cwd: '/synthetic' };
  const cases = [
    [new gh.GhRepoViewTool(session), { repo: ' synthetic/demo ', branch: ' main ' }],
    [
      new gh.GhIssueViewTool(session),
      { issue: 'https://github.com/synthetic/demo/issues/1', repo: 'ignored/repo', comments: false },
    ],
    [new gh.GhPrViewTool(session), { pr: '2', repo: 'synthetic/demo', comments: false }],
    [
      new gh.GhPrDiffTool(session),
      { pr: '2', repo: 'synthetic/demo', nameOnly: true, exclude: [' literal $file ', "quote'"] },
    ],
    [new gh.GhSearchIssuesTool(session), { query: ' state:open "$literal" ', repo: 'synthetic/demo', limit: 99.7 }],
    [new gh.GhSearchPrsTool(session), { query: 'literal', limit: 2.9 }],
    [new gh.GhHelpTool(session), { command_path: ' pr  view ' }],
    [new gh.GhExecTool(session), { args: ['repo', 'view', 'synthetic/demo'] }],
  ] as const;
  for (const [tool, input] of cases) {
    await tool.execute('synthetic', input as never);
    const section = presentTool(tool, presentation)
      .presentation.call(input, options)
      .sections.find((s) => s.kind === 'code');
    const actualArgs = calls.at(-1);
    if (!actualArgs) throw new Error('Expected an executed command');
    expect(section?.text).toBe(presentation.command(['gh', ...actualArgs]).text);
    if ('argv' in presentation.command(['gh'])) expect(section?.argv).toEqual(['gh', ...actualArgs]);
  }
});
for (const shell of ['bash', 'zsh']) {
  (Bun.which(shell) ? test : test.skip)(`literal argv reconstructs in ${shell}`, async () => {
    const { execFileSync } = await import('node:child_process');
    const args = ['', "quote'", '$literal', '`literal`', '|', ';', '☁', 'line\nbreak'];
    const command = presentation.command(['synthetic_harmless', ...args]).text;
    const bytes = execFileSync(shell, ['-c', `synthetic_harmless() { printf '%s\\0' "$@"; }; ${command}`]);
    expect(bytes.toString().split('\0').slice(0, -1)).toEqual(args);
  });
}
