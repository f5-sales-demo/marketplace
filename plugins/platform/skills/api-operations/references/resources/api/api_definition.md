# api_definition

API schema definition for discovery and protection

Domain: `api`. Tier: Advanced. Logs: no. Metrics: no.

## Endpoints

| Op | Method | Path |
| ---- | -------- | ------ |
| Create | POST | /api/config/namespaces/{ns}/api_definitions |
| Read | GET | /api/config/namespaces/{ns}/api_definitions/{name} |
| Update | PUT | /api/config/namespaces/{ns}/api_definitions/{name} |
| Delete | DELETE | /api/config/namespaces/{ns}/api_definitions/{name} |
| List | GET | /api/config/namespaces/{ns}/api_definitions |

## Dependencies

Optional: api_endpoint

## Relationship Hints

- api_endpoint: Endpoints defined by this API

## cURL Template

```bash
curl -s -X POST \
  -H "Authorization: APIToken $F5XC_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$F5XC_API_URL/api/config/namespaces/{ns}/api_definitions" \
  -d @payload.json | jq .
```

## Additional Endpoints

| Method | Path | Summary |
| -------- | ------ | --------- |
| GET | /api/config/namespaces/{ns}/api_definitions/{name}/loadbalancers | GET Referencing Loadbalancers. |
| POST | /api/config/namespaces/{ns}/api_definitions/{name}/mark_as_non_api | Mark As Non-API. |
| POST | /api/config/namespaces/{ns}/api_definitions/{name}/move_to_inventory | Move To API Inventory. |
| POST | /api/config/namespaces/{ns}/api_definitions/{name}/remove_from_inventory | Remove From API Inventory. |
| POST | /api/config/namespaces/{ns}/api_definitions/{name}/unmark_as_non_api | Unmark As Non-API. |
