List or show Azure resource groups via `az group`.

## Actions

**list** — All resource groups in current subscription.

```
az group list [--subscription NAME_OR_ID] [--tag KEY[=VALUE]]
```

**show** — Single resource group details.

```
az group show --name NAME [--subscription NAME_OR_ID]
```

## Flags

| Flag | Applies To | Description |
|------|-----------|-------------|
| `--subscription` | list, show | Name or ID |
| `--tag` | list | Filter by tag in `key[=value]` format |
| `--name`, `-n` | show | Resource group name (required) |

## Output

`id`, `name`, `location`, `properties.provisioningState`, `tags` (key=value pairs)
