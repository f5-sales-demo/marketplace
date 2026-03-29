# Cloud Infrastructure

AWS, Azure, GCP connectors and VPC attachments.

Category: Infrastructure. Complexity: advanced. Paths: 31. Schemas: 231.

## Use Cases

- Connect to cloud providers (AWS, Azure, GCP)
- Manage cloud credentials and authentication
- Configure cloud connectivity and elastic provisioning
- Link and manage cloud regions

## Resources

| Resource | Description | Tier | CRUD | Profile |
| ---------- | ------------- | ------ | ------ | --------- |
| aws_vpc_site | AWS VPC site | Standard | - | resources/cloud_infrastructure/aws_vpc_site.md |
| azure_vnet_site | Azure VNet site | Standard | - | resources/cloud_infrastructure/azure_vnet_site.md |
| gcp_vpc_site | GCP VPC site | Standard | - | resources/cloud_infrastructure/gcp_vpc_site.md |
| cloud_credentials | Cloud credentials | Standard | C/R/U/D/L | resources/cloud_infrastructure/cloud_credentials.md |

## Dependency Graph

- aws_vpc_site requires: cloud_credentials
- azure_vnet_site requires: cloud_credentials
- gcp_vpc_site requires: cloud_credentials

## Creation Order

1. cloud_credentials (no dependencies)
2. aws_vpc_site (depends: cloud_credentials)
3. azure_vnet_site (depends: cloud_credentials)
4. gcp_vpc_site (depends: cloud_credentials)

## Related Domains

`sites`, `customer_edge`
