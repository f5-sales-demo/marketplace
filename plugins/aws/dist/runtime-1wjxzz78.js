// biome-ignore-all lint: Generated Bun bundle; lint the source modules instead.
// @bun

import {
  detectErrorType,
  errorResult,
  execAwsJson,
  identityArgs,
  makeExecApi,
  normalizeProfile,
  renderError,
  textResult,
} from './runtime-30f0rzjf.js';
import { formatIdentityDetail, normalizeIdentity } from './runtime-gjz54hes.js';
import { RESOURCE_NAME_PATTERN } from './runtime-qx26ysqj.js';

// plugins/aws/src/prompts/aws-sts-whoami.md
var aws_sts_whoami_default = `# Show AWS Caller Identity

Show the caller identity for the active AWS credentials via \`aws sts get-caller-identity\`.

## Usage

\`\`\`bash
aws sts get-caller-identity [--profile NAME] --output json
\`\`\`

## Parameters

| Parameter | Description                                                        |
| --------- | ------------------------------------------------------------------ |
| \`profile\` | Optional named profile from \`~/.aws/config\` / \`~/.aws/credentials\` |

## Output Fields (JSON)

- \`Account\` \u2014 12-digit AWS account ID
- \`Arn\` \u2014 ARN of the calling principal (IAM user, assumed role, etc.)
- \`UserId\` \u2014 Unique identifier of the principal

## Notes

Use this to confirm which account and identity your credentials resolve to before
running privileged operations. It requires no IAM permissions and is the quickest
way to verify that a profile or SSO session is active.

For advanced field selection, add \`--query\` with a JMESPath expression, e.g.
\`--query Account\`.

## Related Commands

- \`aws configure list\` \u2014 Show the resolved credential/config sources
- \`xcsh plugin setup aws\` \u2014 Run the reviewed human-only setup flow for missing or expired authentication
`;

// plugins/aws/src/tools/aws-sts-whoami.ts
function createAwsStsWhoamiTool(pi, makeApi = makeExecApi) {
  const { Type } = pi.typebox;
  const parameters = Type.Object({
    profile: Type.Optional(
      Type.String({
        description:
          'Named AWS profile. Omit, use an empty string, or use spaces for the existing default profile. Control characters and unsafe nonblank names are rejected.',
      }),
    ),
  });
  return {
    name: 'aws_sts_whoami',
    label: 'AWS Caller Identity',
    description: aws_sts_whoami_default,
    parameters,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const base = { tool: 'aws_sts_whoami' };
      const profile = normalizeProfile(params.profile);
      if (profile !== undefined && !RESOURCE_NAME_PATTERN.test(profile)) {
        return errorResult(
          `Error: invalid profile "${params.profile}". Only alphanumeric characters, dots, underscores, colons, slashes, and hyphens are allowed.`,
          base,
        );
      }
      const api = makeApi(ctx.cwd);
      const args = identityArgs(profile);
      try {
        const raw = await execAwsJson(api, args, signal);
        const identity = normalizeIdentity(raw);
        return textResult(formatIdentityDetail(identity), { ...base, identity });
      } catch (err) {
        return errorResult(`Error: ${renderError(err)}`, { ...base, errorType: detectErrorType(err) });
      }
    },
  };
}

export { createAwsStsWhoamiTool };
