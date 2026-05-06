# F5 Distributed Cloud — Status Page Context

Domain knowledge for interpreting the F5 Cloud Status page.

**Live page:** <https://www.f5cloudstatus.com>
**API base:** <https://www.f5cloudstatus.com/api/v2>

## What is F5 Distributed Cloud?

F5 Distributed Cloud (F5 XC) is a SaaS platform that delivers multi-cloud
networking, security, and application delivery services. It operates a
globally distributed network of **Regional Edge (RE) sites** — physical
Points of Presence (PoPs) in major markets worldwide — through which all
customer traffic flows.

**Core service categories:**

| Category | Services |
| ---------------------- | --------------------------------------------------------------------- |
| Networking | App Connect, Network Connect, SD-WAN, service mesh |
| Security | WAF, API Security, Bot Defense, DDoS Protection, Client-Side Defense |
| Application Delivery | HTTP/HTTPS Load Balancing, CDN, DNS, Rate Limiting |
| Compute | Distributed Apps, Edge Compute |
| Observability | Analytics, Logging, Metrics, AI Assistant |
| Platform | Console, API, Identity/Auth, Terraform Provider |

## Regional Edge (RE) Coverage

F5 XC Regional Edges serve as the distributed backbone. The status page
organizes components into the following geographic and service groups:

| Component Group | Coverage |
| ------------------------------------ | ----------------------------------------------------- |
| Services | Core platform services (console, API, control plane) |
| Customer Support, Docs and site | Support infrastructure and documentation |
| North America PoPs | US, Canada regional edge sites |
| South America PoPs | Latin America regional edge sites |
| Europe PoPs | European regional edge sites |
| Asia PoPs | Southeast Asia, India, China regional edge sites |
| Oceania PoPs | Australia, New Zealand, Pacific regional edge sites |
| Middle East PoPs | Middle East regional edge sites |
| Silverline - Legacy | Legacy Silverline service components |
| Bot and Risk Mgt - Legacy | Legacy bot and risk management components |

**Agent instruction:** When you fetch `summary.json`, map the actual
component group names to these categories. If group names don't match
these patterns (they may use city names, datacenter codes, or service
names instead), adapt your regional analysis accordingly.

## Service Dependency Map

Upstream issues cascade downstream:

```
Console / API (Control Plane)
  ├── Configuration Management
  │     └── All traffic-path services depend on config being deliverable
  └── Identity / Auth
        └── Required for all management operations

DNS
  └── Required for all new client connections (semi-independent)

Regional Edge Sites (per-region)
  └── Load Balancing / CDN
        └── WAF / API Security / Bot Defense
              └── Origin Connectivity → Customer Applications
```

**Key dependency insight:** A control plane outage prevents *configuration
changes* but does not stop existing traffic rules from enforcing. DNS
outages are more severe for end user impact than control plane outages.

## Severity Interpretation Guide

| Condition | Likely Customer Impact |
| ------------------------------------------- | --------------------------------------------------------------------------- |
| Single RE site degraded | Low — traffic auto-reroutes to nearest healthy RE |
| Multiple RE sites in same region degraded | Moderate — regional users see latency or partial failures |
| Control plane (Console/API) degraded | Moderate — cannot make config changes; traffic still flows |
| Control plane outage | High — no config changes possible; existing rules still enforce |
| Security services (WAF/Bot) degraded | High — reduced security posture, potential policy bypass |
| DNS degraded/outage | Critical — new connections cannot resolve; existing connections unaffected |
| Multiple regions simultaneously affected | Critical — global impact |

## Stakeholder Communication Template

When generating status reports for stakeholders, use this tone and structure:

**Tone:** Factual, calm, non-alarmist. State facts, timelines, and impact scope.

**Avoid these words** unless the status page itself says `critical`: "emergency",
"disaster", "catastrophic", "dire", "serious"

**Template:**

```
F5 Distributed Cloud Status Update — [date/time UTC]

Current Status: [indicator] — [description from status.json]
Affected Services: [component names from unresolved incidents]
Customer Impact: [assessment using dependency map + severity guide above]
Status Page: [shortlink from incident, or https://www.f5cloudstatus.com]
Estimated Resolution: [from latest incident_update, or "Monitoring — no ETA"]
Next Update Expected: [estimate based on incident update frequency]
```
