# dns_domain

DNS domain delegation and configuration settings

Domain: `dns`. Tier: Standard. Logs: no. Metrics: no.

## Endpoints

| Op | Method | Path |
| ---- | -------- | ------ |
| Create | POST | /api/config/namespaces/{ns}/dns_domains |
| Read | GET | /api/config/namespaces/{ns}/dns_domains/{name} |
| Update | PUT | /api/config/namespaces/{ns}/dns_domains/{name} |
| Delete | DELETE | /api/config/namespaces/{ns}/dns_domains/{name} |
| List | GET | /api/config/namespaces/{ns}/dns_domains |

## cURL Template

```bash
curl -s -X POST \
  -H "Authorization: APIToken $F5XC_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$F5XC_API_URL/api/config/namespaces/{ns}/dns_domains" \
  -d @payload.json | jq .
```
