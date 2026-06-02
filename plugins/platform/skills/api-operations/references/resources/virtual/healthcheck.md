# healthcheck

Health monitoring configuration for origin server availability

Domain: `virtual`. Tier: Standard. Logs: no. Metrics: yes.

## Endpoints

| Op | Method | Path |
| ---- | -------- | ------ |
| Create | POST | /api/config/namespaces/{ns}/healthchecks |
| Read | GET | /api/config/namespaces/{ns}/healthchecks/{name} |
| Update | PUT | /api/config/namespaces/{ns}/healthchecks/{name} |
| Delete | DELETE | /api/config/namespaces/{ns}/healthchecks/{name} |
| List | GET | /api/config/namespaces/{ns}/healthchecks |

## Required Fields

- `metadata.name`
- `metadata.namespace`
- `spec.interval`
- `spec.timeout`
- `spec.healthy_threshold`
- `spec.unhealthy_threshold`

## Mutually Exclusive Groups

Pick exactly one from each group:

| - : `spec.http_health_check` | `spec.tcp_health_check` | `spec.udp_icmp_health_check` |
  Choose exactly one health check type

## Minimum JSON Payload

```json
{
  "metadata": {
    "name": "http-health",
    "namespace": "default"
  },
  "spec": {
    "http_health_check": {"path": "/health", "use_origin_server_hostname": true},
    "interval": 15,
    "timeout": 3,
    "unhealthy_threshold": 1,
    "healthy_threshold": 3,
    "jitter_percent": 30
  }
}
```

## cURL Example

```bash
curl -X POST "$F5XC_API_URL/api/config/namespaces/default/healthchecks" \
  -H "Authorization: APIToken $F5XC_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d @healthcheck.json
```
