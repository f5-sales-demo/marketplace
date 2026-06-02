List Azure VMs.

```
az vm list [--resource-group NAME] [--show-details] [--vmss VMSS_ID] [--subscription NAME_OR_ID]
```

Flags: `--resource-group`/`-g`, `--show-details`/`-d` (adds IPs, FQDN, power state — **slower**), `--vmss`, `--subscription`

Output: `id`, `name`, `location`, `resourceGroup`, `vmSize`, `osType`, `provisioningState`

With `--show-details`: adds `powerState`, `publicIps`, `fqdns`
