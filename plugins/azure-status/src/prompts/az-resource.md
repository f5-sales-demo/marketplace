`az resource` — list resources. `resource list --resource-group NAME [--resource-type TYPE] [--location LOC] [--name NAME] [--tag KEY[=VALUE]] [--subscription ID]`.

Flags: `--resource-group`/`-g`, `--resource-type` (e.g. `Microsoft.Compute/virtualMachines`), `--tag` (`key[=value]`), `--subscription`.

Output: `id`, `name`, `type`, `location`, `resourceGroup`, `provisioningState`, `tags` (key=value pairs). Always specify `--resource-group`.
