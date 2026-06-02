# secret_policy

Secret management policy configuration

Domain: `blindfold`. Tier: Standard. Logs: no. Metrics: no.

## Endpoints

| Op | Method | Path |
| ---- | -------- | ------ |
| Create | POST | /api/secret_management/namespaces/{ns}/secret_policys |
| Read | GET | /api/secret_management/namespaces/{ns}/secret_policys/{name} |
| Update | PUT | /api/secret_management/namespaces/{ns}/secret_policys/{name} |
| Delete | DELETE | /api/secret_management/namespaces/{ns}/secret_policys/{name} |
| List | GET | /api/secret_management/namespaces/{ns}/secret_policys |

## cURL Template

```bash
curl -s -X POST \
  -H "Authorization: APIToken $F5XC_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$F5XC_API_URL/api/secret_management/namespaces/{ns}/secret_policys" \
  -d @payload.json | jq .
```
