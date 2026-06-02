# network_policy

Network security policy for traffic filtering

Domain: `network_security`. Tier: Standard. Logs: yes. Metrics: no.

## Endpoints

| Op | Method | Path |
| ---- | -------- | ------ |
| Create | POST | /api/config/namespaces/{ns}/network_policys |
| Read | GET | /api/config/namespaces/{ns}/network_policys/{name} |
| Update | PUT | /api/config/namespaces/{ns}/network_policys/{name} |
| Delete | DELETE | /api/config/namespaces/{ns}/network_policys/{name} |
| List | GET | /api/config/namespaces/{ns}/network_policys |

## cURL Template

```bash
curl -s -X POST \
  -H "Authorization: APIToken $F5XC_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$F5XC_API_URL/api/config/namespaces/{ns}/network_policys" \
  -d @payload.json | jq .
```
