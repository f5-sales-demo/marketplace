# network_connector

Network connector for site-to-site or cloud connectivity

Domain: `network`. Tier: Advanced. Logs: no. Metrics: yes.

## Endpoints

| Op | Method | Path |
| ---- | -------- | ------ |
| Create | POST | /api/config/namespaces/{ns}/network_connectors |
| Read | GET | /api/config/namespaces/{ns}/network_connectors/{name} |
| Update | PUT | /api/config/namespaces/{ns}/network_connectors/{name} |
| Delete | DELETE | /api/config/namespaces/{ns}/network_connectors/{name} |
| List | GET | /api/config/namespaces/{ns}/network_connectors |

## Dependencies

Required: virtual_network

## Relationship Hints

- virtual_network: Network to connect

## cURL Template

```bash
curl -s -X POST \
  -H "Authorization: APIToken $F5XC_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$F5XC_API_URL/api/config/namespaces/{ns}/network_connectors" \
  -d @payload.json | jq .
```
