List Azure resources.

```
az resource list [--resource-group NAME] [--resource-type TYPE] [--location LOCATION] [--name NAME] [--tag KEY[=VALUE]] [--subscription NAME_OR_ID]
```

Flags: `--resource-group`/`-g`, `--resource-type` (e.g. `Microsoft.Compute/virtualMachines`), `--location`/`-l`, `--name`/`-n`, `--tag` (`key[=value]`), `--subscription`

Output: `id`, `name`, `type`, `location`, `resourceGroup`, `provisioningState`, `tags` (key=value pairs)

Always specify `--resource-group`.
