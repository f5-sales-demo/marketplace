// biome-ignore-all lint: Generated Bun bundle; lint the source modules instead.
// @bun
import {
  detectErrorType,
  errorResult,
  execAzJson,
  formatResourceGroupTable,
  groupArgs,
  makeExecApi,
  normalizeResourceGroup,
  RESOURCE_GROUP_PATTERN,
  SUBSCRIPTION_ID_PATTERN,
  SUBSCRIPTION_NAME_PATTERN,
  TAG_PATTERN,
  textResult,
} from './runtime-2139fbqg.js';

// plugins/azure/src/prompts/az-group-list.md
var az_group_list_default = `# List or show Azure resource groups

Use \`az group\`.

## Actions

**list** \u2014 List all resource groups in the current subscription.

\`\`\`bash
az group list [--subscription NAME_OR_ID] [--tag KEY[=VALUE]]
\`\`\`

**show** \u2014 Get details of a specific resource group.

\`\`\`bash
az group show --name NAME [--subscription NAME_OR_ID]
\`\`\`

## Flags

| Flag | Applies To | Description |
| --- | --- | --- |
| \`--subscription\` | list, show | Name or ID of subscription |
| \`--tag\` | list | Filter by tag in \`key[=value]\` format |
| \`--name\`, \`-n\` | show | Resource group name (required for show) |

## Output Fields (JSON)

- \`id\` \u2014 Full resource ID
- \`name\` \u2014 Resource group name
- \`location\` \u2014 Azure region (e.g. eastus, westus2)
- \`properties.provisioningState\` \u2014 Succeeded, Failed, etc.
- \`tags\` \u2014 Key-value tag pairs

## Naming Rules

Resource group names: 1-90 chars, alphanumeric, periods, underscores, hyphens, parentheses. Cannot end with a period.

## Related Commands

- \`az group create --name NAME --location LOCATION\` \u2014 Create resource group
- \`az group delete --name NAME\` \u2014 Delete resource group
- \`az group exists --name NAME\` \u2014 Check if exists (returns true/false)
- \`az group export --name NAME\` \u2014 Export as ARM template
`;

// plugins/azure/src/tools/az-group-list.ts
function createAzGroupListTool(pi, makeApi = makeExecApi) {
  const { Type } = pi.typebox;
  const parameters = Type.Object({
    action: Type.Union([Type.Literal('list'), Type.Literal('show')], {
      description: 'list = all resource groups, show = single resource group details',
    }),
    name: Type.Optional(Type.String({ description: 'Resource group name (required for show)' })),
    subscription: Type.Optional(Type.String({ description: 'Subscription name or ID' })),
    tag: Type.Optional(Type.String({ description: 'Filter by tag in key[=value] format' })),
  });
  return {
    name: 'az_group_list',
    label: 'Azure Resource Groups',
    description: az_group_list_default,
    parameters,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const base = { tool: 'az_group_list', action: params.action };
      if (params.name && !RESOURCE_GROUP_PATTERN.test(params.name)) {
        return errorResult(
          `Error: invalid resource group name "${params.name}". Only alphanumeric characters, periods, underscores, hyphens, and parentheses are allowed.`,
          base,
        );
      }
      if (params.subscription) {
        const isUuid = SUBSCRIPTION_ID_PATTERN.test(params.subscription);
        const isName = SUBSCRIPTION_NAME_PATTERN.test(params.subscription);
        if (!isUuid && !isName) {
          return errorResult(`Error: invalid subscription "${params.subscription}".`, base);
        }
      }
      if (params.tag && !TAG_PATTERN.test(params.tag)) {
        return errorResult(
          `Error: invalid tag "${params.tag}". Use format key[=value] with safe characters only.`,
          base,
        );
      }
      const api = makeApi(ctx.cwd);
      try {
        if (params.action === 'show') {
          if (!params.name) {
            return errorResult('Error: --name is required for show action.', base);
          }
          const args = groupArgs(params);
          const raw = await execAzJson(api, args, signal);
          const group = normalizeResourceGroup(raw);
          return textResult(formatResourceGroupTable([group]), { ...base, resourceGroups: [group] });
        }
        const args = groupArgs(params);
        const raw = await execAzJson(api, args, signal);
        const groups = raw.map(normalizeResourceGroup);
        return textResult(formatResourceGroupTable(groups), { ...base, resourceGroups: groups });
      } catch (err) {
        return errorResult(`Error: ${err instanceof Error ? err.message : String(err)}`, {
          ...base,
          errorType: detectErrorType(err),
        });
      }
    },
  };
}

export { createAzGroupListTool };
