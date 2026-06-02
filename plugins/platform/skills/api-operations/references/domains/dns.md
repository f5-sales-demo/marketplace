# DNS

Authoritative zones and record management.

Category: Networking. Complexity: advanced. Paths: 45. Schemas: 251.

## Use Cases

- Configure DNS load balancing
- Manage DNS zones and domains
- Configure DNS compliance policies
- Manage resource record sets (RRSets)

## Resources

| Resource | Description | Tier | CRUD | Profile |
| ---------- | ------------- | ------ | ------ | --------- |
| dns_zone | DNS zone | Standard | C/R/U/D/L | resources/dns/dns_zone.md |
| dns_domain | DNS domain | Standard | C/R/U/D/L | resources/dns/dns_domain.md |
| dns_load_balancer | DNS load balancer | Standard | C/R/U/D/L | resources/dns/dns_load_balancer.md |

## Dependency Graph

- dns_load_balancer requires: dns_zone

## Creation Order

1. dns_domain (no dependencies)
2. dns_zone (no dependencies)
3. dns_load_balancer (depends: dns_zone)

## Related Domains

`virtual`, `network`
