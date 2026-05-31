import { getLoadProfile } from '../context/salesforce-context';
import sfSetupDescription from '../prompts/sf-setup.md' with { type: 'text' };
import { execSfJson, execSfRaw } from '../sf/exec';
import { formatOrgTable } from '../sf/formatters';
import { ORG_ALIAS_PATTERN } from '../sf/types';
import { collectAllOrgs, detectErrorType, errorResult, makeExecApi, textResult } from './shared';

export function createSfSetupTool(pi: any) {
  const { Type } = pi.typebox;

  const parameters = Type.Object({
    action: Type.Union(
      [
        Type.Literal('check'),
        Type.Literal('status'),
        Type.Literal('login'),
        Type.Literal('list_orgs'),
        Type.Literal('set_default'),
      ],
      { description: 'Onboarding action to perform' },
    ),
    org: Type.Optional(Type.String({ description: 'Org alias (used with set_default)' })),
  });

  return {
    name: 'sf_setup',
    label: 'Salesforce Setup',
    description: sfSetupDescription,
    parameters,
    async execute(
      _toolCallId: string,
      params: { action: string; org?: string },
      signal: any,
      _onUpdate: any,
      ctx: { cwd: string },
    ) {
      const api = makeExecApi(ctx.cwd);
      const base = { tool: 'sf_setup' as const, action: params.action };

      try {
        switch (params.action) {
          case 'check': {
            const result = await execSfRaw(api, ['--version'], signal);
            return textResult(`sf is installed: ${result.stdout}`, base);
          }

          case 'status': {
            const orgResult = await execSfJson(api, ['org', 'list'], signal);
            const allOrgs = collectAllOrgs(orgResult.result as Record<string, unknown[]>);
            let output = formatOrgTable(allOrgs);

            const loadProfile = getLoadProfile();
            if (loadProfile) {
              const userProfile = await loadProfile();
              if (userProfile.givenName || userProfile.familyName) {
                const name = [userProfile.givenName, userProfile.familyName].filter(Boolean).join(' ');
                output += `\n\nUser profile: **${name}** (${userProfile.email ?? 'no email'})`;
              }
            }

            return textResult(output, { ...base, orgs: allOrgs });
          }

          case 'login': {
            const orgResult = await execSfJson(api, ['org', 'list'], signal);
            const allOrgs = collectAllOrgs(orgResult.result as Record<string, unknown[]>);
            if (allOrgs.length > 0) {
              return textResult("Already authenticated. Use 'status' action to see your orgs and profile.", {
                ...base,
                orgs: allOrgs,
              });
            }
            return textResult(
              'No authenticated orgs found.\n\nRun one of these commands to authenticate:\n' +
                '- **Workstation**: `sf org login web --set-default --alias SFDC`\n' +
                '- **Container**: `echo "$SFDX_AUTH_URL" | sf org login sfdx-url --sfdx-url-stdin=- --set-default --alias f5`\n\n' +
                "After authenticating, call sf_setup with action 'status' to confirm.",
              base,
            );
          }

          case 'list_orgs': {
            const orgResult = await execSfJson(api, ['org', 'list'], signal);
            const allOrgs = collectAllOrgs(orgResult.result as Record<string, unknown[]>);
            return textResult(formatOrgTable(allOrgs), { ...base, orgs: allOrgs });
          }

          case 'set_default': {
            if (!params.org) {
              return errorResult('Error: org parameter is required for set_default action.', base);
            }
            if (!ORG_ALIAS_PATTERN.test(params.org)) {
              return errorResult(
                `Error: invalid org alias "${params.org}". Only alphanumeric characters, dots, underscores, hyphens, and @ are allowed.`,
                base,
              );
            }
            await execSfRaw(api, ['config', 'set', 'target-org', params.org, '--global'], signal);
            return textResult(`Default org set to: **${params.org}**`, base);
          }

          default:
            return textResult(`Unknown action: ${params.action}`, base);
        }
      } catch (err) {
        const errorType = detectErrorType(err);
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(message, { ...base, errorType });
      }
    },
  };
}
