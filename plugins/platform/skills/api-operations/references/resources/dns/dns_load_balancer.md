# dns_load_balancer

DNS-based traffic distribution with geographic routing and failover

Domain: `dns`. Tier: Standard. Logs: yes. Metrics: yes.

## Endpoints

| Op | Method | Path |
| ---- | -------- | ------ |
| Create | POST | /api/config/dns/namespaces/{ns}/dns_load_balancers |
| Read | GET | /api/config/dns/namespaces/{ns}/dns_load_balancers/{name} |
| Update | PUT | /api/config/dns/namespaces/{ns}/dns_load_balancers/{name} |
| Delete | DELETE | /api/config/dns/namespaces/{ns}/dns_load_balancers/{name} |
| List | GET | /api/config/dns/namespaces/{ns}/dns_load_balancers |

## Dependencies

Required: dns_zone

## Relationship Hints

- dns_zone: Parent zone for DNS records

## cURL Template

```bash
curl -s -X POST \
  -H "Authorization: APIToken $F5XC_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$F5XC_API_URL/api/config/dns/namespaces/{ns}/dns_load_balancers" \
  -d @payload.json | jq .
```

## Additional Endpoints

| Method | Path | Summary |
| -------- | ------ | --------- |
| GET | /api/data/namespaces/{ns}/dns_load_balancers/health_status | DNS Load Balancer Health Status List. |
| GET | /api/data/namespaces/{ns}/dns_load_balancers/pool_members_health_status | DNS Load Balancer Pool Members Health Status List. |
| GET | /api/data/namespaces/{ns}/dns_load_balancers/{dns_lb_name}/dns_lb_pools/{dns_lb_pool_name}/health_status | DNS Load Balancer Pool Health Status. |
| GET | /api/data/namespaces/{ns}/dns_load_balancers/{dns_lb_name}/dns_lb_pools/{dns_lb_pool_name}/pool_members/{pool_member_address}/health_status_change_events | DNS Load Balancer Pool Member Health Status Change Events. |
| GET | /api/data/namespaces/{ns}/dns_load_balancers/{name}/health_status | DNS Load Balancer Health Status. |
