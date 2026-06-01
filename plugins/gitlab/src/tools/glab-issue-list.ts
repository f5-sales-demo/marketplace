import { resolveProject } from '../glab/config';
import { execGlabJson, GlabAuthError } from '../glab/exec';
import { formatIssueTable } from '../glab/formatters';
import type { GlabIssue } from '../glab/types';
import glabIssueListDescription from '../prompts/glab-issue-list.md' with { type: 'text' };
import { makeExecApi, textResult } from './shared';

export function createGlabIssueListTool(pi: any) {
  const { Type } = pi.typebox;

  const parameters = Type.Object({
    project: Type.Optional(
      Type.String({ description: 'GitLab project path (e.g. group/repo). Defaults to configured project.' }),
    ),
    state: Type.Optional(
      Type.Union([Type.Literal('opened'), Type.Literal('closed'), Type.Literal('all')], {
        description: 'Filter by issue state',
      }),
    ),
    labels: Type.Optional(Type.Array(Type.String(), { description: 'Filter by labels' })),
    assignee: Type.Optional(Type.String({ description: 'Filter by assignee username' })),
    search: Type.Optional(Type.String({ description: 'Search text in title and description' })),
    milestone: Type.Optional(Type.String()),
    sort: Type.Optional(
      Type.Union(
        [Type.Literal('created_at'), Type.Literal('updated_at'), Type.Literal('priority'), Type.Literal('due_date')],
        { description: 'Sort field' },
      ),
    ),
    order: Type.Optional(Type.Union([Type.Literal('asc'), Type.Literal('desc')], { description: 'Sort direction' })),
    limit: Type.Optional(Type.Number({ default: 30, maximum: 100, description: 'Max results' })),
  });

  return {
    name: 'glab_issue_list',
    label: 'GitLab Issues',
    description: glabIssueListDescription,
    parameters,
    async execute(
      _toolCallId: string,
      params: {
        project?: string;
        state?: string;
        labels?: string[];
        assignee?: string;
        search?: string;
        milestone?: string;
        sort?: string;
        order?: string;
        limit?: number;
      },
      signal: any,
      _onUpdate: any,
      ctx: { cwd: string },
    ) {
      const api = makeExecApi(ctx.cwd);
      const project = await resolveProject(params.project, ctx.cwd, (cmd, args) => api.exec(cmd, args));
      if (!project) {
        return textResult('No GitLab project configured. Run glab_setup to set one up.');
      }

      const args = ['issue', 'list', '--output', 'json', '--repo', project];
      if (params.state === 'closed') args.push('--closed');
      else if (params.state === 'all') args.push('--all');
      if (params.labels?.length) args.push('--label', params.labels.join(','));
      if (params.assignee) args.push('--assignee', params.assignee);
      if (params.search) args.push('--search', params.search);
      if (params.milestone) args.push('--milestone', params.milestone);
      if (params.sort) args.push('--order', params.sort);
      if (params.order) args.push('--sort', params.order);
      args.push('--per-page', String(Math.min(params.limit ?? 30, 100)));

      try {
        const issues = await execGlabJson<GlabIssue[]>(api, args, signal);
        return textResult(formatIssueTable(issues), {
          tool: 'glab_issue_list',
          items: issues,
          total: issues.length,
          project,
        });
      } catch (err) {
        if (err instanceof GlabAuthError) return textResult((err as Error).message);
        throw err;
      }
    },
  };
}
