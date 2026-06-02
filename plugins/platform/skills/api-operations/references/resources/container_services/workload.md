# workload

Container workload deployment configuration

Domain: `container_services`. Tier: Advanced. Logs: yes. Metrics: yes.

## Endpoints

| Op | Method | Path |
| ---- | -------- | ------ |
| Create | POST | /api/config/namespaces/{ns}/workloads |
| Read | GET | /api/config/namespaces/{ns}/workloads/{name} |
| Update | PUT | /api/config/namespaces/{ns}/workloads/{name} |
| Delete | DELETE | /api/config/namespaces/{ns}/workloads/{name} |
| List | GET | /api/config/namespaces/{ns}/workloads |

## Dependencies

Required: virtual_k8s

## Relationship Hints

- virtual_k8s: Namespace for workload deployment

## cURL Template

```bash
curl -s -X POST \
  -H "Authorization: APIToken $F5XC_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$F5XC_API_URL/api/config/namespaces/{ns}/workloads" \
  -d @payload.json | jq .
```

## Additional Endpoints

| Method | Path | Summary |
| -------- | ------ | --------- |
| POST | /api/data/namespaces/{ns}/workloads/usage | Usage Metrics. |
