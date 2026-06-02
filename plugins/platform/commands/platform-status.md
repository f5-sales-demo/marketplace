---
description: >-
  Check F5 Distributed Cloud platform API connectivity and authentication status
---

Delegate to the api-operator agent to check platform readiness.

## Delegation

Spawn the api-operator agent with the following instructions:

1. Check if F5XC_API_TOKEN environment variable is set
2. Check if F5XC_API_URL environment variable is set
3. If both are set, verify token validity: `curl -s -o /dev/null -w '%{http_code}' -H "Authorization: APIToken ${F5XC_API_TOKEN}" "${F5XC_API_URL}/api/web/namespaces"`
4. If token is valid (HTTP 200), list available namespaces
5. Report:
   - API URL (tenant endpoint)
   - Token status (valid/expired/missing)
   - Available namespaces (if authenticated)
   - Console access status
6. If token is missing or expired, suggest using `/platform:check-api-token`
7. If API URL is not set, suggest setting F5XC_API_URL environment variable
