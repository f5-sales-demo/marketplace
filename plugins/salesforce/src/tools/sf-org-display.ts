import sfOrgDisplayDescription from '../prompts/sf-org-display.md' with { type: 'text' };
import { execSfJson } from '../sf/exec';
import { formatOrgDetail } from '../sf/formatters';
import type { SfOrg } from '../sf/types';
import { ORG_ALIAS_PATTERN } from '../sf/types';
import { detectErrorType, errorResult, makeExecApi, textResult } from './shared';

export function createSfOrgDisplayTool(pi: any) {
  const { Type } = pi.typebox;

  const parameters = Type.Object({
    target_org: Type.Optional(Type.String({ description: 'Org alias or username to display' })),
  });

  return {
    name: 'sf_org_display',
    label: 'Salesforce Org Display',
    description: sfOrgDisplayDescription,
    parameters,
    async execute(
      _toolCallId: string,
      params: { target_org?: string },
      signal: any,
      _onUpdate: any,
      ctx: { cwd: string },
    ) {
      const api = makeExecApi(ctx.cwd);
      const base = { tool: 'sf_org_display' as const };

      if (params.target_org && !ORG_ALIAS_PATTERN.test(params.target_org)) {
        return errorResult(
          `Error: invalid org alias "${params.target_org}". Only alphanumeric characters, dots, underscores, hyphens, and @ are allowed.`,
          base,
        );
      }

      const args = ['org', 'display'];
      if (params.target_org) args.push('--target-org', params.target_org);

      try {
        const result = await execSfJson(api, args, signal);
        const raw = result.result as Record<string, unknown>;

        // SECURITY: only extract whitelisted fields
        const org: SfOrg = {
          username: String(raw.username ?? ''),
          orgId: String(raw.id ?? raw.orgId ?? ''),
          instanceUrl: String(raw.instanceUrl ?? ''),
          connectedStatus: String(raw.connectedStatus ?? 'Connected'),
          alias: raw.alias ? String(raw.alias) : undefined,
          isDefault: false,
          isSandbox: Boolean(raw.isSandbox ?? false),
        };

        return textResult(formatOrgDetail(org), { ...base, orgs: [org] });
      } catch (err) {
        const errorType = detectErrorType(err);
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(message, { ...base, errorType });
      }
    },
  };
}
