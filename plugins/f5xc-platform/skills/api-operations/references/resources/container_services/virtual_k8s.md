# virtual_k8s

Virtual Kubernetes namespace for container workloads

Domain: `container_services`. Tier: Advanced. Logs: yes. Metrics: yes.

## Endpoints

| Op | Method | Path |
| ---- | -------- | ------ |
| Create | POST | /api/config/namespaces/{ns}/virtual_k8ss |
| Read | GET | /api/config/namespaces/{ns}/virtual_k8ss/{name} |
| Update | PUT | /api/config/namespaces/{ns}/virtual_k8ss/{name} |
| Delete | DELETE | /api/config/namespaces/{ns}/virtual_k8ss/{name} |
| List | GET | /api/config/namespaces/{ns}/virtual_k8ss |

## Dependencies

Optional: workload

## Relationship Hints

- workload: Container workloads in this namespace

## cURL Template

```bash
curl -s -X POST \
  -H "Authorization: APIToken $F5XC_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$F5XC_API_URL/api/config/namespaces/{ns}/virtual_k8ss" \
  -d @payload.json | jq .
```
