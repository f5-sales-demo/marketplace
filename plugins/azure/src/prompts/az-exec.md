Execute any `az` CLI subcommand directly.

This is the general-purpose tool for running az commands that are not covered by the typed tools (az_account, az_group, az_resource, az_vm). Use typed tools when available — they validate inputs and return structured data.

## Usage

Pass the subcommand and flags as an array of arguments. Do NOT include `az` itself — it is prepended automatically.

**Example:** To run `az webapp list --resource-group myRG`:

```json
{ "args": ["webapp", "list", "--resource-group", "myRG"] }
```

## Safety

- Each argument is validated: no shell metacharacters (`;`, `|`, `$`, backticks, `&&`, `||`) are allowed
- Arguments are passed as an array to `Bun.spawn` — no shell interpretation occurs
- Output is capped to prevent context overflow

## Common Subcommands Not Covered by Typed Tools

- `az webapp list` / `az webapp show` — App Service
- `az aks list` / `az aks show` — Kubernetes Service
- `az storage account list` — Storage accounts
- `az network vnet list` — Virtual Networks
- `az network nsg list` — Network Security Groups
- `az sql server list` — SQL servers
- `az keyvault list` — Key Vaults
- `az container list` — Container Instances
- `az acr list` — Container Registries
- `az functionapp list` — Function Apps

## Tips

- Always include `--output json` for machine-readable output (added automatically)
- Use `--subscription NAME_OR_ID` to target a specific subscription
- Use `--resource-group NAME` to scope to a resource group
- Use `az_help` tool first if unsure about available flags
