List or show Azure resource groups.

**list**: `az group list [--subscription NAME_OR_ID] [--tag KEY[=VALUE]]`

**show**: `az group show --name NAME [--subscription NAME_OR_ID]`

Flags: `--subscription` (name or ID), `--tag` (filter by `key[=value]` format), `--name`/`-n` (required for show)

Output: `id`, `name`, `location`, `provisioningState`, `tags` (key=value pairs)
