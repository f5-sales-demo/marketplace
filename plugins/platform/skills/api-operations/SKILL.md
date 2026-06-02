---
name: api-operations
description: >-
  Spec-aware API CRUD operations for F5 Distributed Cloud platform resources.
  Covers 98 resource types across 38 domains with precise endpoints, payload
  templates, dependency ordering, and multi-step workflow compositions.
  Use when user wants to list, get, create, update, delete, or deploy any
  F5 XC resource via API — including HTTP load balancers, origin pools,
  WAF policies, DNS zones, certificates, cloud sites, and more. Also use
  for multi-step deployments like "deploy an HTTPS load balancer with WAF"
  or "set up a DNS zone with records." Even if the user doesn't say "API"
  explicitly, if they want to create, configure, or manage platform resources,
  this skill provides the spec knowledge the api-operator agent needs.
compatibility: Requires curl, jq, and network access to F5 XC tenant API
user-invocable: false
---

# API Operations

This skill gives the `api-operator` agent precise knowledge of F5 XC API
endpoints, request schemas, dependencies, and multi-step workflows. It does
this through generated reference files that the agent reads on demand.

## How It Works

1. **You** (main session) identify the resource and operation from the user's request
2. **You** look up the resource in the routing table below to find its domain and profile path
3. **You** delegate to the `api-operator` agent, telling it which reference files to read
4. **The agent** reads the files, constructs the API call(s), and executes them

All reference files live under `skills/api-operations/references/`.

## Operation Types

### Single-Resource CRUD

For list, get, create, update, or delete operations on a single resource:

```
Agent(
  subagent_type="platform:api-operator",
  description="<verb> <resource> via API",
  prompt="Read these reference files first:
  1. skills/api-operations/references/domains/<domain>.md
  2. skills/api-operations/references/resources/<domain>/<resource>.md

  Then: <VERB> <RESOURCE> in namespace <NS>.
  User parameters: <any specifics the user provided>

  Use the resource profile for exact endpoints and payload construction.
  Environment: F5XC_API_URL, F5XC_API_TOKEN, F5XC_NAMESPACE"
)
```

### Multi-Resource Workflows

For "deploy", "set up", "provision", or any request involving multiple
dependent resources, check the `references/workflows/` directory first:

| Workflow | File | Trigger |
| ---------- | ------ | --------- |
| Deploy HTTP LB | `workflows/deploy_http_loadbalancer.md` | "deploy HTTP LB", "create LB with pool" |
| Deploy HTTPS LB | `workflows/deploy_https_loadbalancer.md` | "deploy HTTPS LB", "LB with TLS/SSL" |
| Enable WAF | `workflows/enable_waf_protection.md` | "add WAF to LB", "enable WAF" |
| Configure DNS | `workflows/configure_dns_zone.md` | "set up DNS zone", "configure DNS" |
| Enable CDN | `workflows/enable_cdn_distribution.md` | "enable CDN", "set up CDN" |
| Configure Origin Pool | `workflows/configure_origin_pool.md` | "set up origin pool with health checks" |
| Register Site | `workflows/register_site.md` | "register site", "add CE site" |

```
Agent(
  subagent_type="platform:api-operator",
  description="Deploy <resource> via API workflow",
  prompt="Read these reference files first:
  1. skills/api-operations/references/workflows/<workflow_id>.md
  2. For each step's resource, read: skills/api-operations/references/resources/<domain>/<resource>.md

  Then: Execute the workflow in namespace <NS>.
  User parameters: <specifics>

  Create resources in dependency order. Pass resource names between steps.
  Environment: F5XC_API_URL, F5XC_API_TOKEN, F5XC_NAMESPACE"
)
```

If no workflow matches, use the domain catalog's dependency graph and
creation order to determine the sequence.

### Custom Actions

For non-CRUD actions (get security config, assign API definitions, etc.),
read the resource profile's "Additional Endpoints" section.

## Alias Resolution

Users may refer to resources by common names rather than API names:

| User Says | Resource | Domain |
| ----------- | ---------- | -------- |
| "LB", "load balancer", "HTTP LB" | `http_loadbalancer` | `virtual` |
| "TCP LB", "TCP load balancer" | `tcp_loadbalancer` | `virtual` |
| "pool", "backend", "origin pool" | `origin_pool` | `virtual` |
| "health check", "health monitor" | `healthcheck` | `virtual` |
| "WAF", "firewall", "app firewall" | `app_firewall` | `virtual` |
| "cert", "SSL cert", "certificate" | `certificate` | `certificates` |
| "DNS zone", "zone" | `dns_zone` | `dns` |
| "DNS LB", "GSLB" | `dns_load_balancer` | `dns` |
| "AWS site", "AWS VPC" | `aws_vpc_site` | `cloud_infrastructure` |
| "Azure site", "Azure VNet" | `azure_vnet_site` | `cloud_infrastructure` |
| "GCP site", "GCP VPC" | `gcp_vpc_site` | `cloud_infrastructure` |
| "cloud creds" | `cloud_credentials` | `cloud_infrastructure` |
| "vK8s", "virtual Kubernetes" | `virtual_k8s` | `container_services` |
| "DDoS", "DDoS protection" | `ddos_protection` | `ddos` |
| "bot defense" | `bot_defense_instance` | `bot_and_threat_defense` |
| "rate limit" | `rate_limiter` | `rate_limiting` |
| "forward proxy" | `forward_proxy_policy` | `network_security` |
| "net policy" | `network_policy` | `network_security` |
| "log sink" | `log_receiver` | `observability` |
| "alert" | `alert_policy` | `observability` |
| "site", "edge site" | `site` | `sites` |
| "vsite" | `virtual_site` | `sites` |
| "role" | `user_role` | `users` |

## Resource Routing Table

98 resources across 38 domains. Use this to find the right profile file.

| Resource | Domain | Category | Profile |
| ---------- | -------- | ---------- | --------- |
| `http_loadbalancer` | `virtual` | Networking | resources/virtual/http_loadbalancer.md |
| `tcp_loadbalancer` | `virtual` | Networking | resources/virtual/tcp_loadbalancer.md |
| `origin_pool` | `virtual` | Networking | resources/virtual/origin_pool.md |
| `healthcheck` | `virtual` | Networking | resources/virtual/healthcheck.md |
| `app_firewall` | `virtual` | Networking | resources/virtual/app_firewall.md |
| `service_policy` | `virtual` | Networking | resources/virtual/service_policy.md |
| `malicious_user_detection` | `virtual` | Networking | resources/virtual/malicious_user_detection.md |
| `dns_zone` | `dns` | Networking | resources/dns/dns_zone.md |
| `dns_domain` | `dns` | Networking | resources/dns/dns_domain.md |
| `dns_load_balancer` | `dns` | Networking | resources/dns/dns_load_balancer.md |
| `certificate` | `certificates` | Security | resources/certificates/certificate.md |
| `ca_certificate` | `certificates` | Security | resources/certificates/ca_certificate.md |
| `certificate_chain` | `certificates` | Security | resources/certificates/certificate_chain.md |
| `aws_vpc_site` | `cloud_infrastructure` | Infrastructure | resources/cloud_infrastructure/aws_vpc_site.md |
| `azure_vnet_site` | `cloud_infrastructure` | Infrastructure | resources/cloud_infrastructure/azure_vnet_site.md |
| `gcp_vpc_site` | `cloud_infrastructure` | Infrastructure | resources/cloud_infrastructure/gcp_vpc_site.md |
| `cloud_credentials` | `cloud_infrastructure` | Infrastructure | resources/cloud_infrastructure/cloud_credentials.md |
| `network_policy` | `network_security` | Security | resources/network_security/network_policy.md |
| `forward_proxy_policy` | `network_security` | Security | resources/network_security/forward_proxy_policy.md |
| `network_firewall` | `network_security` | Security | resources/network_security/network_firewall.md |
| `api_definition` | `api` | Security | resources/api/api_definition.md |
| `api_endpoint` | `api` | Security | resources/api/api_endpoint.md |
| `api_rate_limit` | `api` | Security | resources/api/api_rate_limit.md |
| `virtual_network` | `network` | Networking | resources/network/virtual_network.md |
| `network_connector` | `network` | Networking | resources/network/network_connector.md |
| `site_mesh_group` | `network` | Networking | resources/network/site_mesh_group.md |
| `ddos_protection` | `ddos` | Security | resources/ddos/ddos_protection.md |
| `ddos_mitigation_rule` | `ddos` | Security | resources/ddos/ddos_mitigation_rule.md |
| `bot_defense_instance` | `bot_and_threat_defense` | Security | resources/bot_and_threat_defense/bot_defense_instance.md |
| `threat_category` | `bot_and_threat_defense` | Security | resources/bot_and_threat_defense/threat_category.md |
| `rate_limiter` | `rate_limiting` | Networking | resources/rate_limiting/rate_limiter.md |
| `rate_limiter_policy` | `rate_limiting` | Networking | resources/rate_limiting/rate_limiter_policy.md |
| `rate_limit_threshold` | `rate_limiting` | Networking | resources/rate_limiting/rate_limit_threshold.md |
| `cdn_loadbalancer` | `cdn` | Networking | resources/cdn/cdn_loadbalancer.md |
| `cdn_origin_pool` | `cdn` | Networking | resources/cdn/cdn_origin_pool.md |
| `log_receiver` | `observability` | Operations | resources/observability/log_receiver.md |
| `metrics_receiver` | `observability` | Operations | resources/observability/metrics_receiver.md |
| `alert_policy` | `observability` | Operations | resources/observability/alert_policy.md |
| `site` | `sites` | Infrastructure | resources/sites/site.md |
| `virtual_site` | `sites` | Infrastructure | resources/sites/virtual_site.md |
| `virtual_k8s` | `container_services` | Infrastructure | resources/container_services/virtual_k8s.md |
| `workload` | `container_services` | Infrastructure | resources/container_services/workload.md |
| `authentication_policy` | `authentication` | Platform | resources/authentication/authentication_policy.md |
| `token` | `authentication` | Platform | resources/authentication/token.md |
| `api_credential` | `authentication` | Platform | resources/authentication/api_credential.md |
| `user` | `users` | Platform | resources/users/user.md |
| `user_role` | `users` | Platform | resources/users/user_role.md |
| `namespace_role` | `users` | Platform | resources/users/namespace_role.md |
| `sensitive_data_policy` | `data_and_privacy_security` | Security | resources/data_and_privacy_security/sensitive_data_policy.md |
| `blindfold_secret` | `blindfold` | Security | resources/blindfold/blindfold_secret.md |
| `secret_policy` | `blindfold` | Security | resources/blindfold/secret_policy.md |
| `nginx_config` | `nginx_one` | Platform | resources/nginx_one/nginx_config.md |
| `site_config` | `ce_management` | Infrastructure | resources/ce_management/site_config.md |
| `fleet_config` | `ce_management` | Infrastructure | resources/ce_management/fleet_config.md |
| `registration_token` | `ce_management` | Infrastructure | resources/ce_management/registration_token.md |
| `mk8s_cluster` | `managed_kubernetes` | Infrastructure | resources/managed_kubernetes/mk8s_cluster.md |
| `container_registry` | `managed_kubernetes` | Infrastructure | resources/managed_kubernetes/container_registry.md |
| `shape_app_firewall` | `shape` | Security | resources/shape/shape_app_firewall.md |
| `shape_recognizer` | `shape` | Security | resources/shape/shape_recognizer.md |
| `telemetry_receiver` | `telemetry_and_insights` | Operations | resources/telemetry_and_insights/telemetry_receiver.md |
| `mitigation_policy` | `secops_and_incident_response` | Security | resources/secops_and_incident_response/mitigation_policy.md |
| `support_case` | `support` | Operations | resources/support/support_case.md |
| `dashboard` | `statistics` | Operations | resources/statistics/dashboard.md |
| `user_profile` | `tenant_and_identity` | Platform | resources/tenant_and_identity/user_profile.md |
| `object_store` | `object_storage` | Platform | resources/object_storage/object_store.md |
| `bucket` | `object_storage` | Platform | resources/object_storage/bucket.md |
| `bigip_pool` | `bigip` | Platform | resources/bigip/bigip_pool.md |
| `bigip_device` | `bigip` | Platform | resources/bigip/bigip_device.md |
| `ai_policy` | `ai_services` | AI | resources/ai_services/ai_policy.md |
| `ai_gateway` | `ai_services` | AI | resources/ai_services/ai_gateway.md |
| `marketplace_item` | `marketplace` | Platform | resources/marketplace/marketplace_item.md |
| `threat_campaign_policy` | `threat_campaign` | Security | resources/threat_campaign/threat_campaign_policy.md |

For resources not listed above, check the domain catalog in
`references/domains/<domain>.md` to discover all resources in that domain.

## Gotchas

- F5 XC uses `POST` for **both** create and list operations on some
  endpoints. The resource profile distinguishes them — create endpoints
  have `{metadata.namespace}` in the path, list endpoints have `{namespace}`.
- Mutually exclusive groups use empty objects `{}` as values, not booleans.
  For example, `"disable_waf": {}` not `"disable_waf": true`.
- Resource names must be DNS labels: lowercase alphanumeric + hyphens,
  max 63 chars, cannot start or end with a hyphen. The API returns a
  cryptic 400 error if this is violated.
- Some domains use a path prefix before `/namespaces/` — for example,
  DNS uses `/api/config/dns/namespaces/` not `/api/config/namespaces/`.
  Always use the exact path from the resource profile.
- The `origin_pool` resource appears in both the `virtual` and
  `service_mesh` domains with different schemas. Use the `virtual`
  domain version for HTTP/TCP load balancers.
- When referencing another resource (e.g., attaching a WAF to an LB),
  use the format `{"name": "resource-name", "namespace": "ns"}` not
  just the name string.
- The API returns 409 (Conflict) if a resource with the same name
  already exists. Check existence with a GET first if unsure.

## Spec Version

Read `references/version.md` for the current spec version and generation date.
