List Azure resources via `az resource list`.

## Usage

```
az resource list [--resource-group NAME] [--resource-type TYPE] [--location LOCATION] [--name NAME] [--tag KEY[=VALUE]] [--subscription NAME_OR_ID]
```

## Flags

| Flag | Description |
|------|-------------|
| `--resource-group`, `-g` | Filter by resource group name |
| `--resource-type` | Filter by type (e.g. `Microsoft.Compute/virtualMachines`). Accepts `namespace/type` format. |
| `--location`, `-l` | Filter by region |
| `--name`, `-n` | Filter by resource name |
| `--tag` | Filter by tag in `key[=value]` format |
| `--subscription` | Name or ID of subscription |

## Output Fields (JSON)

- `id` — Full resource ID
- `name` — Resource name
- `type` — Resource type (e.g. `Microsoft.Compute/virtualMachines`)
- `location` — Azure region
- `resourceGroup` — Parent resource group
- `provisioningState` — Succeeded, Failed, etc.
- `tags` — Key-value tag pairs

## Common Resource Types

- `Microsoft.Compute/virtualMachines` — VMs
- `Microsoft.Storage/storageAccounts` — Storage
- `Microsoft.Network/virtualNetworks` — VNets
- `Microsoft.Network/publicIPAddresses` — Public IPs
- `Microsoft.Network/networkSecurityGroups` — NSGs
- `Microsoft.Web/sites` — App Service / Functions
- `Microsoft.ContainerService/managedClusters` — AKS
- `Microsoft.Sql/servers` — SQL servers
- `Microsoft.KeyVault/vaults` — Key Vaults

## Notes

Without `--resource-group`, lists all resources in the subscription (can be large). Always specify a resource group when possible.

## Related Commands

- `az resource show --ids RESOURCE_ID` — Show single resource
- `az resource delete --ids RESOURCE_ID` — Delete resource
- `az resource tag --ids RESOURCE_ID --tags KEY=VALUE` — Tag resource
