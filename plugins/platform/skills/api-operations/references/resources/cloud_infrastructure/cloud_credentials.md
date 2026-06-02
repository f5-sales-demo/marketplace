# cloud_credentials

Cloud provider authentication credentials for site deployment

Domain: `cloud_infrastructure`. Tier: Standard. Logs: no. Metrics: no.

## Endpoints

| Op | Method | Path |
| ---- | -------- | ------ |
| Create | POST | /api/config/namespaces/{ns}/cloud_credentialss |
| Read | GET | /api/config/namespaces/{ns}/cloud_credentialss/{name} |
| Update | PUT | /api/config/namespaces/{ns}/cloud_credentialss/{name} |
| Delete | DELETE | /api/config/namespaces/{ns}/cloud_credentialss/{name} |
| List | GET | /api/config/namespaces/{ns}/cloud_credentialss |

## cURL Template

```bash
curl -s -X POST \
  -H "Authorization: APIToken $F5XC_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$F5XC_API_URL/api/config/namespaces/{ns}/cloud_credentialss" \
  -d @payload.json | jq .
```
