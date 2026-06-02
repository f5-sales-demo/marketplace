# tcp_loadbalancer

Layer 4 TCP/UDP load balancer for non-HTTP protocol traffic

Domain: `virtual`. Tier: Standard. Logs: yes. Metrics: yes.

## Endpoints

| Op | Method | Path |
| ---- | -------- | ------ |
| Create | POST | /api/config/namespaces/{ns}/tcp_loadbalancers |
| Read | GET | /api/config/namespaces/{ns}/tcp_loadbalancers/{name} |
| Update | PUT | /api/config/namespaces/{ns}/tcp_loadbalancers/{name} |
| Delete | DELETE | /api/config/namespaces/{ns}/tcp_loadbalancers/{name} |
| List | GET | /api/config/namespaces/{ns}/tcp_loadbalancers |

## Required Fields

- `metadata.name`
- `metadata.namespace`
- `spec.origin_pools`

## Mutually Exclusive Groups

Pick exactly one from each group:

- : `spec.listen_port` | `spec.port_ranges`

  Specify either a single port or port ranges (port_choice)

- : `spec.listener.tcp_port` | `spec.listener.udp_port`

  Specify either TCP or UDP protocol

## Dependencies

Required: origin_pool
Optional: healthcheck

## Relationship Hints

- origin_pool: Backend servers for TCP/UDP traffic
- healthcheck: Monitor origin server health

## Minimum JSON Payload

```json
{
  "metadata": {
    "name": "database-lb",
    "namespace": "default"
  },
  "spec": {
    "listener": {"port": 5432, "protocol": "TCP"},
    "origin_pools": [{"pool_name": "postgres-cluster"}],
    "advertise": [{"public_ip": true}]
  }
}
```

## cURL Example

```bash
curl -X POST "$F5XC_API_URL/api/config/namespaces/default/tcp_loadbalancers" \
  -H "Authorization: APIToken $F5XC_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d @tcp-lb.json
```

## Additional Endpoints

| Method | Path | Summary |
| -------- | ------ | --------- |
| GET | /api/config/namespaces/{ns}/tcp_loadbalancers/{name}/get-dns-info | GET DNS Info. |
