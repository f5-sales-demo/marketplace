// biome-ignore-all lint: Generated Bun bundle; lint the source modules instead.
// @bun
import {
  detectErrorType,
  errorResult,
  execAzJson,
  formatResourceTable,
  makeExecApi,
  normalizeResource,
  RESOURCE_GROUP_PATTERN,
  RESOURCE_TYPE_PATTERN,
  resourceArgs,
  SUBSCRIPTION_ID_PATTERN,
  SUBSCRIPTION_NAME_PATTERN,
  textResult,
} from './runtime-2139fbqg.js';

// plugins/azure/src/prompts/az-resource-list.md
var az_resource_list_default =
  '# List Azure resources\n\nUse `az resource list`.\n\n## Usage\n\n```bash\naz resource list [--resource-group NAME] [--resource-type TYPE] [--location LOCATION] [--name NAME] [--tag KEY[=VALUE]] [--subscription NAME_OR_ID]\n```\n\n## Flags\n\n| Flag | Description |\n| --- | --- |\n| `--resource-group`, `-g` | Filter by resource group name |\n| `--resource-type` | Filter by type (e.g. `Microsoft.Compute/virtualMachines`). Accepts `namespace/type` format. |\n| `--location`, `-l` | Filter by region |\n| `--name`, `-n` | Filter by resource name |\n| `--tag` | Filter by tag in `key[=value]` format |\n| `--subscription` | Name or ID of subscription |\n\n## Output Fields (JSON)\n\n- `id` \u2014 Full resource ID\n- `name` \u2014 Resource name\n- `type` \u2014 Resource type (e.g. `Microsoft.Compute/virtualMachines`)\n- `location` \u2014 Azure region\n- `resourceGroup` \u2014 Parent resource group\n- `provisioningState` \u2014 Succeeded, Failed, etc.\n- `tags` \u2014 Key-value tag pairs\n\n## Common Resource Types\n\n- `Microsoft.Compute/virtualMachines` \u2014 VMs\n- `Microsoft.Storage/storageAccounts` \u2014 Storage\n- `Microsoft.Network/virtualNetworks` \u2014 VNets\n- `Microsoft.Network/publicIPAddresses` \u2014 Public IPs\n- `Microsoft.Network/networkSecurityGroups` \u2014 NSGs\n- `Microsoft.Web/sites` \u2014 App Service / Functions\n- `Microsoft.ContainerService/managedClusters` \u2014 AKS\n- `Microsoft.Sql/servers` \u2014 SQL servers\n- `Microsoft.KeyVault/vaults` \u2014 Key Vaults\n\n## Notes\n\nWithout `--resource-group`, lists all resources in the subscription (can be large). Always specify a resource group when possible.\n\n## Related Commands\n\n- `az resource show --ids RESOURCE_ID` \u2014 Show single resource\n- `az resource delete --ids RESOURCE_ID` \u2014 Delete resource\n- `az resource tag --ids RESOURCE_ID --tags KEY=VALUE` \u2014 Tag resource\n';

// plugins/azure/src/tools/az-resource-list.ts
function createAzResourceListTool(pi, makeApi = makeExecApi) {
  const { Type } = pi.typebox;
  const parameters = Type.Object({
    resource_group: Type.String({ description: 'Resource group name (required to avoid listing entire subscription)' }),
    subscription: Type.Optional(Type.String({ description: 'Subscription name or ID' })),
    resource_type: Type.Optional(
      Type.String({ description: 'Filter by type (e.g. Microsoft.Compute/virtualMachines)' }),
    ),
  });
  return {
    name: 'az_resource_list',
    label: 'Azure Resources',
    description: az_resource_list_default,
    parameters,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const base = { tool: 'az_resource_list' };
      if (!params.resource_group || !RESOURCE_GROUP_PATTERN.test(params.resource_group)) {
        return errorResult(
          `Error: invalid resource group "${params.resource_group}". Only alphanumeric characters, periods, underscores, hyphens, and parentheses are allowed.`,
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
      if (params.resource_type && !RESOURCE_TYPE_PATTERN.test(params.resource_type)) {
        return errorResult(
          `Error: invalid resource type "${params.resource_type}". Use format like Microsoft.Compute/virtualMachines.`,
          base,
        );
      }
      const api = makeApi(ctx.cwd);
      const args = resourceArgs(params);
      try {
        const raw = await execAzJson(api, args, signal);
        const resources = raw.map(normalizeResource);
        return textResult(formatResourceTable(resources), { ...base, resources });
      } catch (err) {
        return errorResult(`Error: ${err instanceof Error ? err.message : String(err)}`, {
          ...base,
          errorType: detectErrorType(err),
        });
      }
    },
  };
}

export { createAzResourceListTool };
