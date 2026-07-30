import sfDescribeDescription from '../prompts/sf-describe.md' with { type: 'text' };
import { formatDescribe, normalizeDescribe } from '../sf/describe';
import type { SfExecApi } from '../sf/exec';
import { execSfJson } from '../sf/exec';
import { ORG_ALIAS_PATTERN, SOBJECT_NAME_PATTERN } from '../sf/types';
import type { PluginHost, ToolUpdateCallback } from './plugin-host';
import { detectErrorType, errorResult, makeExecApi, textResult } from './shared';

/**
 * `makeApi` is injected by tests so a validation case can assert what the tool lets
 * through without spawning the real CLI.
 */
export function createSfDescribeTool(pi: PluginHost, makeApi: (cwd: string) => SfExecApi = makeExecApi) {
  const { Type } = pi.typebox;

  const parameters = Type.Object({
    sobject: Type.String({ description: 'API name of the object, e.g. Opportunity, Account, My_Object__c' }),
    match: Type.Optional(
      Type.String({
        description:
          "Case-insensitive substring matched against field API names, field labels, and child relationships (e.g. 'competitor', 'territory', 'acv')",
      }),
    ),
    target_org: Type.Optional(Type.String({ description: 'Org alias or username to describe against' })),
  });

  return {
    name: 'sf_describe',
    label: 'Salesforce Describe',
    description: sfDescribeDescription,
    parameters,
    async execute(
      _toolCallId: string,
      params: { sobject: string; match?: string; target_org?: string },
      signal: AbortSignal | undefined,
      _onUpdate: ToolUpdateCallback | undefined,
      ctx: { cwd: string },
    ) {
      const base = { tool: 'sf_describe' as const, action: 'describe' };
      const sobject = (params.sobject ?? '').trim();

      if (!sobject) {
        return errorResult('Error: sobject is required, e.g. { sobject: "Opportunity" }.', base);
      }
      // A bare identifier only. Blocks both shell metacharacters and an argv-injected flag
      // (a leading '-' would otherwise be read by sf as an option, not as the object name).
      if (!SOBJECT_NAME_PATTERN.test(sobject)) {
        return errorResult(
          `Error: invalid sobject "${sobject}". Object API names contain only letters, numbers, and underscores.`,
          base,
        );
      }
      if (params.target_org && !ORG_ALIAS_PATTERN.test(params.target_org)) {
        return errorResult(
          `Error: invalid org alias "${params.target_org}". Only alphanumeric characters, dots, underscores, hyphens, and @ are allowed.`,
          base,
        );
      }

      const args = ['sobject', 'describe', '--sobject', sobject];
      if (params.target_org) args.push('--target-org', params.target_org);

      try {
        const api = makeApi(ctx.cwd);
        const result = await execSfJson(api, args, signal);
        const described = normalizeDescribe(result.result);
        if (!described.name) described.name = sobject;
        return textResult(formatDescribe(described, params.match), base);
      } catch (err) {
        const errorType = detectErrorType(err);
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(message, { ...base, errorType });
      }
    },
  };
}
