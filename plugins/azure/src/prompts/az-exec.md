Execute any `az` CLI subcommand directly.

This is the general-purpose tool for running az commands that are not covered by the typed tools (az_account, az_group, az_resource, az_vm). Use typed tools when available — they validate inputs and return structured data.

## Usage

Pass the subcommand and flags as an array of arguments. Do NOT include `az` itself — it is prepended automatically.

**Example:** To run `az webapp list --resource-group myRG`:

```json
{ "args": ["webapp", "list", "--resource-group", "myRG"] }
```

## Safety

- Arguments are passed as an array directly to the `az` binary — **no shell** is involved, so shell metacharacters are inert and never filtered. Any valid `az` invocation runs, including full JMESPath `--query` syntax.
- **Read-only by default:** mutating verbs (`create`, `delete`, `update`, `set`, `purge`, `start`, `stop`, `restart`, `scale`, `restore`, …) are blocked. Run write/destructive operations through an explicitly confirmed path (delegate to the `cli-operator` agent), not `az_exec`.
- Output is capped to prevent context overflow.

## Querying with `--query` (JMESPath)

The full JMESPath grammar is supported — pass the expression as a single argument value. Common patterns:

- Field projection: `--query "[].{name:name, location:location}"`
- Filter: `--query "[?location=='eastus']"`
- Substring match: `--query "[?contains(name, 'prod')]"`
- Backtick literals (numbers/booleans/quoted enums): `` --query "[?powerState==`VM running`]" ``
- OR / AND / NOT: `--query "[?a=='x' || b=='y']"`, `--query "[?a && b]"`, `--query "[?!disabled]"`
- Pipe to post-process a projection: `--query "[].name | [0]"`

All of the above — including `||`, `|`, and backticks — are accepted verbatim.

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

- `--output json` is added automatically unless you pass your own `--output`/`-o` (e.g. `-o table`, `-o tsv`), which is respected
- Use `--subscription NAME_OR_ID` to target a specific subscription
- Use `--resource-group NAME` to scope to a resource group
- Use `az_help` tool first if unsure about available flags
