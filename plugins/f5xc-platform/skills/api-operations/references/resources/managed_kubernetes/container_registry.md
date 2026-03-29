# container_registry

Container image registry for workload images

Domain: `managed_kubernetes`. Tier: Advanced. Logs: no. Metrics: no.

## Endpoints

| Op | Method | Path |
| ---- | -------- | ------ |
| Create | POST | /api/config/namespaces/{ns}/container_registrys |
| Read | GET | /api/config/namespaces/{ns}/container_registrys/{name} |
| Update | PUT | /api/config/namespaces/{ns}/container_registrys/{name} |
| Delete | DELETE | /api/config/namespaces/{ns}/container_registrys/{name} |
| List | GET | /api/config/namespaces/{ns}/container_registrys |

## cURL Template

```bash
curl -s -X POST \
  -H "Authorization: APIToken $F5XC_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$F5XC_API_URL/api/config/namespaces/{ns}/container_registrys" \
  -d @payload.json | jq .
```
