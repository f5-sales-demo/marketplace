import type { PresentationAPI } from '@f5-sales-demo/xcsh/presentation';
import { buildGhCommandArgs } from './tools/gh';

type Result = { content: readonly { type: string; text?: string }[]; details?: unknown; isError?: boolean };
type Options = { expanded: boolean; isPartial: boolean };
type Section = ReturnType<PresentationAPI['data']>[number];
const record = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const rows = (v: unknown): v is Record<string, unknown>[] =>
  Array.isArray(v) && v.every((x) => x !== null && typeof x === 'object' && !Array.isArray(x));
const validCollections = (d: Record<string, unknown>, keys: string[]) =>
  keys.every((k) => d[k] === undefined || rows(d[k]));
const value = (v: unknown) => (v === undefined || v === null ? 'unknown' : v);
const fields = (values: Record<string, unknown>, title: string): Section => ({
  kind: 'fields',
  values,
  title,
  previewFields: 'all',
});
/** Domain data only; xcsh owns layout, command quoting, themes and progress lifecycle. */
export function presentTool<T extends { name: string; label?: string }>(tool: T, p: PresentationAPI) {
  const scope = (input: unknown): Section[] => {
    const values = Object.fromEntries(
      Object.entries(record(input)).filter(([k]) =>
        [
          'repo',
          'issue',
          'pr',
          'branch',
          'worktree',
          'run',
          'query',
          'limit',
          'comments',
          'nameOnly',
          'force',
          'forceWithLease',
          'action',
        ].includes(k),
      ),
    );
    return Object.keys(values).length ? [fields(values, 'Scope')] : [];
  };
  const command = (input: unknown): Section[] => {
    try {
      const args = buildGhCommandArgs(tool.name, record(input));
      return args ? [p.command(['gh', ...args])] : [];
    } catch {
      return [];
    }
  };
  const table = (
    items: Record<string, unknown>[],
    columns: { key: string; label: string }[],
    title: string,
  ): Section => ({ ...p.table(items, columns, title), previewRows: 12 });
  const comments = (d: Record<string, unknown>, key: string, title: string): Section[] =>
    rows(d[key])
      ? [
          table(
            d[key].map((row) => ({ ...row, author: value(record(row.author).login) })),
            [
              { key: 'author', label: 'Author' },
              { key: 'body', label: 'Complete guidance' },
              { key: 'state', label: 'State' },
              { key: 'path', label: 'Path' },
              { key: 'url', label: 'URL' },
            ],
            title,
          ),
        ]
      : [];
  return p.withPresentation(tool, {
    call: (input: unknown, options: Options) => ({
      summary: tool.label ?? tool.name,
      sections: [...command(input), ...(options.expanded ? p.data(input, 'Complete request') : scope(input))],
    }),
    result: (result: Result, options: Options, input: unknown) => {
      const d = record(result.details),
        data = record(d.data),
        base = scope(input);
      const texts: Section[] = result.content
        .filter((b) => b.type === 'text')
        .map((b) => ({
          kind: 'code',
          title: result.isError ? 'Complete corrective guidance' : 'Complete output',
          text: b.text ?? '',
        }));
      const fallback = () => ({ sections: [...base, ...texts] });
      if (result.isError || result.content.some((b) => b.type !== 'text')) return fallback();
      const complete = (summary: string, sections: Section[], evidence: unknown = d) => ({
        summary,
        expandedEvidence: 'provided' as const,
        sections: [...base, ...(options.expanded ? p.data(evidence, 'Complete safe evidence') : sections)],
      });
      if (
        tool.name === 'gh_repo_view' &&
        typeof data.nameWithOwner === 'string' &&
        validCollections(data, ['repositoryTopics'])
      )
        return complete('Repository', [
          fields(
            {
              Repository: data.nameWithOwner,
              Description: value(data.description),
              Visibility: value(data.visibility),
              'Default branch': value(record(data.defaultBranchRef).name),
              Permission: value(data.viewerPermission),
              Stars: value(data.stargazerCount),
              Forks: value(data.forkCount),
              Archived: value(data.isArchived),
              Fork: value(data.isFork),
              URL: value(data.url),
            },
            'Repository identity',
          ),
        ]);
      if (
        ['gh_issue_view', 'gh_pr_view'].includes(tool.name) &&
        typeof data.number === 'number' &&
        typeof data.title === 'string' &&
        validCollections(data, ['comments', 'labels', 'files', 'reviews', 'reviewComments'])
      ) {
        const pr = tool.name === 'gh_pr_view';
        return complete(pr ? 'Pull request' : 'Issue', [
          fields(
            {
              Number: data.number,
              Title: data.title,
              State: value(data.state),
              Author: value(record(data.author).login),
              'Comment count': rows(data.comments) ? data.comments.length : 'not requested',
              URL: value(data.url),
              ...(pr
                ? {
                    Draft: value(data.isDraft),
                    'Base branch': value(data.baseRefName),
                    'Head branch': value(data.headRefName),
                    'Merge state': value(data.mergeStateStatus),
                    'Review decision': value(data.reviewDecision),
                    'File count': rows(data.files) ? data.files.length : 'unknown',
                  }
                : {}),
            },
            pr ? 'Pull request identity' : 'Issue identity',
          ),
          ...(typeof data.body === 'string'
            ? [{ kind: 'code' as const, title: 'Complete body guidance', text: data.body }]
            : []),
          ...comments(data, 'comments', 'Comments'),
          ...comments(data, 'reviews', 'Reviews'),
          ...comments(data, 'reviewComments', 'Review comments'),
          ...(rows(data.files)
            ? [
                table(
                  data.files,
                  [
                    { key: 'path', label: 'Path' },
                    { key: 'additions', label: 'Additions (lines)' },
                    { key: 'deletions', label: 'Deletions (lines)' },
                    { key: 'changeType', label: 'Change' },
                  ],
                  'Files',
                ),
              ]
            : []),
        ]);
      }
      if (['gh_search_issues', 'gh_search_prs'].includes(tool.name) && rows(d.items))
        return complete(d.items.length ? 'Search results' : 'No matches', [
          fields(
            {
              'Returned rows': d.items.length,
              Query: value(d.query ?? record(input).query),
              'Effective limit': value(d.limit),
            },
            'Search outcome',
          ),
          table(
            d.items.map((row) => ({
              ...row,
              repository: value(record(row.repository).nameWithOwner),
              author: value(record(row.author).login),
            })),
            [
              { key: 'number', label: 'Number' },
              { key: 'title', label: 'Title' },
              { key: 'state', label: 'State' },
              { key: 'repository', label: 'Repository' },
              { key: 'author', label: 'Author' },
              { key: 'url', label: 'URL' },
            ],
            'Matches',
          ),
        ]);
      if (['gh_exec', 'gh_help', 'gh_pr_diff'].includes(tool.name)) {
        const output =
          typeof d.fullOutput === 'string' ? d.fullOutput : result.content.map((b) => b.text ?? '').join('\n');
        return complete('CLI output', [{ kind: 'code', title: 'Complete output', text: output }], {
          ...d,
          fullOutput: output,
        });
      }
      if (
        ['gh_pr_checkout', 'gh_pr_push'].includes(tool.name) &&
        typeof d.branch === 'string' &&
        typeof d.headSha === 'string'
      )
        return complete(
          'Execution outcome',
          [
            fields(
              {
                Repository: value(d.repo),
                Branch: d.branch,
                Worktree: value(d.worktreePath),
                Remote: value(d.remote),
                'Remote branch': value(d.remoteBranch),
                'Head SHA': d.headSha,
              },
              'Execution outcome',
            ),
            ...texts,
          ],
          { ...d, output: result.content.map((b) => b.text ?? '').join('\n') },
        );
      const watch = record(d.watch);
      if (
        tool.name === 'gh_run_watch' &&
        ['watching', 'completed'].includes(String(watch.state)) &&
        typeof watch.repo === 'string' &&
        (watch.run === undefined || rows(record(watch.run).jobs)) &&
        validCollections(watch, ['runs', 'failedLogs']) &&
        (!rows(watch.runs) || watch.runs.every((run) => rows(run.jobs)))
      ) {
        const runs = rows(watch.runs) ? watch.runs : watch.run ? [record(watch.run)] : [];
        return complete('Run watch outcome', [
          fields(
            {
              Repository: watch.repo,
              State: watch.state,
              Mode: value(watch.mode),
              Branch: value(watch.branch),
              'Head SHA': value(watch.headSha),
              'Poll count': value(watch.pollCount),
              Note: value(watch.note),
            },
            'Run watch outcome',
          ),
          table(
            runs,
            [
              { key: 'id', label: 'Run' },
              { key: 'workflowName', label: 'Workflow' },
              { key: 'status', label: 'Status' },
              { key: 'conclusion', label: 'Conclusion' },
            ],
            'Runs',
          ),
          table(
            runs.flatMap((run) => (run.jobs as Record<string, unknown>[]).map((job) => ({ ...job, runId: run.id }))),
            [
              { key: 'runId', label: 'Run' },
              { key: 'name', label: 'Job' },
              { key: 'status', label: 'Status' },
              { key: 'conclusion', label: 'Conclusion' },
              { key: 'durationSeconds', label: 'Duration (seconds)' },
            ],
            'Jobs',
          ),
          ...(rows(watch.failedLogs) ? watch.failedLogs.map((log) => fields(log, 'Complete failed log guidance')) : []),
        ]);
      }
      if (
        tool.name.startsWith('github_') &&
        typeof d.action === 'string' &&
        typeof record(d.repository).nameWithOwner === 'string' &&
        rows(d.operations) &&
        rows(d.advisories)
      ) {
        if (
          !d.operations.every(
            (op) =>
              ['git', 'gh'].includes(String(op.command)) &&
              Array.isArray(op.args) &&
              op.args.every((a) => typeof a === 'string') &&
              typeof op.cwd === 'string' &&
              typeof op.exitCode === 'number',
          ) ||
          !d.advisories.every((a) => typeof a.message === 'string')
        )
          return fallback();
        const operations = d.operations.flatMap((op) => [
          fields({ Directory: op.cwd, 'Exit code': op.exitCode }, 'Executed operation'),
          ...((op.args as string[]).some((a) => a.includes('[redacted]'))
            ? [{ kind: 'code' as const, title: 'Redacted operation evidence', text: JSON.stringify(op) }]
            : [
                p.command([op.command as string, ...(op.args as string[])]),
                ...p.data({ stdout: op.stdout, stderr: op.stderr }, 'Operation output'),
              ]),
        ]);
        return complete('Workflow outcome', [
          fields(
            {
              Action: d.action,
              Repository: record(d.repository).nameWithOwner,
              'Repository root': value(record(d.repository).root),
              Issue: value(record(d.issue).number),
              'Pull request': value(record(d.pullRequest).number),
              'PR state': value(record(d.pullRequest).state),
              'Check state': value(d.checkState),
              'Retry after (milliseconds)': value(d.retryAfterMs),
              Branch: value(record(d.branch).name),
              Worktree: value(record(d.worktree).path),
              Reused: value(record(d.worktree).reused),
              'Merge verified': value(record(d.cleanup).mergeVerified),
              'Branch deleted': value(record(d.cleanup).branchDeleted),
              'Worktree removed': value(record(d.cleanup).worktreeRemoved),
            },
            'Workflow outcome',
          ),
          ...d.advisories.map((a) => fields(a, 'Complete workflow advisory')),
          ...operations,
        ]);
      }
      return fallback();
    },
  });
}
