import { resolveProject } from '../glab/config';
import type { GlabExecApi } from '../glab/exec';
import { execGlabJson, GlabAuthError } from '../glab/exec';
import { formatIssueTable } from '../glab/formatters';
import { executeGraphQL } from '../glab/graphql';
import type { GlabIssue, GraphQLIssueNode } from '../glab/types';
import glabSearchDescription from '../prompts/glab-search.md' with { type: 'text' };
import type { PluginHost, ToolUpdateCallback } from './plugin-host';
import { detectErrorType, errorResult, makeExecApi, textResult } from './shared';

/**
 * `makeApi` is injected by tests so a validation case can assert what the tool lets
 * through without spawning the real CLI.
 */
export function createGlabSearchTool(pi: PluginHost, makeApi: (cwd: string) => GlabExecApi = makeExecApi) {
  const { Type } = pi.typebox;

  const parameters = Type.Object({
    query: Type.String({ description: 'Search text to find across issue titles, descriptions, labels, and comments' }),
    project: Type.Optional(Type.String()),
    state: Type.Optional(
      Type.Union([Type.Literal('opened'), Type.Literal('closed'), Type.Literal('all')], {
        description: 'Filter by issue state',
      }),
    ),
    labels: Type.Optional(Type.Array(Type.String())),
    limit: Type.Optional(Type.Number({ default: 20, maximum: 100 })),
  });

  return {
    name: 'glab_search',
    label: 'GitLab Search',
    description: glabSearchDescription,
    parameters,
    async execute(
      _toolCallId: string,
      params: { query: string; project?: string; state?: string; labels?: string[]; limit?: number },
      signal: AbortSignal | undefined,
      _onUpdate: ToolUpdateCallback | undefined,
      ctx: { cwd: string },
    ) {
      const api = makeApi(ctx.cwd);
      const project = await resolveProject(params.project, ctx.cwd, (cmd, args) => api.exec(cmd, args));
      if (!project) {
        return errorResult('No GitLab project configured. Run: xcsh plugin setup gitlab', {
          errorType: 'setup_required',
        });
      }

      const limit = Math.min(params.limit ?? 20, 100);
      let issues: GlabIssue[] = [];
      let restSucceeded = false;
      let graphqlSucceeded = false;
      const warnings: string[] = [];

      const restArgs = [
        'issue',
        'list',
        '--output',
        'json',
        '--repo',
        project,
        '--search',
        params.query,
        '--per-page',
        String(limit),
      ];
      if (params.state === 'closed') restArgs.push('--closed');
      else if (params.state === 'all') restArgs.push('--all');
      if (params.labels?.length) restArgs.push('--label', params.labels.join(','));

      try {
        issues = await execGlabJson<GlabIssue[]>(api, restArgs, signal);
        restSucceeded = true;
      } catch (err) {
        if (signal?.aborted) throw err;
        if (err instanceof GlabAuthError)
          return errorResult((err as Error).message, { errorType: detectErrorType(err) });
        warnings.push('REST issue search unavailable; returned evidence may be incomplete.');
      }

      let graphqlNodes: GraphQLIssueNode[] = [];
      try {
        graphqlNodes = await executeGraphQL(api, project, params.query, limit, signal, params.state);
        graphqlSucceeded = true;
      } catch (err) {
        if (signal?.aborted) throw err;
        warnings.push('GraphQL comment search unavailable; returned evidence covers REST only.');
      }
      if (!restSucceeded && !graphqlSucceeded)
        return errorResult(
          'GitLab search unavailable: REST and GraphQL failed. No verified result count is available.',
          { errorType: 'exec_error' },
        );

      if (graphqlNodes.length > 0) {
        const seenIids = new Set(issues.map((i) => i.iid));
        for (const node of graphqlNodes) {
          const iid = parseInt(node.iid, 10);
          if (seenIids.has(iid)) continue;
          seenIids.add(iid);
          const lowerQuery = params.query.toLowerCase();
          const inTitle = node.title.toLowerCase().includes(lowerQuery);
          const inComments = node.notes.nodes.some((n) => n.body.toLowerCase().includes(lowerQuery));
          if (inTitle || inComments) {
            issues.push({
              id: iid,
              iid,
              title: node.title,
              description: '',
              state: node.state === 'OPEN' ? 'opened' : 'closed',
              labels: node.labels.nodes.map((l) => l.title),
              assignees: node.assignees.nodes.map((a) => ({ username: a.username, name: a.username })),
              author: { username: '', name: '' },
              milestone: null,
              created_at: node.updatedAt,
              updated_at: node.updatedAt,
              web_url: `https://gitlab.com/${project}/-/issues/${iid}`,
              references: { full: `${project}#${iid}` },
              issue_type: 'issue',
            });
          }
        }
      }

      return textResult(formatIssueTable(issues), {
        tool: 'glab_search',
        partial: warnings.length > 0,
        warnings,
        sources: { rest: restSucceeded, graphql: graphqlSucceeded },
        items: issues,
        total: issues.length,
        project,
        query: params.query,
      });
    },
  };
}
