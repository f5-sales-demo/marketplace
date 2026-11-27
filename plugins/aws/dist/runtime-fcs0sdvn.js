// biome-ignore-all lint: Generated Bun bundle; lint the source modules instead.
// @bun

import {
  detectErrorType,
  errorResult,
  execAwsJson,
  execAwsRaw,
  makeExecApi,
  renderError,
  s3Args,
  textResult,
} from './runtime-30f0rzjf.js';
import { formatBucketTable, formatS3ObjectTable, normalizeBucket, parseS3LsOutput } from './runtime-gjz54hes.js';
import { S3_URI_PATTERN } from './runtime-qx26ysqj.js';

// plugins/aws/src/prompts/aws-s3-ls.md
var aws_s3_ls_default = `# List Amazon S3 Resources

List Amazon S3 buckets, or the contents of a bucket or prefix, via the AWS CLI.

## Usage

\`\`\`bash
aws s3api list-buckets --output json      # no target: list all buckets
aws s3 ls s3://bucket/prefix/             # with target: list objects/prefixes
\`\`\`

## Parameters

| Parameter | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| \`target\`  | Optional \`s3://bucket[/prefix]\` URI. Omit to list all buckets in the account. |

## Output Fields

Bucket listing (JSON):

- \`Name\` \u2014 Bucket name
- \`CreationDate\` \u2014 When the bucket was created

Object listing (text, parsed):

- \`key\` \u2014 Object key or common prefix (directory)
- \`size\` \u2014 Object size in bytes (0 for prefixes)
- \`lastModified\` \u2014 Last modified timestamp

## Notes

Without a target, buckets are listed globally for the account (bucket names are
not region-scoped). With a target, a trailing slash lists the contents of that
prefix; \`PRE\` entries are common prefixes ("folders").

For advanced filtering on the JSON bucket list, add \`--query\` with a JMESPath
expression, e.g. \`--query "Buckets[?starts_with(Name, 'log')].Name"\`.

## Related Commands

- \`aws s3 ls s3://bucket --recursive\` \u2014 List all objects under a bucket
- \`aws s3api head-object --bucket B --key K\` \u2014 Object metadata
`;

// plugins/aws/src/tools/aws-s3-ls.ts
function createAwsS3LsTool(pi, makeApi = makeExecApi) {
  const { Type } = pi.typebox;
  const parameters = Type.Object({
    target: Type.Optional(Type.String({ description: 'Optional s3://bucket[/prefix] URI. Omit to list all buckets.' })),
  });
  return {
    name: 'aws_s3_ls',
    label: 'AWS S3 List',
    description: aws_s3_ls_default,
    parameters,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const base = { tool: 'aws_s3_ls' };
      if (params.target !== undefined && !S3_URI_PATTERN.test(params.target)) {
        return errorResult(
          `Error: invalid S3 target "${params.target}". Must be an s3:// URI using lowercase letters, digits, dots, slashes, and hyphens.`,
          base,
        );
      }
      const api = makeApi(ctx.cwd);
      try {
        if (params.target) {
          const result = await execAwsRaw(api, s3Args(params.target), signal);
          const objects = parseS3LsOutput(result.stdout);
          return textResult(formatS3ObjectTable(objects), { ...base, objects });
        }
        const raw = await execAwsJson(api, s3Args(), signal);
        const buckets = (raw.Buckets ?? []).map(normalizeBucket);
        return textResult(formatBucketTable(buckets), { ...base, buckets });
      } catch (err) {
        return errorResult(`Error: ${renderError(err)}`, { ...base, errorType: detectErrorType(err) });
      }
    },
  };
}

export { createAwsS3LsTool };
