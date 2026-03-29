# CDN

Content delivery and edge caching networks.

Category: Networking. Complexity: advanced. Paths: 29. Schemas: 634.

## Use Cases

- Configure CDN load balancing
- Manage content delivery network services
- Configure caching policies
- Manage data delivery and distribution

## Resources

| Resource | Description | Tier | CRUD | Profile |
| ---------- | ------------- | ------ | ------ | --------- |
| cdn_loadbalancer | CDN load balancer | Standard | C/R/U/D/L | resources/cdn/cdn_loadbalancer.md |
| cdn_origin_pool | CDN origin pool | Standard | - | resources/cdn/cdn_origin_pool.md |

## Dependency Graph

- cdn_loadbalancer requires: cdn_origin_pool

## Creation Order

1. cdn_origin_pool (no dependencies)
2. cdn_loadbalancer (depends: cdn_origin_pool)

## Related Domains

`virtual`
