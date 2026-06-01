import { resolveProject } from '../glab/config';
import { execGlabJson, GlabAuthError } from '../glab/exec';
import { formatIssueTable } from '../glab/formatters';
import { executeGraphQL } from '../glab/graphql';
import type { GlabIssue, GraphQLIssueNode } from '../glab/types';
import glabSearchDescription from '../prompts/glab-search.md' with { type: 'text' };
import { makeExecApi, textResult } from './shared';

export function createGlabSearchTool(pi: any) {
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
      signal: any,
      _onUpdate: any,
      ctx: { cwd: string },
    ) {
      const api = makeExecApi(ctx.cwd);
      const project = await resolveProject(params.project, ctx.cwd, (cmd, args) => api.exec(cmd, args));
      if (!project) {
        return textResult('No GitLab project configured. Run glab_setup to set one up.');
      }

      const limit = Math.min(params.limit ?? 20, 100);
      let issues: GlabIssue[] = [];

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
      } catch (err) {
        if (err instanceof GlabAuthError) return textResult((err as Error).message);
      }

      let graphqlNodes: GraphQLIssueNode[] = [];
      try {
        graphqlNodes = await executeGraphQL(api, project, params.query, limit, signal, params.state);
      } catch {
        // GraphQL unavailable — use REST results only
      }

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
        items: issues,
        total: issues.length,
        project,
        query: params.query,
      });
    },
  };
}
