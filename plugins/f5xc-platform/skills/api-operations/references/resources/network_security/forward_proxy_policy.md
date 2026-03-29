# forward_proxy_policy

Forward proxy policy for outbound traffic control

Domain: `network_security`. Tier: Advanced. Logs: yes. Metrics: yes.

## Endpoints

| Op | Method | Path |
| ---- | -------- | ------ |
| Create | POST | /api/config/namespaces/{ns}/forward_proxy_policys |
| Read | GET | /api/config/namespaces/{ns}/forward_proxy_policys/{name} |
| Update | PUT | /api/config/namespaces/{ns}/forward_proxy_policys/{name} |
| Delete | DELETE | /api/config/namespaces/{ns}/forward_proxy_policys/{name} |
| List | GET | /api/config/namespaces/{ns}/forward_proxy_policys |

## cURL Template

```bash
curl -s -X POST \
  -H "Authorization: APIToken $F5XC_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$F5XC_API_URL/api/config/namespaces/{ns}/forward_proxy_policys" \
  -d @payload.json | jq .
```
