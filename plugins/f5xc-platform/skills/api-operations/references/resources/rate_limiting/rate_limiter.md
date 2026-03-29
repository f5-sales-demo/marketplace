# rate_limiter

Rate limiter for traffic throttling and protection

Domain: `rate_limiting`. Tier: Standard. Logs: yes. Metrics: yes.

## Endpoints

| Op | Method | Path |
| ---- | -------- | ------ |
| Create | POST | /api/config/namespaces/{ns}/rate_limiters |
| Read | GET | /api/config/namespaces/{ns}/rate_limiters/{name} |
| Update | PUT | /api/config/namespaces/{ns}/rate_limiters/{name} |
| Delete | DELETE | /api/config/namespaces/{ns}/rate_limiters/{name} |
| List | GET | /api/config/namespaces/{ns}/rate_limiters |

## Dependencies

Optional: rate_limiter_policy

## Relationship Hints

- rate_limiter_policy: Detailed rate limiting rules

## cURL Template

```bash
curl -s -X POST \
  -H "Authorization: APIToken $F5XC_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$F5XC_API_URL/api/config/namespaces/{ns}/rate_limiters" \
  -d @payload.json | jq .
```
