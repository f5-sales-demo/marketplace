# k8s_cluster_role

Kubernetes cluster RBAC role configuration

Domain: `managed_kubernetes`. Tier: Advanced. Logs: no. Metrics: no.

## Endpoints

| Op | Method | Path |
| ---- | -------- | ------ |
| Create | POST | /api/config/namespaces/{ns}/k8s_cluster_roles |
| Read | GET | /api/config/namespaces/{ns}/k8s_cluster_roles/{name} |
| Update | PUT | /api/config/namespaces/{ns}/k8s_cluster_roles/{name} |
| Delete | DELETE | /api/config/namespaces/{ns}/k8s_cluster_roles/{name} |
| List | GET | /api/config/namespaces/{ns}/k8s_cluster_roles |

## cURL Template

```bash
curl -s -X POST \
  -H "Authorization: APIToken $F5XC_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$F5XC_API_URL/api/config/namespaces/{ns}/k8s_cluster_roles" \
  -d @payload.json | jq .
```
