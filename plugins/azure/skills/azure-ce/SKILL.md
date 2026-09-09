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

## Existing-state inventory

For questions about existing CE deployments, inventory, ownership, creator evidence, activity, or
the current CE footprint, call `az_account_show` and then `azure_ce_inventory`. Pass only the
subscription UUID plus optional caller and non-secret platform-site evidence. The composite tool
owns all Resource Graph paging, instance-view runtime checks, retained Activity Log evidence,
correlation, deterministic classification, and artifact persistence. Do not use web search, generic
delegation, `az_exec`, `azure_compute_discover`, `azure_ce_plan`, or mutation for this path. Treat
caller association as evidence, never as an ownership claim, and keep infrastructure, runtime,
platform, routing, and traffic-health states independent.

## Deployment workflow

1. Use `web_search` to read the dedicated `f5xc-ce-automation-policy/v2` document, the current
   official F5 Azure SMSv2 guide, and relevant Microsoft Marketplace, VM SKU, and networking
   documentation. Cite the sources used.
2. Call `az_account_show`, then `azure_compute_discover`. Omit image and VM hints unless the
   user explicitly constrained them. Require schema v3, the validated shared-contract receipt,
   live provider-source digests, ranked regions, exact Marketplace tuple, subscription terms,
   VM/NIC/zone/quota/policy evidence, and a discovery artifact.
3. Select the execution engine: default to `native` for new conversational requests;
   preserve an explicit `terraform` request. Plans and checkpoints bind ownership to
   that engine. `azure_ce_apply` routes Terraform plans to the Terraform lifecycle
   service and rejects caller-provided bootstrap or health claims. Do not switch engines
   to bypass a capability failure. Schema v2 artifacts require replanning; engine
   migration is unsupported.

4. Translate the request into `AzureCeIntent` schema v3 and call `azure_ce_plan`. Show the exact
   plan ID/hash, region, image, topology, NIC order, egress/routing/security changes, restoration
   state, billable resources, warnings, and action order before approval.
5. Apply the exact approved plan with `azure_ce_apply`. Terraform execution stages the
   network, reserves the site, retrieves verified site-bound cloud-init internally, admits
   the complete site, correlates VM/NIC/MAC identities, and approves registration. If the
   verified contract says Azure headless bootstrap is unavailable, stop before cloud mutation;
   do not construct custom data or ask the user to relay a token.
6. After registration, use `azure_ce_upgrade` to prepare or apply an exact serial native or
   Terraform software/OS action. A native response lost after the persisted mutation boundary is
   reconciled from platform state without replay. Treat version completion separately from node,
   routing, and traffic health.
7. Use `f5xc_ce_v2_status` at registration, health, BGP, routing, and traffic gates. Resume only
   with the same Azure plan ID/hash. Rediscover and replan when source or cloud observations drift.
8. Finish with `azure_ce_status`, passive `azure_ce_diagnose`, and Azure/platform evidence. For
   active diagnostics or teardown, preserve existing authorization and confirm scope only when
   the requested action falls outside it.

For headless execution, use `XCSH_CE_HEADLESS_MUTATIONS=1`, and
`XCSH_CE_ALLOW_DESTROY=1` for teardown. Version-1 and version-2 deployment plans and
Azure-named compatibility gates are unsupported.

Initial Azure Marketplace terms acceptance must be completed by a human for the exact
image offer and plan. Automation may observe acceptance but must not accept initial
terms. Rediscover and replan after acceptance, as required by the
[MCN legal approval policy](https://f5-sales-demo.github.io/mcn/en/customer-edge/automation-contract/).
