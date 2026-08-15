# Cloud Infrastructure

AWS and GCP connectors and VPC attachments. Azure Customer Edge uses the native
Secure Mesh Site v2 tools.

Category: Infrastructure. Complexity: advanced. Paths: 31. Schemas: 231.

## Use Cases

- Connect to supported cloud-provider site APIs
- Manage cloud credentials and authentication
- Configure cloud connectivity and elastic provisioning
- Link and manage cloud regions

## Resources

| Resource | Description | Tier | CRUD | Profile |
| ---------- | ------------- | ------ | ------ | --------- |
| aws_vpc_site | AWS VPC site | Standard | - | resources/cloud_infrastructure/aws_vpc_site.md |
| gcp_vpc_site | GCP VPC site | Standard | - | resources/cloud_infrastructure/gcp_vpc_site.md |
| cloud_credentials | Cloud credentials | Standard | C/R/U/D/L | resources/cloud_infrastructure/cloud_credentials.md |

## Dependency Graph

- aws_vpc_site requires: cloud_credentials
- gcp_vpc_site requires: cloud_credentials

## Creation Order

1. cloud_credentials (no dependencies)
2. aws_vpc_site (depends: cloud_credentials)
3. gcp_vpc_site (depends: cloud_credentials)

## Related Domains

`sites`, `customer_edge`
