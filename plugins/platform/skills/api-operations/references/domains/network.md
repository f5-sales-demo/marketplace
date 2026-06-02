# Network

BGP peering, IPsec tunnels, and segment policies.

Category: Networking. Complexity: advanced. Paths: 81. Schemas: 485.

## Use Cases

- Configure BGP routing and ASN management
- Manage IPsec tunnels and IKE phases
- Configure network connectors and routes
- Manage SRv6 and subnetting
- Define segment connections and policies
- Configure IP prefix sets

## Resources

| Resource | Description | Tier | CRUD | Profile |
| ---------- | ------------- | ------ | ------ | --------- |
| virtual_network | Virtual network | Standard | C/R/U/D/L | resources/network/virtual_network.md |
| network_connector | Network connector | Advanced | C/R/U/D/L | resources/network/network_connector.md |
| site_mesh_group | Site mesh group | Advanced | - | resources/network/site_mesh_group.md |

## Dependency Graph

- network_connector requires: virtual_network
- site_mesh_group requires: site

## Creation Order

1. virtual_network (no dependencies)
2. network_connector (depends: virtual_network)
3. site_mesh_group (depends: site)

## Related Domains

`virtual`, `network_security`, `dns`
