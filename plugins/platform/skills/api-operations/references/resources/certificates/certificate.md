# certificate

TLS certificate for secure HTTPS connections

Domain: `certificates`. Tier: Standard. Logs: no. Metrics: no.

## Endpoints

| Op | Method | Path |
| ---- | -------- | ------ |
| Create | POST | /api/config/namespaces/{ns}/certificates |
| Read | GET | /api/config/namespaces/{ns}/certificates/{name} |
| Update | PUT | /api/config/namespaces/{ns}/certificates/{name} |
| Delete | DELETE | /api/config/namespaces/{ns}/certificates/{name} |
| List | GET | /api/config/namespaces/{ns}/certificates |

## Required Fields

- `metadata.name`
- `metadata.namespace`
- `spec.certificate_url`

## Minimum JSON Payload

```json
{
  "metadata": {
    "name": "example-cert",
    "namespace": "default"
  },
  "spec": {
    "certificate_url": "string:///BASE64_ENCODED_CERTIFICATE",
    "private_key": {
      "blindfold_secret_info": {
        "location": "string:///BASE64_ENCODED_ENCRYPTED_KEY"
      }
    }
  }
}
```

## cURL Example

```bash
curl -X POST "$F5XC_API_URL/api/config/namespaces/default/certificates" \
  -H "Authorization: APIToken $F5XC_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d @certificate.json
```
