# app_firewall

Web Application Firewall policy for HTTP traffic protection

Domain: `virtual`. Tier: Advanced. Logs: yes. Metrics: yes.

## Endpoints

| Op | Method | Path |
| ---- | -------- | ------ |
| Create | POST | /api/config/namespaces/{ns}/app_firewalls |
| Read | GET | /api/config/namespaces/{ns}/app_firewalls/{name} |
| Update | PUT | /api/config/namespaces/{ns}/app_firewalls/{name} |
| Delete | DELETE | /api/config/namespaces/{ns}/app_firewalls/{name} |
| List | GET | /api/config/namespaces/{ns}/app_firewalls |

## Required Fields

- `metadata.name`
- `metadata.namespace`
- `spec.detection_settings`

## Dependencies

Optional: service_policy

## Relationship Hints

- service_policy: Fine-grained access control rules

## Minimum JSON Payload

```json
{
  "metadata": {
    "name": "default-waf",
    "namespace": "default"
  },
  "spec": {
    "detection_settings": {"signature_detection": true},
    "signature_set": {"signature_set_name": "default_waf_signature_set"},
    "bot_defense": {"disabled": false},
    "data_guard": {"disabled": false},
    "blocking": {"disabled": false}
  }
}
```

## cURL Example

```bash
curl -X POST "$F5XC_API_URL/api/config/namespaces/default/app_firewalls" \
  -H "Authorization: APIToken $F5XC_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d @waf-policy.json
```
