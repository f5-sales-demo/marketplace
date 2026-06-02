`az vm` — virtual machines. `vm list [--resource-group NAME] [--show-details] [--vmss ID] [--subscription ID]`.

Flags: `--resource-group`/`-g`, `--show-details`/`-d` (adds IPs/FQDN/power — slower), `--vmss`, `--subscription`.

Output: `id`, `name`, `location`, `resourceGroup`, `vmSize`, `osType`, `provisioningState`. With `--show-details`: `powerState`, `publicIps`, `fqdns`.
