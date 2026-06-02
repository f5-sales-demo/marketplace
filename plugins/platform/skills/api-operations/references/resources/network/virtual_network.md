# virtual_network

Virtual network for site connectivity and segmentation

Domain: `network`. Tier: Standard. Logs: no. Metrics: no.

## Endpoints

| Op | Method | Path |
| ---- | -------- | ------ |
| Create | POST | /api/config/namespaces/{ns}/virtual_networks |
| Read | GET | /api/config/namespaces/{ns}/virtual_networks/{name} |
| Update | PUT | /api/config/namespaces/{ns}/virtual_networks/{name} |
| Delete | DELETE | /api/config/namespaces/{ns}/virtual_networks/{name} |
| List | GET | /api/config/namespaces/{ns}/virtual_networks |

## Dependencies

Optional: network_connector

## Relationship Hints

- network_connector: Connect to external networks

## cURL Template

```bash
curl -s -X POST \
  -H "Authorization: APIToken $F5XC_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$F5XC_API_URL/api/config/namespaces/{ns}/virtual_networks" \
  -d @payload.json | jq .
```
