Execute any `az` CLI subcommand directly.

Use for commands not covered by typed tools (az_account, az_group, az_resource, az_vm). Prefer typed tools when available.

## Usage

Pass subcommand and flags as an array. Do NOT include `az` itself.

**Example:** `az storage account list --resource-group myRG`:

```json
{ "args": ["storage", "account", "list", "--resource-group", "myRG"] }
```

## Safety

- No shell metacharacters (`;`, `|`, `$`, backticks, `&&`, `||`) allowed
- Arguments passed as array — no shell interpretation
- Output capped to prevent context overflow

## Tips

- `--output json` added automatically
- Use `--subscription NAME_OR_ID` to target a subscription
- Use `az_help` tool first if unsure about flags
