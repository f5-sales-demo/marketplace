List Azure resources via `az resource list`.

## Usage

```
az resource list [--resource-group NAME] [--resource-type TYPE] [--location LOCATION] [--name NAME] [--tag KEY[=VALUE]] [--subscription NAME_OR_ID]
```

## Flags

| Flag | Description |
|------|-------------|
| `--resource-group`, `-g` | Filter by resource group |
| `--resource-type` | Filter by type (e.g. `Microsoft.Compute/virtualMachines`) |
| `--location`, `-l` | Filter by region |
| `--name`, `-n` | Filter by resource name |
| `--tag` | Filter by tag in `key[=value]` format |
| `--subscription` | Name or ID |

## Output

`id`, `name`, `type`, `location`, `resourceGroup`, `provisioningState`, `tags` (key=value pairs)

Always specify `--resource-group` to avoid listing the entire subscription.
