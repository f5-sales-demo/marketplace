# sensitive_data_policy

Sensitive data policy for PII protection

Domain: `data_and_privacy_security`. Tier: Advanced. Logs: yes. Metrics: no.

## Endpoints

| Op | Method | Path |
| ---- | -------- | ------ |
| Create | POST | /api/config/namespaces/{ns}/sensitive_data_policys |
| Read | GET | /api/config/namespaces/{ns}/sensitive_data_policys/{name} |
| Update | PUT | /api/config/namespaces/{ns}/sensitive_data_policys/{name} |
| Delete | DELETE | /api/config/namespaces/{ns}/sensitive_data_policys/{name} |
| List | GET | /api/config/namespaces/{ns}/sensitive_data_policys |

## cURL Template

```bash
curl -s -X POST \
  -H "Authorization: APIToken $F5XC_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$F5XC_API_URL/api/config/namespaces/{ns}/sensitive_data_policys" \
  -d @payload.json | jq .
```
