import type { AwsExecApi } from '../aws/exec';
import { execAwsJson } from '../aws/exec';
import { formatIdentityDetail, normalizeIdentity } from '../aws/formatters';
import type { PluginInterface } from '../aws/types';
import { RESOURCE_NAME_PATTERN } from '../aws/types';
import awsStsWhoamiDescription from '../prompts/aws-sts-whoami.md' with { type: 'text' };
import { detectErrorType, errorResult, makeExecApi, renderError, textResult } from './shared';

/**
 * `makeApi` is injected by tests so a validation case can assert what the tool lets
 * through without spawning the real CLI.
 */
export function createAwsStsWhoamiTool(pi: PluginInterface, makeApi: (cwd: string) => AwsExecApi = makeExecApi) {
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
    description: awsStsWhoamiDescription,
    parameters,
    async execute(
      _toolCallId: string,
      params: { profile?: string },
      signal: AbortSignal | undefined,
      _onUpdate: unknown,
      ctx: { cwd: string },
    ) {
      const base = { tool: 'aws_sts_whoami' as const };

      const profile = params.profile !== undefined && /^ *$/.test(params.profile) ? undefined : params.profile;
      if (profile !== undefined && !RESOURCE_NAME_PATTERN.test(profile)) {
        return errorResult(
          `Error: invalid profile "${params.profile}". Only alphanumeric characters, dots, underscores, colons, slashes, and hyphens are allowed.`,
          base,
        );
      }

      const api = makeApi(ctx.cwd);
      const args = ['sts', 'get-caller-identity'];
      if (profile) args.push('--profile', profile);

      try {
        const raw = await execAwsJson<Record<string, unknown>>(api, args, signal);
        const identity = normalizeIdentity(raw);
        return textResult(formatIdentityDetail(identity), { ...base, identity });
      } catch (err) {
        return errorResult(`Error: ${renderError(err)}`, { ...base, errorType: detectErrorType(err) });
      }
    },
  };
}
