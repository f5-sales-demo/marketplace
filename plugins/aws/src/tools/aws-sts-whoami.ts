import { execAwsJson } from '../aws/exec';
import { formatIdentityDetail, normalizeIdentity } from '../aws/formatters';
import type { PluginInterface } from '../aws/types';
import { RESOURCE_NAME_PATTERN } from '../aws/types';
import awsStsWhoamiDescription from '../prompts/aws-sts-whoami.md' with { type: 'text' };
import { detectErrorType, errorResult, makeExecApi, renderError, textResult } from './shared';

export function createAwsStsWhoamiTool(pi: PluginInterface) {
  const { Type } = pi.typebox;

  const parameters = Type.Object({
    profile: Type.Optional(Type.String({ description: 'Named AWS profile to use' })),
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

      if (params.profile !== undefined && !RESOURCE_NAME_PATTERN.test(params.profile)) {
        return errorResult(
          `Error: invalid profile "${params.profile}". Only alphanumeric characters, dots, underscores, colons, slashes, and hyphens are allowed.`,
          base,
        );
      }

      const api = makeExecApi(ctx.cwd);
      const args = ['sts', 'get-caller-identity'];
      if (params.profile) args.push('--profile', params.profile);

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
