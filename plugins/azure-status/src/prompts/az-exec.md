Run any `az` subcommand not covered by typed tools. Args as array, no `az` prefix.

Example `az storage account list`: `{ "args": ["storage", "account", "list", "--resource-group", "myRG"] }`.

No shell metacharacters. `--output json` auto-added. Use `--subscription` to target. Use `az_help` for flag discovery.
