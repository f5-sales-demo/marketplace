import type { AwsExecApi } from '../aws/exec';
import { execAwsJson, execAwsRaw } from '../aws/exec';
import { formatBucketTable, formatS3ObjectTable, normalizeBucket, parseS3LsOutput } from '../aws/formatters';
import type { PluginInterface } from '../aws/types';
import { S3_URI_PATTERN } from '../aws/types';
import awsS3LsDescription from '../prompts/aws-s3-ls.md' with { type: 'text' };
import { detectErrorType, errorResult, makeExecApi, renderError, textResult } from './shared';

/**
 * `makeApi` is injected by tests so a validation case can assert what the tool lets
 * through without spawning the real CLI.
 */
export function createAwsS3LsTool(pi: PluginInterface, makeApi: (cwd: string) => AwsExecApi = makeExecApi) {
  const { Type } = pi.typebox;

  const parameters = Type.Object({
    target: Type.Optional(Type.String({ description: 'Optional s3://bucket[/prefix] URI. Omit to list all buckets.' })),
  });

  return {
    name: 'aws_s3_ls',
    label: 'AWS S3 List',
    description: awsS3LsDescription,
    parameters,
    async execute(
      _toolCallId: string,
      params: { target?: string },
      signal: AbortSignal | undefined,
      _onUpdate: unknown,
      ctx: { cwd: string },
    ) {
      const base = { tool: 'aws_s3_ls' as const };

      if (params.target !== undefined && !S3_URI_PATTERN.test(params.target)) {
        return errorResult(
          `Error: invalid S3 target "${params.target}". Must be an s3:// URI using lowercase letters, digits, dots, slashes, and hyphens.`,
          base,
        );
      }

      const api = makeApi(ctx.cwd);

      try {
        if (params.target) {
          const result = await execAwsRaw(api, ['s3', 'ls', params.target], signal);
          const objects = parseS3LsOutput(result.stdout);
          return textResult(formatS3ObjectTable(objects), { ...base, objects });
        }

        const raw = await execAwsJson<{ Buckets?: Record<string, unknown>[] }>(api, ['s3api', 'list-buckets'], signal);
        const buckets = (raw.Buckets ?? []).map(normalizeBucket);
        return textResult(formatBucketTable(buckets), { ...base, buckets });
      } catch (err) {
        return errorResult(`Error: ${renderError(err)}`, { ...base, errorType: detectErrorType(err) });
      }
    },
  };
}
