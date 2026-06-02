# cdn_loadbalancer

Content delivery network load balancer for edge caching

Domain: `cdn`. Tier: Standard. Logs: yes. Metrics: yes.

## Endpoints

| Op | Method | Path |
| ---- | -------- | ------ |
| Create | POST | /api/config/namespaces/{ns}/cdn_loadbalancers |
| Read | GET | /api/config/namespaces/{ns}/cdn_loadbalancers/{name} |
| Update | PUT | /api/config/namespaces/{ns}/cdn_loadbalancers/{name} |
| Delete | DELETE | /api/config/namespaces/{ns}/cdn_loadbalancers/{name} |
| List | GET | /api/config/namespaces/{ns}/cdn_loadbalancers |

## Dependencies

Required: cdn_origin_pool

## Relationship Hints

- cdn_origin_pool: Origin servers for CDN content

## cURL Template

```bash
curl -s -X POST \
  -H "Authorization: APIToken $F5XC_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$F5XC_API_URL/api/config/namespaces/{ns}/cdn_loadbalancers" \
  -d @payload.json | jq .
```

## Additional Endpoints

| Method | Path | Summary |
| -------- | ------ | --------- |
| POST | /api/config/namespaces/{ns}/cdn_loadbalancers/get_security_config | GET Security Config for CDN Load Balancer. |
| GET | /api/config/namespaces/{ns}/cdn_loadbalancers/{name}/dos_automitigation_rules | GET DoS Auto-Mitigation Rules for CDN Load Balancer. |
| DELETE | /api/config/namespaces/{ns}/cdn_loadbalancers/{name}/dos_automitigation_rules/{dos_automitigation_rule_name} | DELETE DoS Auto-Mitigation Rule for CDN Load Balancer. |
