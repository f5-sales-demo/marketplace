List or show Azure resource groups via `az group`.

## Actions

**list** — List all resource groups in the current subscription.

```
az group list [--subscription NAME_OR_ID] [--tag KEY[=VALUE]]
```

**show** — Get details of a specific resource group.

```
az group show --name NAME [--subscription NAME_OR_ID]
```

## Flags

| Flag | Applies To | Description |
|------|-----------|-------------|
| `--subscription` | list, show | Name or ID of subscription |
| `--tag` | list | Filter by tag in `key[=value]` format |
| `--name`, `-n` | show | Resource group name (required for show) |

## Output Fields (JSON)

- `id` — Full resource ID
- `name` — Resource group name
- `location` — Azure region (e.g. eastus, westus2)
- `properties.provisioningState` — Succeeded, Failed, etc.
- `tags` — Key-value tag pairs

## Naming Rules

Resource group names: 1-90 chars, alphanumeric, periods, underscores, hyphens, parentheses. Cannot end with a period.

## Related Commands

- `az group create --name NAME --location LOCATION` — Create resource group
- `az group delete --name NAME` — Delete resource group
- `az group exists --name NAME` — Check if exists (returns true/false)
- `az group export --name NAME` — Export as ARM template
