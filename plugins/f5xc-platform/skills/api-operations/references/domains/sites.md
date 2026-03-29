# Sites

Cloud and edge node deployments.

Category: Infrastructure. Complexity: advanced. Paths: 133. Schemas: 1093.

## Use Cases

- Deploy F5 XC across cloud providers (AWS, Azure, GCP)
- Manage XCKS (Managed Kubernetes) site deployments (formerly AppStack)
- Deploy Secure Mesh sites for networking-focused edge deployments
- Integrate external Kubernetes clusters as Customer Edge
- Configure AWS VPC, Azure VNet, and GCP VPC sites
- Manage virtual sites and site policies

## Resources

| Resource | Description | Tier | CRUD | Profile |
| ---------- | ------------- | ------ | ------ | --------- |
| site | Site | Standard | R/U/L | resources/sites/site.md |
| virtual_site | Virtual site | Standard | C/R/U/D/L | resources/sites/virtual_site.md |
| site_mesh_group | Site mesh group | Advanced | - | resources/sites/site_mesh_group.md |

## Dependency Graph

- site_mesh_group requires: site

## Creation Order

1. site (no dependencies)
2. site_mesh_group (depends: site)
3. virtual_site (no dependencies)

## Related Domains

`cloud_infrastructure`, `customer_edge`, `managed_kubernetes`
