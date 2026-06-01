List Azure Virtual Machines via `az vm list`.

## Usage

```
az vm list [--resource-group NAME] [--show-details] [--vmss VMSS_ID] [--subscription NAME_OR_ID]
```

## Flags

| Flag | Description |
|------|-------------|
| `--resource-group`, `-g` | Filter by resource group |
| `--show-details`, `-d` | Include public IP, FQDN, and power state. **Runs slower.** |
| `--vmss` | List VMs in a specific Virtual Machine Scale Set |
| `--subscription` | Name or ID of subscription |

## Output Fields (JSON)

Without `--show-details`:

- `id` — Full resource ID
- `name` — VM name
- `location` — Azure region
- `resourceGroup` — Parent resource group
- `hardwareProfile.vmSize` — VM size (e.g. Standard_D2s_v5)
- `storageProfile.osDisk.osType` — Linux or Windows
- `provisioningState` — Succeeded, Failed, etc.

With `--show-details`:

- All above fields plus:
- `powerState` — VM running, VM deallocated, VM stopped, etc.
- `publicIps` — Public IP addresses
- `fqdns` — Fully qualified domain names

## Common VM Operations

- `az vm show --name NAME --resource-group RG` — Show single VM
- `az vm start --name NAME --resource-group RG` — Start VM
- `az vm stop --name NAME --resource-group RG` — Stop VM
- `az vm deallocate --name NAME --resource-group RG` — Deallocate (stop billing)
- `az vm restart --name NAME --resource-group RG` — Restart VM
- `az vm list-ip-addresses --name NAME --resource-group RG` — Get IPs
- `az vm list-sizes --location LOCATION` — List available sizes
- `az vm open-port --name NAME --resource-group RG --port PORT` — Open port

## Notes

Without `--resource-group`, lists all VMs in the subscription.
`--show-details` makes additional API calls per VM, significantly slower on large fleets.
