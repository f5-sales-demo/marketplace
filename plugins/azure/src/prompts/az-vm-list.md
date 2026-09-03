# List Azure virtual machines

Use `az vm list`.

## Usage

```json
{
  "resource_group": "optional-name",
  "subscription": "optional-name-or-id",
  "include_power_state": true,
  "include_network_identifiers": false
}
```

## Flags

| Parameter | Description |
| --- | --- |
| `resource_group` | Filter by resource group |
| `subscription` | Name or ID of subscription |
| `include_power_state` | Include runtime state. Defaults to `true` and may require additional Azure API calls. |
| `include_network_identifiers` | Include public IP addresses and FQDNs. Defaults to `false`; enable only for an explicit endpoint request. |

## Output Fields (JSON)

The result always includes:

- `id` — Full resource ID
- `name` — VM name
- `location` — Azure region
- `resourceGroup` — Parent resource group
- `vmSize` — VM size (for example, Standard_D2s_v5)
- `osType` — Linux or Windows
- `provisioningState` — Succeeded, Failed, etc.

With `include_power_state` enabled (the default):

- `powerState` — VM running, VM deallocated, VM stopped, etc.

Only with `include_network_identifiers: true`:

- `publicIps` — Public IP addresses as an array
- `fqdns` — Fully qualified domain names as an array

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

Without `resource_group`, the tool lists all VMs in the subscription. Runtime state and endpoint
lookups may require additional Azure API calls. Network identifiers are excluded from both text and
structured results unless `include_network_identifiers` is explicitly true.
