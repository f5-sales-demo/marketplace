Show or list Azure subscriptions via `az account`.

## Actions

**show** — Current or specified subscription.

```
az account show [--subscription NAME_OR_ID]
```

**list** — All subscriptions (default: only Enabled).

```
az account list [--all] [--refresh]
```

## Flags

| Flag | Applies To | Description |
|------|-----------|-------------|
| `--subscription`, `-s` | show | Name or ID |
| `--all` | list | Include non-Enabled |
| `--refresh` | list | Refresh from server |

## Output

`id`, `name`, `state`, `isDefault`, `tenantId`, `user.name`, `user.type`
