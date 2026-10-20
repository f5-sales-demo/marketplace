import { resolveProject } from '../glab/config';
import type { GlabExecApi } from '../glab/exec';
import { execGlabJson, GlabAuthError } from '../glab/exec';
import { formatIssueTable } from '../glab/formatters';
import type { GlabIssue } from '../glab/types';
import glabIssueListDescription from '../prompts/glab-issue-list.md' with { type: 'text' };
import { issueListArgs } from './command-args';
import type { PluginHost, ToolUpdateCallback } from './plugin-host';
import { detectErrorType, errorResult, makeExecApi, textResult } from './shared';

/**
 * `makeApi` is injected by tests so a validation case can assert what the tool lets
 * through without spawning the real CLI.
 */
export function createGlabIssueListTool(
  pi: PluginHost,
  makeApi: (cwd: string) => GlabExecApi = makeExecApi,
  resolve = resolveProject,
) {
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
      signal: AbortSignal | undefined,
      _onUpdate: ToolUpdateCallback | undefined,
      ctx: { cwd: string },
    ) {
      const api = makeApi(ctx.cwd);
      const project = await resolve(params.project, ctx.cwd, (cmd, args) => api.exec(cmd, args));
      if (!project) {
        return errorResult('No GitLab project configured. Run: xcsh plugin setup gitlab', {
          errorType: 'setup_required',
        });
      }

      const args = issueListArgs(params, project);

      try {
        const issues = await execGlabJson<GlabIssue[]>(api, args, signal);
        return textResult(formatIssueTable(issues), {
          tool: 'glab_issue_list',
          items: issues,
          total: issues.length,
          project,
          commandArgs: args,
          limit: Math.min(params.limit ?? 30, 100),
        });
      } catch (err) {
        if (err instanceof GlabAuthError)
          return errorResult((err as Error).message, { errorType: detectErrorType(err) });
        throw err;
      }
    },
  };
}
