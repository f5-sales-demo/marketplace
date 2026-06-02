# certificate_chain

Certificate chain for complete trust verification

Domain: `certificates`. Tier: Standard. Logs: no. Metrics: no.

## Endpoints

| Op | Method | Path |
| ---- | -------- | ------ |
| Create | POST | /api/config/namespaces/{ns}/certificate_chains |
| Read | GET | /api/config/namespaces/{ns}/certificate_chains/{name} |
| Update | PUT | /api/config/namespaces/{ns}/certificate_chains/{name} |
| Delete | DELETE | /api/config/namespaces/{ns}/certificate_chains/{name} |
| List | GET | /api/config/namespaces/{ns}/certificate_chains |

## cURL Template

```bash
curl -s -X POST \
  -H "Authorization: APIToken $F5XC_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$F5XC_API_URL/api/config/namespaces/{ns}/certificate_chains" \
  -d @payload.json | jq .
```
