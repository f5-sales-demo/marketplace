import { execGcloudJson } from '../gcloud/exec';
import { formatInstanceTable, normalizeInstances } from '../gcloud/formatters';
import type { PluginInterface } from '../gcloud/types';
import { ZONE_PATTERN } from '../gcloud/types';
import gcloudComputeInstancesListDescription from '../prompts/gcloud-compute-instances-list.md' with { type: 'text' };
import { detectErrorType, errorResult, makeExecApi, renderError, textResult } from './shared';

export function createGcloudComputeInstancesListTool(pi: PluginInterface) {
  const { Type } = pi.typebox;

  const parameters = Type.Object({
    zone: Type.Optional(Type.String({ description: 'Restrict results to a zone, e.g. "us-central1-a"' })),
    filter: Type.Optional(Type.String({ description: 'gcloud --filter expression, e.g. "status=RUNNING"' })),
    limit: Type.Optional(Type.Number({ description: 'Maximum number of instances to return (positive integer)' })),
  });

  return {
    name: 'gcloud_compute_instances_list',
    label: 'Google Cloud Compute Instances',
    description: gcloudComputeInstancesListDescription,
    parameters,
    async execute(
      _toolCallId: string,
      params: { zone?: string; filter?: string; limit?: number },
      signal: AbortSignal | undefined,
      _onUpdate: unknown,
      ctx: { cwd: string },
    ) {
      const base = { tool: 'gcloud_compute_instances_list' as const };

      if (params.zone !== undefined && !ZONE_PATTERN.test(params.zone)) {
        return errorResult(`Error: invalid zone "${params.zone}". Expected a gcloud zone like "us-central1-a".`, base);
      }

      if (params.limit !== undefined && (!Number.isInteger(params.limit) || params.limit <= 0)) {
        return errorResult(`Error: limit must be a positive integer, got "${params.limit}".`, base);
      }

      const api = makeExecApi(ctx.cwd);
      const args = ['compute', 'instances', 'list'];
      // gcloud filters the instances list by zone with the `--zones` flag.
      if (params.zone) args.push('--zones', params.zone);
      if (params.filter) args.push('--filter', params.filter);
      if (params.limit !== undefined) args.push('--limit', String(params.limit));

      try {
        const raw = await execGcloudJson<unknown[]>(api, args, signal);
        const instances = normalizeInstances(raw);
        return textResult(formatInstanceTable(instances), { ...base, instances });
      } catch (err) {
        return errorResult(`Error: ${renderError(err)}`, { ...base, errorType: detectErrorType(err) });
      }
    },
  };
}
