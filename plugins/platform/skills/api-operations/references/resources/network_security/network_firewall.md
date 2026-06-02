# network_firewall

Network firewall for layer 3/4 traffic protection

Domain: `network_security`. Tier: Standard. Logs: yes. Metrics: yes.

## Endpoints

| Op | Method | Path |
| ---- | -------- | ------ |
| Create | POST | /api/config/namespaces/{ns}/network_firewalls |
| Read | GET | /api/config/namespaces/{ns}/network_firewalls/{name} |
| Update | PUT | /api/config/namespaces/{ns}/network_firewalls/{name} |
| Delete | DELETE | /api/config/namespaces/{ns}/network_firewalls/{name} |
| List | GET | /api/config/namespaces/{ns}/network_firewalls |

## cURL Template

```bash
curl -s -X POST \
  -H "Authorization: APIToken $F5XC_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$F5XC_API_URL/api/config/namespaces/{ns}/network_firewalls" \
  -d @payload.json | jq .
```
