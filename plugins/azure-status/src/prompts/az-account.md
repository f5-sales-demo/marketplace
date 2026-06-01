Show or list Azure subscriptions via `az account`.

## Actions

**show** — Get details of the current (or specified) subscription.

```
az account show [--subscription NAME_OR_ID]
```

**list** — List subscriptions for the logged-in account. By default only 'Enabled' subscriptions are shown.

```
az account list [--all] [--refresh]
```

## Flags

| Flag | Applies To | Description |
|------|-----------|-------------|
| `--subscription`, `-s`, `-n` | show | Name or ID of subscription |
| `--all` | list | Include subscriptions that are not 'Enabled' |
| `--refresh` | list | Retrieve up-to-date subscriptions from server |

## Output Fields (JSON)

- `id` — Subscription UUID
- `name` — Display name
- `state` — Enabled, Disabled, Warned, etc.
- `isDefault` — Whether this is the active subscription
- `tenantId` — Azure AD tenant UUID
- `user.name` — Authenticated user/principal
- `user.type` — "user", "servicePrincipal", etc.

## Related Commands

- `az account set -s NAME_OR_ID` — Switch active subscription
- `az account get-access-token` — Get token for API access
- `az account list-locations` — List regions for current subscription
