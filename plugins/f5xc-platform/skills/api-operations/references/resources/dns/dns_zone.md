# dns_zone

Authoritative DNS zone with record management capabilities

Domain: `dns`. Tier: Standard. Logs: yes. Metrics: yes.

## Endpoints

| Op | Method | Path |
| ---- | -------- | ------ |
| Create | POST | /api/config/dns/namespaces/{ns}/dns_zones |
| Read | GET | /api/config/dns/namespaces/{ns}/dns_zones/{name} |
| Update | PUT | /api/config/dns/namespaces/{ns}/dns_zones/{name} |
| Delete | DELETE | /api/config/dns/namespaces/{ns}/dns_zones/{name} |
| List | GET | /api/config/dns/namespaces/{ns}/dns_zones |

## Dependencies

Optional: dns_load_balancer

## Relationship Hints

- dns_load_balancer: Geographic or weighted DNS routing

## cURL Template

```bash
curl -s -X POST \
  -H "Authorization: APIToken $F5XC_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$F5XC_API_URL/api/config/dns/namespaces/{ns}/dns_zones" \
  -d @payload.json | jq .
```

## Additional Endpoints

| Method | Path | Summary |
| -------- | ------ | --------- |
| POST | /api/data/namespaces/{ns}/dns_zones/metrics | DNS Zone Metrics. |
| POST | /api/data/namespaces/{ns}/dns_zones/request_logs | GET DNS Zone Request Logs. |
