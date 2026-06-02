List Azure Virtual Machines via `az vm list`.

## Usage

```
az vm list [--resource-group NAME] [--show-details] [--vmss VMSS_ID] [--subscription NAME_OR_ID]
```

## Flags

| Flag | Description |
|------|-------------|
| `--resource-group`, `-g` | Filter by resource group |
| `--show-details`, `-d` | Include public IP, FQDN, power state (**slower**) |
| `--vmss` | List VMs in a specific VMSS |
| `--subscription` | Name or ID |

## Output

Standard: `id`, `name`, `location`, `resourceGroup`, `hardwareProfile.vmSize`, `storageProfile.osDisk.osType`, `provisioningState`

With `--show-details`: adds `powerState`, `publicIps`, `fqdns`
