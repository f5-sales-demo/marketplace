# http_loadbalancer

Layer 7 HTTP/HTTPS load balancer for application traffic distribution

Domain: `virtual`. Tier: Standard. Logs: yes. Metrics: yes.

## Endpoints

| Op | Method | Path |
| ---- | -------- | ------ |
| Create | POST | /api/config/namespaces/{ns}/http_loadbalancers |
| Read | GET | /api/config/namespaces/{ns}/http_loadbalancers/{name} |
| Update | PUT | /api/config/namespaces/{ns}/http_loadbalancers/{name} |
| Delete | DELETE | /api/config/namespaces/{ns}/http_loadbalancers/{name} |
| List | GET | /api/config/namespaces/{ns}/http_loadbalancers |

## Required Fields

- `metadata.name`
- `metadata.namespace`
- `spec.domains`

## Mutually Exclusive Groups

Pick exactly one from each group:

| - **lb_type**: `spec.http` | `spec.https` | `spec.https_auto_cert` | `spec.http_https` |
  Choose exactly one load balancer type

| - **advertising**: `spec.advertise_on_public_default_vip` | `spec.advertise_on_public` | `spec.advertise_custom` | `spec.do_not_advertise` |
  Choose exactly one advertising method

- **waf**: `spec.disable_waf` | `spec.enable_waf`

  WAF enabled or disabled

- **bot_defense**: `spec.disable_bot_defense` | `spec.enable_bot_defense`

  Bot defense enabled or disabled

- **rate_limit**: `spec.disable_rate_limit` | `spec.enable_rate_limit`

  Rate limiting enabled or disabled

- **api_discovery**: `spec.disable_api_discovery` | `spec.enable_api_discovery`

  API discovery enabled or disabled

- **api_testing**: `spec.disable_api_testing` | `spec.enable_api_testing`

  API testing enabled or disabled

- **api_definition**: `spec.disable_api_definition` | `spec.enable_api_definition`

  API definition enabled or disabled

- **malware_protection**: `spec.disable_malware_protection` | `spec.enable_malware_protection`

  Malware protection enabled or disabled

- **client_side_defense**: `spec.disable_client_side_defense` | `spec.enable_client_side_defense`

  Client-side defense enabled or disabled

- **ip_reputation**: `spec.disable_ip_reputation` | `spec.enable_ip_reputation`

  IP reputation enabled or disabled

- **threat_mesh**: `spec.disable_threat_mesh` | `spec.enable_threat_mesh`

  Threat mesh enabled or disabled

- **malicious_user_detection**: `spec.disable_malicious_user_detection` | `spec.enable_malicious_user_detection`

  Malicious user detection enabled or disabled

| - **tls_config**: `spec.https_auto_cert.tls_config.default_security` | `spec.https_auto_cert.tls_config.medium_security` | `spec.https_auto_cert.tls_config.low_security` | `spec.https_auto_cert.tls_config.custom_security` |
  Choose exactly one TLS security level

- **mtls**: `spec.https_auto_cert.no_mtls` | `spec.https_auto_cert.use_mtls`

  Mutual TLS enabled or disabled

| - **server_name_header**: `spec.https_auto_cert.default_header` | `spec.https_auto_cert.append_server_name_header` | `spec.https_auto_cert.pass_through_server_name_header` |
  Choose exactly one server name header handling

- **path_normalize**: `spec.https_auto_cert.enable_path_normalize` | `spec.https_auto_cert.disable_path_normalize`

  Path normalization enabled or disabled

- **loadbalancer_choice**: `spec.https_auto_cert.non_default_loadbalancer` | `spec.https_auto_cert.default_loadbalancer`

  Choose default or non-default load balancer

| - **header_transformation**: `spec.https_auto_cert.header_transformation_type.legacy_header_transformation` | `spec.https_auto_cert.header_transformation_type.proper_header_transformation` | `spec.https_auto_cert.header_transformation_type.preserve_case_header_transformation` |
  Choose exactly one header transformation type

| - **http_protocol**: `spec.https_auto_cert.http_protocol_options.http_protocol_enable_v1_only` | `spec.https_auto_cert.http_protocol_options.http_protocol_enable_v1_v2` | `spec.https_auto_cert.http_protocol_options.http_protocol_enable_v2_only` |
  Choose exactly one HTTP protocol version configuration

| - **coalescing**: `spec.https_auto_cert.coalescing_options.default_coalescing` | `spec.https_auto_cert.coalescing_options.disable_coalescing` | `spec.https_auto_cert.coalescing_options.enable_for_same_origin` |
  Choose exactly one connection coalescing option

| - **ddos_mitigation**: `spec.l7_ddos_protection.mitigation_block` | `spec.l7_ddos_protection.mitigation_challenge` | `spec.l7_ddos_protection.mitigation_none` |
  Choose exactly one DDoS mitigation action

- **ddos_rps_threshold**: `spec.l7_ddos_protection.default_rps_threshold` | `spec.l7_ddos_protection.custom_rps_threshold`

  Choose default or custom RPS threshold

| - **ddos_clientside_action**: `spec.l7_ddos_protection.clientside_action_none` | `spec.l7_ddos_protection.clientside_action_javascript` | `spec.l7_ddos_protection.clientside_action_captcha` |
  Choose exactly one client-side DDoS action

- **ddos_policy**: `spec.l7_ddos_protection.ddos_policy_none` | `spec.l7_ddos_protection.ddos_policy_ref`

  DDoS policy reference or none

| - **challenge**: `spec.no_challenge` | `spec.js_challenge` | `spec.captcha_challenge` |
  Choose exactly one challenge type

- **user_identification**: `spec.user_id_client_ip` | `spec.user_identification`

  Choose user identification method

- **client_ip_headers**: `spec.disable_trust_client_ip_headers` | `spec.enable_trust_client_ip_headers`

  Trust client IP headers or not

- **timeouts**: `spec.system_default_timeouts` | `spec.custom_timeouts`

  Use system default or custom timeouts

- **service_policies_source**: `spec.service_policies_from_namespace` | `spec.active_service_policies`

  Service policies from namespace or active list

- **sensitive_data_policy**: `spec.default_sensitive_data_policy` | `spec.custom_sensitive_data_policy`

  Use default or custom sensitive data policy

| - **load_balancing_algorithm**: `spec.round_robin` | `spec.least_request` | `spec.ring_hash` | `spec.random` |
  Choose exactly one load balancing algorithm

## Dependencies

Required: origin_pool
Optional: healthcheck, app_firewall, certificate, rate_limiter, service_policy, bot_defense_policy

## Relationship Hints

- origin_pool: Backend servers for traffic distribution
- app_firewall: WAF protection (requires WAAP subscription)
- healthcheck: Monitor backend availability
- certificate: TLS termination for HTTPS
- rate_limiter: Protect against traffic spikes

## Minimum JSON Payload

```json
{
  "metadata": {
    "name": "example-app",
    "namespace": "default"
  },
  "spec": {
    "domains": ["example.com"],
    "https_auto_cert": {
      "port": 443,
      "tls_config": {"default_security": {}}
    },
    "advertise_on_public_default_vip": {},
    "routes": [{"prefix": "/", "origin_pool": {"pool_name": "backend-pool"}}]
  }
}
```

## Constrained Fields

| Field | Type | Values | Default |
| ------- | ------ | -------- | --------- |
| `spec.https_auto_cert.port` | integer | 1-65535 | 443 |
| `spec.https_auto_cert.connection_idle_timeout` | integer | 1000-3600000 | 120000 |
| `spec.https_auto_cert.tls_config` | enum | default_security, medium_security, low_security, custom_security | default_security |
| `spec.https_auto_cert.header_transformation_type` | enum | legacy_header_transformation, proper_header_transformation, preserve_case_header_transformation | legacy_header_transformation |
| `spec.https_auto_cert.http_protocol_options` | enum | http_protocol_enable_v1_only, http_protocol_enable_v1_v2, http_protocol_enable_v2_only | http_protocol_enable_v1_v2 |
| `spec.https_auto_cert.coalescing_options` | enum | default_coalescing, disable_coalescing, enable_for_same_origin | default_coalescing |
| `spec.load_balancing_algorithm` | enum | round_robin, least_request, ring_hash, random | round_robin |
| `spec.l7_ddos_protection.mitigation` | enum | mitigation_block, mitigation_challenge, mitigation_none | mitigation_block |
| `spec.l7_ddos_protection.rps_threshold` | enum | default_rps_threshold, custom_rps_threshold | default_rps_threshold |
| `spec.l7_ddos_protection.clientside_action` | enum | clientside_action_none, clientside_action_javascript, clientside_action_captcha | clientside_action_none |
| `spec.challenge` | enum | no_challenge, js_challenge, captcha_challenge | no_challenge |
| `spec.advertising` | enum | advertise_on_public_default_vip, advertise_on_public, advertise_custom, do_not_advertise | advertise_on_public_default_vip |

## cURL Example

```bash
curl -X POST "$F5XC_API_URL/api/config/namespaces/default/http_loadbalancers" \
  -H "Authorization: APIToken $F5XC_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d @http-lb.json
```

## Additional Endpoints

| Method | Path | Summary |
| -------- | ------ | --------- |
| POST | /api/config/namespaces/{ns}/http_loadbalancers/get_security_config | GET Security Config for HTTP Load Balancer. |
| POST | /api/config/namespaces/{ns}/http_loadbalancers/{name}/api_definitions/assign | Assign API Definition. |
| GET | /api/config/namespaces/{ns}/http_loadbalancers/{name}/api_definitions/available | List Available API Definitions. |
| POST | /api/ml/data/namespaces/{ns}/http_loadbalancers/{name}/api_endpoints | GET API Endpoints. |
| GET | /api/ml/data/namespaces/{ns}/http_loadbalancers/{name}/api_endpoints/swagger_spec | GET Swagger Spec for HTTP Load Balancer. |
| POST | /api/ml/data/namespaces/{ns}/http_loadbalancers/{name}/api_inventory/api_endpoints/get_schema_updates | GET API Endpoints Schema Updates. |
| POST | /api/ml/data/namespaces/{ns}/http_loadbalancers/{name}/api_inventory/api_endpoints/update_schemas | Update API Endpoints Schemas. |
| GET | /api/config/namespaces/{ns}/http_loadbalancers/{name}/dos_automitigation_rules | GET DoS Auto-Mitigation Rules for HTTP Load Balancer. |
| DELETE | /api/config/namespaces/{ns}/http_loadbalancers/{name}/dos_automitigation_rules/{dos_automitigation_rule_name} | DELETE DoS Auto-Mitigation Rule for HTTP Load Balancer. |
| GET | /api/config/namespaces/{ns}/http_loadbalancers/{name}/get-dns-info | GET DNS Info. |
| POST | /api/config/namespaces/{ns}/http_loadbalancers/{name}/l7ddos_rps_threshold | Set L7 DDoS RPS Threshold. |
