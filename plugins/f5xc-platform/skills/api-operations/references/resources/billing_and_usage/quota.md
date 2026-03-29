# quota

Resource quota for usage limits

Domain: `billing_and_usage`. Tier: Standard. Logs: no. Metrics: no.

## Endpoints

| Op | Method | Path |
| ---- | -------- | ------ |
| Create | POST | /api/web/namespaces/{ns}/quotas |
| Read | GET | /api/web/namespaces/{ns}/quotas/{name} |
| Update | PUT | /api/web/namespaces/{ns}/quotas/{name} |
| Delete | DELETE | /api/web/namespaces/{ns}/quotas/{name} |
| List | GET | /api/web/namespaces/{ns}/quotas |

## cURL Template

```bash
curl -s -X POST \
  -H "Authorization: APIToken $F5XC_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$F5XC_API_URL/api/web/namespaces/{ns}/quotas" \
  -d @payload.json | jq .
```
