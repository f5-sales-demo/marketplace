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
Execute this workflow directly. Do not delegate research or discovery to `task`, agents, or generic
helpers because their results cannot satisfy the required Azure tool evidence.

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
5. For Terraform, the single normal `terraform apply` signs unaccepted terms for only the exact
   discovered F5 XC subscription, publisher, offer, and plan through its pinned apply-only action
   before VM admission. It needs no separate terms authorization, human acceptance, CLI command,
   manual state action, import, taint, rediscovery, or replan. Do not use `az vm image terms
   accept`, accept caller-supplied or arbitrary offers, suppress an acceptance failure, or treat
   this as authorization for native, replacement, or repair work. Apply the exact plan with
   `azure_ce_apply`; Terraform execution stages the
   network, reserves the site, retrieves verified site-bound cloud-init internally, admits
   the complete site, correlates VM/NIC/MAC identities, and approves registration. If the
   verified contract says Azure headless bootstrap is unavailable, stop before cloud mutation;
   do not construct custom data or ask the user to relay a token.
   For a Route Server Terraform acceptance plan that needs a CE-advertised application prefix,
   use the optional `workloadFixture` only for an initial Terraform Route Server deployment. It
   creates an isolated private subnet, NIC, and HTTP-service VM with no public IP. Its CIDR must be
   exactly one advertised destination and must not overlap a CE NIC subnet. The approved fixture is
   `10.253.0.0/24` at `10.253.0.4:8080`; prove its learned/effective route separately from VIP
   traffic and never treat the fixture as public ingress.
6. After registration, use `azure_ce_upgrade` to prepare or apply an exact serial native or
   Terraform software/OS action. A native response lost after the persisted mutation boundary is
   reconciled from platform state without replay. Treat version completion separately from node,
   routing, and traffic health.
7. For a planned outage, call `azure_ce_failover` to prepare the exact engine-owned node from a
   fresh subscription, VM resource, immutable VM UUID, running-state, region, and ownership-tag
   observation. Apply only when the tool can collect both Route Server sessions, effective routes,
   and traffic before the outage, during withdrawal, and after recovery. A schema path or caller
   assertion cannot satisfy these gates. Do not power-cycle a Terraform-owned VM with generic `az`.
8. Use `f5xc_ce_v2_status` at registration, health, BGP, routing, and traffic gates. Resume only
   with the same Azure plan ID/hash. Rediscover and replan when source or cloud observations drift.
9. Finish with `azure_ce_status`, passive `azure_ce_diagnose`, and Azure/platform evidence. Use
   `azure_ce_teardown` with the original deployment plan to prepare and apply a separate immutable
   retirement plan. Terraform teardown drains platform resources, destroys only state-projected
   resources inside the live owned resource group, retires tokens and the exact site, then requires
   final no-change and group-absence evidence. Native teardown additionally requires the reviewed
   greenfield cloud teardown plan; its authorization is reused without a second prompt.

For headless execution, use `XCSH_CE_HEADLESS_MUTATIONS=1`, and
`XCSH_CE_ALLOW_DESTROY=1` for teardown. Version-1 and version-2 deployment plans and
Azure-named compatibility gates are unsupported. The published v6.1.2 API schema and the held
`f5xc-smsv2-api/v1@7.0.0` executable contract are separate identities; schema presence alone does
not authorize create, bootstrap, routing, health, failover, or teardown execution.

Marketplace terms remain a live discovery requirement. For an initial Terraform deployment, the
same idempotent `terraform apply` signs only the exact observed F5 XC agreement and then
revalidates that transition without a human, separate authorization, CLI step, manual state
intervention, import, taint, rediscovery, or replan. Its teardown removes only the action state
and never cancels a subscription agreement. Native deployments and Terraform replacement or
repair require observed accepted terms and must fail closed otherwise.
