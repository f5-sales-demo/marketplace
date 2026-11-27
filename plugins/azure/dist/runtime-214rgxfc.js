// biome-ignore-all lint: Generated Bun bundle; lint the source modules instead.
// @bun
import {
  accountArgs,
  detectErrorType,
  errorResult,
  execAzJson,
  formatSubscriptionDetail,
  formatSubscriptionTable,
  makeExecApi,
  normalizeSubscription,
  SUBSCRIPTION_ID_PATTERN,
  SUBSCRIPTION_NAME_PATTERN,
  textResult,
} from './runtime-2139fbqg.js';

// plugins/azure/src/prompts/az-account-show.md
var az_account_show_default = `# Show or list Azure subscriptions

Use \`az account\`.

## Actions

**show** \u2014 Get details of the current (or specified) subscription.

\`\`\`bash
az account show [--subscription NAME_OR_ID]
\`\`\`

**list** \u2014 List subscriptions for the logged-in account. By default only 'Enabled' subscriptions are shown.

\`\`\`bash
az account list [--all] [--refresh]
\`\`\`

## Flags

| Flag | Applies To | Description |
| --- | --- | --- |
| \`--subscription\`, \`-s\`, \`-n\` | show | Name or ID of subscription |
| \`--all\` | list | Include subscriptions that are not 'Enabled' |
| \`--refresh\` | list | Retrieve up-to-date subscriptions from server |

## Output Fields (JSON)

- \`id\` \u2014 Subscription UUID
- \`name\` \u2014 Display name
- \`state\` \u2014 Enabled, Disabled, Warned, etc.
- \`isDefault\` \u2014 Whether this is the active subscription
- \`tenantId\` \u2014 Azure AD tenant UUID
- \`user.name\` \u2014 Authenticated user/principal
- \`user.type\` \u2014 "user", "servicePrincipal", etc.

## Related Commands

- \`az account set -s NAME_OR_ID\` \u2014 Switch active subscription
- \`az account get-access-token\` \u2014 Get token for API access
- \`az account list-locations\` \u2014 List regions for current subscription
`;

// plugins/azure/src/tools/az-account-show.ts
function createAzAccountShowTool(pi, makeApi = makeExecApi) {
  const { Type } = pi.typebox;
  const parameters = Type.Object({
    action: Type.Union([Type.Literal('show'), Type.Literal('list')], {
      description: 'show = current subscription, list = all subscriptions',
    }),
    subscription: Type.Optional(Type.String({ description: 'Filter by subscription name or ID' })),
  });
  return {
    name: 'az_account_show',
    label: 'Azure Account',
    description: az_account_show_default,
    parameters,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const base = { tool: 'az_account_show', action: params.action };
      if (params.subscription) {
        const isUuid = SUBSCRIPTION_ID_PATTERN.test(params.subscription);
        const isName = SUBSCRIPTION_NAME_PATTERN.test(params.subscription);
        if (!isUuid && !isName) {
          return errorResult(
            `Error: invalid subscription "${params.subscription}". Only alphanumeric characters, spaces, dots, underscores, and hyphens are allowed.`,
            base,
          );
        }
      }
      const api = makeApi(ctx.cwd);
      try {
        if (params.action === 'list') {
          const raw = await execAzJson(api, accountArgs(params), signal);
          let subs = raw.map(normalizeSubscription);
          if (params.subscription) {
            const filter = params.subscription.toLowerCase();
            subs = subs.filter((s) => s.name.toLowerCase().includes(filter) || s.id.toLowerCase().includes(filter));
          }
          return textResult(formatSubscriptionTable(subs), { ...base, subscriptions: subs });
        }
        const args = accountArgs(params);
        const raw = await execAzJson(api, args, signal);
        const sub = normalizeSubscription(raw);
        return textResult(formatSubscriptionDetail(sub), { ...base, subscriptions: [sub] });
      } catch (err) {
        return errorResult(`Error: ${err instanceof Error ? err.message : String(err)}`, {
          ...base,
          errorType: detectErrorType(err),
        });
      }
    },
  };
}

export { createAzAccountShowTool };
