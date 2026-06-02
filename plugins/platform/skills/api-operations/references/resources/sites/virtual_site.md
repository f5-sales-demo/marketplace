# virtual_site

Logical grouping of sites using label selectors

Domain: `sites`. Tier: Standard. Logs: no. Metrics: no.

## Endpoints

| Op | Method | Path |
| ---- | -------- | ------ |
| Create | POST | /api/config/namespaces/{ns}/virtual_sites |
| Read | GET | /api/config/namespaces/{ns}/virtual_sites/{name} |
| Update | PUT | /api/config/namespaces/{ns}/virtual_sites/{name} |
| Delete | DELETE | /api/config/namespaces/{ns}/virtual_sites/{name} |
| List | GET | /api/config/namespaces/{ns}/virtual_sites |

## cURL Template

```bash
curl -s -X POST \
  -H "Authorization: APIToken $F5XC_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$F5XC_API_URL/api/config/namespaces/{ns}/virtual_sites" \
  -d @payload.json | jq .
```

## Additional Endpoints

| Method | Path | Summary |
| -------- | ------ | --------- |
| GET | /api/config/namespaces/{ns}/virtual_sites/{name}/selectees | GET Selectees. |
