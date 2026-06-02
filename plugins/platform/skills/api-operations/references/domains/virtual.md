# Virtual

HTTP, TCP, UDP load balancing with origin pools.

Category: Networking. Complexity: advanced. Paths: 133. Schemas: 978.

## Use Cases

- Configure HTTP/TCP/UDP load balancers
- Manage origin pools and services
- Configure virtual hosts and routing
- Define rate limiter and service policies
- Manage geo-location-based routing
- Configure proxy and forwarding policies
- Manage malware protection and threat campaigns
- Configure health checks and endpoint monitoring

## Resources

| Resource | Description | Tier | CRUD | Profile |
| ---------- | ------------- | ------ | ------ | --------- |
| http_loadbalancer | HTTP load balancer | Standard | C/R/U/D/L | resources/virtual/http_loadbalancer.md |
| tcp_loadbalancer | TCP load balancer | Standard | C/R/U/D/L | resources/virtual/tcp_loadbalancer.md |
| origin_pool | Origin pool | Standard | C/R/U/D/L | resources/virtual/origin_pool.md |
| healthcheck | Health check | Standard | C/R/U/D/L | resources/virtual/healthcheck.md |
| app_firewall | WAF policy | Advanced | C/R/U/D/L | resources/virtual/app_firewall.md |
| service_policy | Service policy | Advanced | C/R/U/D/L | resources/virtual/service_policy.md |
| malicious_user_detection | Malicious user detection | Advanced | - | resources/virtual/malicious_user_detection.md |

## Dependency Graph

- http_loadbalancer requires: origin_pool
- tcp_loadbalancer requires: origin_pool

## Creation Order

1. app_firewall (no dependencies)
2. healthcheck (no dependencies)
3. origin_pool (no dependencies)
4. http_loadbalancer (depends: origin_pool)
5. malicious_user_detection (no dependencies)
6. service_policy (no dependencies)
7. tcp_loadbalancer (depends: origin_pool)

## Related Domains

`dns`, `service_policy`, `network`
