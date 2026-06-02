Execute any `az` subcommand. Use for commands not in typed tools (az_account, az_group, az_resource, az_vm).

Example `az storage account list --resource-group myRG` as array:

```json
{ "args": ["storage", "account", "list", "--resource-group", "myRG"] }
```

No shell metacharacters allowed. `--output json` added automatically.
Use `--subscription NAME_OR_ID` for specific subscription. Use `az_help` if unsure about flags.
