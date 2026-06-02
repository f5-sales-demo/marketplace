# service_policy

Service-level access control and traffic management rules

Domain: `virtual`. Tier: Advanced. Logs: yes. Metrics: no.

## Endpoints

| Op | Method | Path |
| ---- | -------- | ------ |
| Create | POST | /api/config/namespaces/{ns}/service_policys |
| Read | GET | /api/config/namespaces/{ns}/service_policys/{name} |
| Update | PUT | /api/config/namespaces/{ns}/service_policys/{name} |
| Delete | DELETE | /api/config/namespaces/{ns}/service_policys/{name} |
| List | GET | /api/config/namespaces/{ns}/service_policys |

## Required Fields

- `metadata.name`
- `metadata.namespace`

## Mutually Exclusive Groups

Pick exactly one from each group:

| - : `spec.allow_all_requests` | `spec.deny_all_requests` | `spec.allow_list` | `spec.deny_list` | `spec.rule_list` |
  Choose exactly one rule type

## Minimum JSON Payload

```json
{
  "metadata": {
    "name": "allow-internal",
    "namespace": "default"
  },
  "spec": {
    "allow_list": {
      "rules": [{
        "metadata": {"name": "internal-traffic"},
        "spec": {
          "ip_prefix_list": {"prefix": ["10.0.0.0/8", "192.168.0.0/16"]}
        }
      }]
    }
  }
}
```

## cURL Example

```bash
curl -X POST "$F5XC_API_URL/api/config/namespaces/default/service_policys" \
  -H "Authorization: APIToken $F5XC_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d @service-policy.json
```
