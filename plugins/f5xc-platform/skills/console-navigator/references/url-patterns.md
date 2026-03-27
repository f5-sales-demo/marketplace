# F5 XC Console URL Patterns

URL catalog for deterministic navigation. All URLs use the
base `${F5XC_API_URL}`.

## Workspace Selection

| Section | URL Path |
| --------- | ---------- |
| Workspaces | `/web/workspaces` |

## Namespace-Scoped Pages

Pattern: `/web/namespaces/${NAMESPACE}/<path>`

### Load Balancers

| Section | Path |
| --------- | ------ |
| HTTP Load Balancers | `/manage/load_balancers/http_loadbalancers` |
| TCP Load Balancers | `/manage/load_balancers/tcp_loadbalancers` |

### Security

| Section | Path |
| --------- | ------ |
| App Firewalls (WAF) | `/security/app_firewall` |
| Service Policies | `/security/service_policies` |
| Security Dashboard | `/overview/security_dashboard` |
| API Protection | `/security/api_protection` |

### Applications

| Section | Path |
| --------- | ------ |
| Origin Pools | `/apps/origin_pools` |
| Health Checks | `/apps/health_checks` |
| Virtual Hosts | `/apps/virtual_hosts` |

### DNS

| Section | Path |
| --------- | ------ |
| DNS Zones | `/dns/zone_management` |
| DNS Load Balancers | `/dns/dns_loadbalancers` |

### Observability

| Section | Path |
| --------- | ------ |
| Performance Dashboard | `/overview/performance_dashboard` |
| HTTP Requests | `/overview/http_requests` |

## System-Scoped Pages

Pattern: `/web/system/<path>`

### Site Management

| Section | Path |
| --------- | ------ |
| Sites | `/site_management/sites` |
| Site Tokens | `/site_management/site_tokens` |

### Tenant Administration

| Section | Path |
| --------- | ------ |
| Users | `/tenant_management/users` |
| Credentials | `/tenant_management/credentials` |
| API Tokens | `/tenant_management/api_credentials` |
| Quotas | `/tenant_management/quotas` |
| Namespaces | `/tenant_management/namespaces` |

## Aliases

Common shorthand names mapped to full section names:

| Alias | Section |
| ------- | --------- |
| "LB", "load balancer" | HTTP Load Balancers |
| "WAF", "firewall" | App Firewalls |
| "origin", "pool" | Origin Pools |
| "DNS" | DNS Zones |
| "sites" | Sites |
| "users" | Users |
| "creds", "credentials" | Credentials |
| "tokens", "API tokens" | API Tokens |
