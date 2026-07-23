import { execGcloudJson } from '../gcloud/exec';
import { formatBucketTable, normalizeBuckets } from '../gcloud/formatters';
import type { PluginInterface } from '../gcloud/types';
import gcloudStorageBucketsListDescription from '../prompts/gcloud-storage-buckets-list.md' with { type: 'text' };
import { detectErrorType, errorResult, makeExecApi, renderError, textResult } from './shared';

export function createGcloudStorageBucketsListTool(pi: PluginInterface) {
  const { Type } = pi.typebox;

  const parameters = Type.Object({
    filter: Type.Optional(Type.String({ description: 'gcloud --filter expression, e.g. "location=US"' })),
    limit: Type.Optional(Type.Number({ description: 'Maximum number of buckets to return (positive integer)' })),
  });

  return {
    name: 'gcloud_storage_buckets_list',
    label: 'Google Cloud Storage Buckets',
    description: gcloudStorageBucketsListDescription,
    parameters,
    async execute(
      _toolCallId: string,
      params: { filter?: string; limit?: number },
      signal: AbortSignal | undefined,
      _onUpdate: unknown,
      ctx: { cwd: string },
    ) {
      const base = { tool: 'gcloud_storage_buckets_list' as const };

      if (params.limit !== undefined && (!Number.isInteger(params.limit) || params.limit <= 0)) {
        return errorResult(`Error: limit must be a positive integer, got "${params.limit}".`, base);
      }

      const api = makeExecApi(ctx.cwd);
      const args = ['storage', 'buckets', 'list'];
      // Bind value flags with the `=` form so a value beginning with `-` can never be
      // re-tokenised by gcloud as a separate flag (argv flag-smuggling defense).
      if (params.filter) args.push(`--filter=${params.filter}`);
      if (params.limit !== undefined) args.push(`--limit=${String(params.limit)}`);

      try {
        const raw = await execGcloudJson<unknown[]>(api, args, signal);
        const buckets = normalizeBuckets(raw);
        return textResult(formatBucketTable(buckets), { ...base, buckets });
      } catch (err) {
        return errorResult(`Error: ${renderError(err)}`, { ...base, errorType: detectErrorType(err) });
      }
    },
  };
}
