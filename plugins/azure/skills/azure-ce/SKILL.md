---
name: azure-ce
description: >-
  Discover, plan, deploy, reconcile, operate, diagnose, repair, and tear down F5
  Distributed Cloud Customer Edge on Azure with Secure Mesh Site v2. Use whenever
  the user says Customer Edge, F5 CE, XC CE, Distributed Cloud node, Secure Mesh,
  cloud CE appliance, three-node F5 cluster, CE image, CE Marketplace appliance,
  or asks to deploy or operate F5 Distributed Cloud in Azure. Covers one-node or
  three-node HA topology, ordered NICs, Marketplace images, Route Server/BGP,
  UDRs, brownfield networks, lifecycle changes, cloud-init, and cross-plane health.
---

# Azure Customer Edge

Run CE work as an immutable cross-plane transaction. Never substitute generic
`az_exec`, legacy Azure VNet Site, Fleet, or shared registration-token workflows.
Read [contracts.md](references/contracts.md) before planning or mutating a CE site.

## Orchestration

1. Research the current vendor procedure before making any recommendation. Use
   `web_search` to retrieve the official F5 **Deploy Secure Mesh Site v2 in Azure**
   guide from `docs.cloud.f5.com` and Microsoft image/SKU guidance from
   `learn.microsoft.com`. Read the relevant results and cite their titles and URLs.
   Do not substitute memory, cached identifiers, third-party pages, or generic CLI
   help. If current official sources cannot be retrieved, stop before recommending
   a catalog tuple, region, VM size, or plan.
2. Check Azure authentication with `az_account_show`. Check Platform authentication
   without displaying credentials.
3. Call `azure_compute_discover` without publisher, offer, plan, version, or VM-size
   hints unless the user explicitly pins one. The tool must enumerate live Azure
   publishers, offers, image SKUs, exact versions, and subscription-aware VM SKUs;
   validate terms, quota, policy, zones, NIC limits, Route Server support, and
   brownfield proximity; and persist a discovery artifact. Require
   `research.method=azure-cli-live`, the enumerated command receipt, and official
   source URLs in its result. Never guess or copy catalog identifiers from a prior
   session. Rank every returned AzureCloud region and explain the leading eligible
   choice and rejected choices.
4. Translate the user's natural-language request into the typed `AzureCeIntent`.
   Copy the exact image tuple and a compatible VM size from the discovery result.
   Call `azure_ce_plan` with the discovery artifact. Do not ask the user to author
   YAML or add bootstrap material. Never call `azure_ce_plan` before successful
   official-source research and live discovery.
5. Display the exact plan ID, SHA-256, pinned image, topology, ordered NICs, zones,
   routing, security warnings, brownfield changes, rollback state, billable resources,
   and ordered actions. Obtain explicit approval.
6. Call `f5xc_ce_v2_site` without a hash to plan the Secure Mesh Site v2 change.
   Display its hash, then call it again with the exact hash after approval.
7. For each node immediately before launch, call `f5xc_ce_v2_bootstrap`. Pass only
   the returned `f5xc-ce://` reference to `azure_ce_apply`. Never read, expand,
   copy, quote, log, or persist token bytes.
8. Call `f5xc_ce_v2_status` at every registration, health, and BGP gate. Pass only
   its non-secret evidence to `azure_ce_apply` or `azure_ce_status`.
9. Activate UDR or Route Server routing only after every required node is registered
   and healthy. Finish with `azure_ce_status` and passive `azure_ce_diagnose` evidence.

## Research Receipt

Before showing a recommendation or plan, summarize the evidence in this order:

1. official F5 guidance consulted;
2. official Microsoft image and subscription-aware SKU guidance consulted;
3. authenticated subscription and AzureCloud environment;
4. live publisher, offer, image SKU, exact version, and terms status;
5. compatible VM sizes and ranked regions with rejected-region reasons;
6. discovery artifact ID.

Absence of any item is a failed research gate, not permission to infer a value.

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
