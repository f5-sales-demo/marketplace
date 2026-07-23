import { execGcloudJson } from '../gcloud/exec';
import { formatProjectTable, normalizeProjects } from '../gcloud/formatters';
import type { PluginInterface } from '../gcloud/types';
import gcloudProjectsListDescription from '../prompts/gcloud-projects-list.md' with { type: 'text' };
import { detectErrorType, errorResult, makeExecApi, renderError, textResult } from './shared';

export function createGcloudProjectsListTool(pi: PluginInterface) {
  const { Type } = pi.typebox;

  const parameters = Type.Object({
    filter: Type.Optional(Type.String({ description: 'gcloud --filter expression, e.g. "lifecycleState=ACTIVE"' })),
    limit: Type.Optional(Type.Number({ description: 'Maximum number of projects to return (positive integer)' })),
  });

  return {
    name: 'gcloud_projects_list',
    label: 'Google Cloud Projects',
    description: gcloudProjectsListDescription,
    parameters,
    async execute(
      _toolCallId: string,
      params: { filter?: string; limit?: number },
      signal: AbortSignal | undefined,
      _onUpdate: unknown,
      ctx: { cwd: string },
    ) {
      const base = { tool: 'gcloud_projects_list' as const };

      if (params.limit !== undefined && (!Number.isInteger(params.limit) || params.limit <= 0)) {
        return errorResult(`Error: limit must be a positive integer, got "${params.limit}".`, base);
      }

      const api = makeExecApi(ctx.cwd);
      const args = ['projects', 'list'];
      if (params.filter) args.push('--filter', params.filter);
      if (params.limit !== undefined) args.push('--limit', String(params.limit));

      try {
        const raw = await execGcloudJson<unknown[]>(api, args, signal);
        const projects = normalizeProjects(raw);
        return textResult(formatProjectTable(projects), { ...base, projects });
      } catch (err) {
        return errorResult(`Error: ${renderError(err)}`, { ...base, errorType: detectErrorType(err) });
      }
    },
  };
}
