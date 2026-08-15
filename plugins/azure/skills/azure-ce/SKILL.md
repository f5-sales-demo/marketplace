---
name: azure-ce
description: >-
  Discover, plan, deploy, reconcile, operate, diagnose, repair, and tear down F5
  Distributed Cloud Customer Edge on Azure with Secure Mesh Site v2. Use for any
  Azure CE request involving one-node or three-node HA topology, ordered NICs,
  Marketplace images, Route Server/BGP, UDRs, brownfield networks, lifecycle
  changes, cloud-init, or cross-plane Azure and F5 health evidence.
---

# Azure Customer Edge

Run CE work as an immutable cross-plane transaction. Never substitute generic
`az_exec`, legacy Azure VNet Site, Fleet, or shared registration-token workflows.
Read [contracts.md](references/contracts.md) before planning or mutating a CE site.

## Orchestration

1. Check Azure authentication with `az_account_show`. Check Platform authentication
   without displaying credentials.
2. Call `azure_compute_discover` before recommending a region. Rank every returned
   AzureCloud region and explain the leading eligible choice and rejected choices.
3. Translate the user's natural-language request into the typed `AzureCeIntent`.
   Call `azure_ce_plan` with the discovery artifact. Do not ask the user to author
   YAML or add bootstrap material.
4. Display the exact plan ID, SHA-256, pinned image, topology, ordered NICs, zones,
   routing, security warnings, brownfield changes, rollback state, billable resources,
   and ordered actions. Obtain explicit approval.
5. Call `f5xc_ce_v2_site` without a hash to plan the Secure Mesh Site v2 change.
   Display its hash, then call it again with the exact hash after approval.
6. For each node immediately before launch, call `f5xc_ce_v2_bootstrap`. Pass only
   the returned `f5xc-ce://` reference to `azure_ce_apply`. Never read, expand,
   copy, quote, log, or persist token bytes.
7. Call `f5xc_ce_v2_status` at every registration, health, and BGP gate. Pass only
   its non-secret evidence to `azure_ce_apply` or `azure_ce_status`.
8. Activate UDR or Route Server routing only after every required node is registered
   and healthy. Finish with `azure_ce_status` and passive `azure_ce_diagnose` evidence.

## Lifecycle and Recovery

- Create a new plan for `start`, `stop`, `resize`, `update-network`, `replace-node`,
  `repair`, or `teardown`; never edit or reinterpret an old plan.
- Use the same plan ID and SHA-256 to resume a partial apply. Treat Azure and F5
  observations as authoritative; do not retry a stale plan or trigger blind rollback.
- For HA resize or replacement, advance one node at a time and require registration,
  health, BGP, and traffic evidence between nodes.
- Warn that single-node resize, replacement, and NIC changes are disruptive.
- For teardown, drain routing, restore every approved brownfield association/route,
  delete only owned Azure resources, delete Secure Mesh Site v2 state, and verify
  the final inventory.

## Diagnostics

- Start with `azure_ce_status`, `f5xc_ce_v2_status`, passive
  `azure_ce_diagnose`, and `azure_cloud_init_analyze`.
- Request a separate approval before active VM Run Command or Network Watcher work.
- Report digests, states, counts, and allowlisted evidence. Never return raw custom
  data, boot logs, guest output, environment variables, or authentication material.
