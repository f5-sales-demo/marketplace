# origin_pool

Backend server group for load balancer traffic distribution

Domain: `virtual`. Tier: Standard. Logs: no. Metrics: yes.

## Endpoints

| Op | Method | Path |
| ---- | -------- | ------ |
| Create | POST | /api/config/namespaces/{ns}/origin_pools |
| Read | GET | /api/config/namespaces/{ns}/origin_pools/{name} |
| Update | PUT | /api/config/namespaces/{ns}/origin_pools/{name} |
| Delete | DELETE | /api/config/namespaces/{ns}/origin_pools/{name} |
| List | GET | /api/config/namespaces/{ns}/origin_pools |

## Required Fields

- `metadata.name`
- `metadata.namespace`
- `spec.origin_servers`
- `spec.port`

## Dependencies

Optional: healthcheck

## Relationship Hints

- healthcheck: Monitor origin server health

## Minimum JSON Payload

```json
{
  "metadata": {
    "name": "backend-pool",
    "namespace": "default"
  },
  "spec": {
    "origin_servers": [
      {"public_name": {"dns_name": "backend1.example.com"}},
      {"public_name": {"dns_name": "backend2.example.com"}}
    ],
    "port": 8080
  }
}
```

## Constrained Fields

| Field | Type | Values | Default |
| ------- | ------ | -------- | --------- |
| `spec.loadbalancer_algorithm` | enum | ROUND_ROBIN, LEAST_REQUEST, RING_HASH, RANDOM, LB_OVERRIDE | ROUND_ROBIN |
| `spec.endpoint_selection` | enum | DISTRIBUTED, LOCAL_ONLY, LOCAL_PREFERRED | DISTRIBUTED |

## cURL Example

```bash
curl -X POST "$F5XC_API_URL/api/config/namespaces/default/origin_pools" \
  -H "Authorization: APIToken $F5XC_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d @origin-pool.json
```
