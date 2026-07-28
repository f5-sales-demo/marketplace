import sfOrgDisplayDescription from '../prompts/sf-org-display.md' with { type: 'text' };
import type { SfExecApi } from '../sf/exec';
import { execSfJson } from '../sf/exec';
import { formatOrgDetail } from '../sf/formatters';
import type { SfOrg } from '../sf/types';
import { ORG_ALIAS_PATTERN } from '../sf/types';
import type { PluginHost, ToolUpdateCallback } from './plugin-host';
import { detectErrorType, errorResult, makeExecApi, textResult } from './shared';

/**
 * `makeApi` is injected by tests so a validation case can assert what the tool lets
 * through without spawning the real CLI.
 */
export function createSfOrgDisplayTool(pi: PluginHost, makeApi: (cwd: string) => SfExecApi = makeExecApi) {
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
      signal: AbortSignal | undefined,
      _onUpdate: ToolUpdateCallback | undefined,
      ctx: { cwd: string },
    ) {
      const api = makeApi(ctx.cwd);
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
