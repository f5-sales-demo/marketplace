# endpoint

Service mesh endpoint for traffic routing

Domain: `service_mesh`. Tier: Advanced. Logs: yes. Metrics: yes.

## Endpoints

| Op | Method | Path |
| ---- | -------- | ------ |
| Create | POST | /api/config/namespaces/{ns}/endpoints |
| Read | GET | /api/config/namespaces/{ns}/endpoints/{name} |
| Update | PUT | /api/config/namespaces/{ns}/endpoints/{name} |
| Delete | DELETE | /api/config/namespaces/{ns}/endpoints/{name} |
| List | GET | /api/config/namespaces/{ns}/endpoints |

## cURL Template

```bash
curl -s -X POST \
  -H "Authorization: APIToken $F5XC_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$F5XC_API_URL/api/config/namespaces/{ns}/endpoints" \
  -d @payload.json | jq .
```
