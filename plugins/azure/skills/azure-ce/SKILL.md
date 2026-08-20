---
name: azure-ce
description: >-
  Discover, plan, deploy, reconcile, operate, diagnose, repair, and tear down F5
  Distributed Cloud Secure Mesh Site v2 Customer Edge on Azure. Use for Azure CE
  Marketplace images, one-node or three-node topology, ordered NICs, VNet/subnets,
  NSGs, public-IP/NAT/firewall/proxy egress, UDRs, Route Server/BGP, lifecycle, boot,
  cloud-init, Network Watcher, and cross-plane health.
---

# Azure Customer Edge

Use only Secure Mesh Site v2. Read the
[Azure provider contract](references/contracts.md) before discovery or planning. The provider-neutral
contract is fetched and validated by `azure_compute_discover`; do not copy it into prompts or infer
it from this skill. Never substitute generic `az_exec`, Azure VNet Site, Fleet, or shared-token flows.

## Workflow

1. Use `web_search` to read the dedicated `f5xc-ce-automation/v1` document, the current
   official F5 Azure SMSv2 guide, and relevant Microsoft Marketplace, VM SKU, and networking
   documentation. Cite the sources used.
2. Call `az_account_show`, then `azure_compute_discover`. Omit image and VM hints unless the
   user explicitly constrained them. Require schema v2, the validated shared-contract receipt,
   live provider-source digests, ranked regions, exact Marketplace tuple, subscription terms,
   VM/NIC/zone/quota/policy evidence, and a discovery artifact.
3. Translate the request into `AzureCeIntent` schema v2 and call `azure_ce_plan`. Show the exact
   plan ID/hash, region, image, topology, NIC order, egress/routing/security changes, restoration
   state, billable resources, warnings, and action order before approval.
4. Plan the platform site with `f5xc_ce_v2_site`; after approval, submit its exact hash. Checkout
   one opaque bootstrap reference per node immediately before `azure_ce_apply` needs it.
5. Use `f5xc_ce_v2_status` at registration, health, BGP, routing, and traffic gates. Resume only
   with the same Azure plan ID/hash. Rediscover and replan when source or cloud observations drift.
6. Finish with `azure_ce_status`, passive `azure_ce_diagnose`, and Azure/platform evidence. For
   active diagnostics or teardown, obtain the separate approval required by the shared contract.

For headless execution, use only `XCSH_CE_HEADLESS_MUTATIONS=1`,
`XCSH_CE_ACCEPT_MARKETPLACE_TERMS=1`, and `XCSH_CE_ALLOW_DESTROY=1` for their respective
operations. Version-1 plans and Azure-named compatibility gates are unsupported.
