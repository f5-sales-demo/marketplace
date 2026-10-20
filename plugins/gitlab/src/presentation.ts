import type { PresentationAPI } from '@f5-sales-demo/xcsh/presentation';
import { helpArgs, issueListArgs, issueViewArgs } from './tools/command-args';
import { findMutation } from './tools/glab-exec-guard';

type Section = ReturnType<PresentationAPI['data']>[number];
type Options = { expanded: boolean; isPartial: boolean };
type Result = { content: readonly { type: string; text?: string }[]; details?: unknown; isError?: boolean };
const record = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const rows = (v: unknown): v is Record<string, unknown>[] =>
  Array.isArray(v) && v.every((r) => r !== null && typeof r === 'object' && !Array.isArray(r));
const issueRows = (v: unknown): v is Record<string, unknown>[] =>
  rows(v) && v.every((r) => typeof r.iid === 'number' && typeof r.title === 'string');
const value = (v: unknown) => (v === undefined || v === null ? 'unknown' : v);
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === 'string');
const fields = (values: Record<string, unknown>, title: string): Section => ({
  kind: 'fields',
  values,
  title,
  previewFields: 'all',
});

/** Domain data only; runtime owns framing, quoting, themes, pagination and timers. */
export function presentTool<T extends { name: string; label?: string }>(tool: T, p: PresentationAPI) {
  const scope = (input: unknown): Section[] => {
    const values = Object.fromEntries(
      Object.entries(record(input)).filter(([k]) =>
        ['project', 'state', 'search', 'query', 'limit', 'issue', 'comments', 'labels'].includes(k),
      ),
    );
    return Object.keys(values).length ? [fields(values, 'Requested scope')] : [];
  };
  const command = (input: unknown): Section[] => {
    const i = record(input);
    let args: string[] | undefined;
    if (tool.name === 'glab_issue_list' && typeof i.project === 'string' && i.project)
      args = issueListArgs(i, i.project);
    if (
      tool.name === 'glab_issue_view' &&
      typeof i.project === 'string' &&
      i.project &&
      ['string', 'number'].includes(typeof i.issue)
    )
      args = issueViewArgs(i as any, i.project);
    if (tool.name === 'glab_help' && (i.command_path === undefined || typeof i.command_path === 'string'))
      args = helpArgs(i.command_path as string | undefined);
    if (tool.name === 'glab_exec' && strings(i.args) && i.args.length && !findMutation(i.args).blocked) args = i.args;
    return args ? [p.command(['glab', ...args])] : [];
  };
  const table = (
    items: Record<string, unknown>[],
    columns: { key: string; label: string }[],
    title: string,
  ): Section => ({ ...p.table(items, columns, title), previewRows: 12 });
  const coverage =
    'Counts apply to returned records; server-wide completeness is not established. Search examines bounded REST results and the first 20 GraphQL notes per returned issue.';
  return p.withPresentation(tool, {
    call: (input: unknown, options: Options) => ({
      summary: tool.label ?? tool.name,
      sections: [...command(input), ...(options.expanded ? p.data(input, 'Complete request') : scope(input))],
    }),
    result: (result: Result, options: Options, input: unknown) => {
      const d = record(result.details),
        i = record(d.issue);
      const base = scope(input);
      const texts: Section[] = result.content
        .filter((b) => b.type === 'text')
        .map((b) => ({
          kind: 'code',
          title: result.isError ? 'Complete corrective guidance' : 'Complete output',
          text: b.text ?? '',
        }));
      const fallback = () => ({ sections: [...base, ...texts] });
      if (result.isError || result.content.some((b) => b.type !== 'text')) return fallback();
      const executed = strings(d.commandArgs) && d.commandArgs.length ? [p.command(['glab', ...d.commandArgs])] : [];
      const complete = (summary: string, sections: Section[], evidence: unknown = d) => ({
        summary,
        expandedEvidence: 'provided' as const,
        sections: [
          ...base,
          ...(options.expanded ? p.data(evidence, 'Complete safe evidence') : [...executed, ...sections]),
        ],
      });
      if (
        ['glab_issue_list', 'glab_search'].includes(tool.name) &&
        issueRows(d.items) &&
        (d.warnings === undefined || strings(d.warnings))
      ) {
        const sources = record(d.sources);
        return complete(d.partial ? 'Partial search results' : d.items.length ? 'Issues' : 'No matches', [
          fields(
            {
              Project: value(d.project),
              Query: value(d.query),
              'Returned rows': d.items.length,
              'Effective limit': value(d.limit),
              'Partial result': value(d.partial),
              REST: value(sources.rest),
              GraphQL: value(sources.graphql),
              Coverage: coverage,
            },
            'Search and list outcome',
          ),
          ...(strings(d.warnings)
            ? d.warnings.map((text) => ({ kind: 'code' as const, title: 'Complete search warning', text }))
            : []),
          table(
            d.items.map((row) => ({ ...row, author: value(record(row.author).username) })),
            [
              { key: 'iid', label: 'Issue' },
              { key: 'title', label: 'Title' },
              { key: 'state', label: 'State' },
              { key: 'author', label: 'Author' },
              { key: 'labels', label: 'Labels' },
              { key: 'web_url', label: 'URL' },
            ],
            'Issues',
          ),
        ]);
      }
      if (
        tool.name === 'glab_issue_view' &&
        typeof i.iid === 'number' &&
        typeof i.title === 'string' &&
        (i.notes === undefined || rows(i.notes))
      ) {
        return complete('Issue', [
          fields(
            {
              Project: value(d.project),
              Issue: i.iid,
              Title: i.title,
              State: value(i.state),
              Author: value(record(i.author).username),
              Milestone: value(record(i.milestone).title),
              'Returned comments': rows(i.notes) ? i.notes.length : 'not returned',
              URL: value(i.web_url),
            },
            'Issue identity',
          ),
          ...(typeof i.description === 'string'
            ? [{ kind: 'code' as const, title: 'Complete issue guidance', text: i.description }]
            : []),
          ...(rows(i.notes)
            ? [
                table(
                  i.notes.map((note) => ({ ...note, author: value(record(note.author).username) })),
                  [
                    { key: 'author', label: 'Author' },
                    { key: 'body', label: 'Complete guidance' },
                    { key: 'system', label: 'System comment' },
                    { key: 'created_at', label: 'Created' },
                  ],
                  'Comments',
                ),
              ]
            : []),
        ]);
      }
      if (['glab_help', 'glab_exec'].includes(tool.name)) {
        if (d.fullOutput !== undefined && typeof d.fullOutput !== 'string') return fallback();
        const output =
          typeof d.fullOutput === 'string' ? d.fullOutput : result.content.map((b) => b.text ?? '').join('\n');
        return complete(
          'CLI output',
          [
            { kind: 'code', title: 'Complete output', text: output },
            ...(typeof d.stderr === 'string' && d.stderr
              ? [{ kind: 'code' as const, title: 'Complete stderr', text: d.stderr }]
              : []),
          ],
          { ...d, fullOutput: output },
        );
      }
      return fallback();
    },
  });
}
