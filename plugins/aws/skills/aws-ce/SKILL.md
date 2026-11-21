---
name: aws-ce
description: >-
  Inventory, discover, plan, deploy, reconcile, operate, diagnose, repair, and tear down F5
  Distributed Cloud Secure Mesh Site v2 Customer Edge on AWS. Use for AWS CE
  Marketplace AMIs, one-node or three-node topology, ordered ENIs, VPC/subnets,
  security groups, egress, direct ENI routes, NLB ingress, TGW static or capability-
  gated TGW Connect, lifecycle, boot, cloud-init, and cross-plane health.
---

# AWS Customer Edge

Read the [candidate acceptance boundaries](references/acceptance.md) before describing HA,
static cutover, whole-site power operations, or release readiness. Keep unsupported capabilities gated.

Use only Secure Mesh Site v2. Read the [AWS provider contract](references/contracts.md) before
discovery or planning. Read the [operations reference](references/operations.md) for sizing, PassRole, SSM, routing symmetry, and bounded evidence. `aws_compute_discover` fetches and validates the provider-neutral contract;
do not copy that contract into prompts. Never substitute generic `aws_exec`, legacy AWS VPC/TGW
Site, Fleet, or shared-token flows.

## Inventory

For inventory-only requests, call `aws_ce_inventory` with the explicit account, profile and
requested regions. It needs no deployment plan, image recommendation or Marketplace agreement.
Report the returned selection and region coverage. Cloud site tags are provisional associations;
missing platform evidence leaves registration and health unknown. A failed collection is unavailable,
not an empty estate.

## Site topology

Distinguish site count from node count. In schema v2, `topology.sites` assigns each node index
(starting at 1) to exactly one named site. One site with `[1, 2, 3]` is HA; three sites each with
one index are independent sites. Each site has one or three nodes. Persist the names and membership
in the plan; lifecycle work must preserve them. AWS bootstrap, registration and status use these
site bindings. Internal Terraform adapters execute these topologies; consult the provider
contract for their acceptance scope and public-tool integration status.

## Workflow

For greenfield networks, use canonical IPv4 VPC and subnet CIDRs from `/16` through `/28`.
Every new subnet must be contained in the VPC and must not overlap another new subnet.
AWS-prohibited IPv4 ranges are rejected before planning. Brownfield subnet membership must
come from observed placement; a primary VPC CIDR alone does not bound secondary ranges.

1. Use `web_search` to read the dedicated `f5xc-ce-automation-policy/v2` document, the current official
   F5 AWS SMSv2 guide, and relevant current AWS Marketplace, EC2, AMI policy, quota, NLB, and TGW
   documentation. Cite the sources used.
2. Call `aws_sts_whoami`, `f5xc_ce_v2_capabilities`, then `aws_compute_discover`. Require live
   identity, schema v2 discovery, the validated shared-contract receipt, current source digests,
   every region in stable rank order, the exact regional SSM parameter version and AMI, agreement,
   instance/ENI/AZ/quota/policy evidence, and a discovery artifact.
3. Translate the request into `AwsCeIntent` schema v2 with an explicit `native` or `terraform` engine
   and model internal NLB ingress separately from the routing profile. This permits an explicit
   NLB plus TGW Connect composition without treating the load balancer as a route next hop. Require
   exact XC listener/domain/origin-pool intent, three independent sites, and a content-bound probe
   from an explicitly allowlisted Linux SSM managed instance. Require current NLB quota and platform
   capability evidence for that composition,
   and call `aws_ce_plan`. Native is the conversational default; preserve explicit Terraform intent. Show the plan ID/hash,
   exact AMI, topology/ENI order, egress/routing/security changes, restoration state, billable
   resources, warnings, and ordered argv actions before approval.
4. Apply the exact approved AWS plan with `aws_ce_apply`. Native execution uses the shared platform
   service to create the site, issue site-bound bootstrap, correlate and approve registrations, and
   observe health. Terraform execution uses isolated workspaces and exact saved plans. Do not supply
   caller-made bootstrap or health assertions, and do not substitute native execution for an
   explicitly selected Terraform engine.
5. Use `aws_ce_upgrade` for exact serial native or Terraform software/OS actions. Use
   `aws_ce_failover` with the owning engine to prepare and execute one selected-node outage and
   exact BGP withdrawal and restoration. Terraform also releases its temporary power control and
   requires a final no-change plan. Use
   `aws_ce_power` for whole-site single-node maintenance: `prepare-stop` retains the complete
   owned service and hardware plan; `prepare-start` requires the exact stopped plan and maintenance
   receipt. `apply` requires the exact saved power plan ID and digest; `status` only reads evidence.
   Unknown publisher freshness, blocked traffic, or identity evidence keeps execution pending.
   Multi-node power and Terraform direct-route maintenance remain unqualified. Use
   `aws_ce_teardown` for the owning engine: native teardown consumes a separately reviewed fresh
   `aws_ce_plan` teardown plan bound to the original deployment, while Terraform derives its saved
   destroy plan internally. A Terraform workflow interrupted before admission can prepare a distinct
   foundation teardown only when its original authorization and journal match, and two complete
   platform reads prove sites, registrations, tokens, and owned service resources absent. Apply
   rechecks absence before and after cloud retirement. Started admission uses the separate pending-admission contract below when physical
   registration is absent; registered and partial registration retain their own retirement requirements. Both retain authorization and resume from durable evidence; version
   completion and cloud deletion do not establish routing, traffic, or independent absence.
6. Use `f5xc_ce_v2_status` at registration, health, BGP, NLB/TGW routing, and traffic gates. Resume
   only the same AWS plan ID/hash; rediscover and replan for source, AMI, quota, agreement, route,
   target, attachment, peer, tag, or capability drift.
7. Finish with `aws_ce_status`, passive `aws_ce_diagnose`, and platform evidence. Keep active
   diagnostics and teardown within the user's authorized scope, preserving authorization on resume.

TGW Connect is disabled unless both the current F5 guide and `f5xc_ce_v2_capabilities` prove the
supported SMSv2 GRE/BGP schema. Missing evidence is a release blocker, never permission to use a
legacy site type.

For headless execution use only `XCSH_CE_HEADLESS_MUTATIONS=1` and
`XCSH_CE_ALLOW_DESTROY=1` for their respective operations. AWS Marketplace initial legal
acceptance is console-only and always requires rediscovery and replanning.

### Interrupted Terraform admission retirement

`aws_ce_teardown` selects a separate pending-admission contract when the owning
Terraform workflow is pre-registration and its admission journal has no admitted
sites. This path is restricted to a single non-HA site. It requires two complete,
stable reads proving no physical site, registration, routing or ingress resources,
with exact owned logical-site and deterministic node-bound token identities.

Prepare persists an immutable plan bound to the original authorization, admission
journal and any site checkpoint. Apply revokes tokens with exact UID checks,
retires cloud resources through the existing Terraform ownership guard and saved
destroy plan, then deletes the exact logical UID through Terraform-owned F5 state
execution. Already-removed planned identities can be resumed. New or substituted
identities, advanced admission or unavailable evidence block further mutation.
A durably submitted F5 create/update can be reconciled during preparation only
through the observation-only provider operation: exact original request, owner,
saved plan, provider state and API readback must agree, with no apply replay.
An unsubmitted original site create/update can instead be cancelled through the
owning provider service. Cancellation proves the complete prior provider state and
API identity/spec, independently checks the runner's unsubmitted journal, restores
only the prior desired configuration without apply, and requires a bound no-change
refresh plus unchanged readbacks before clearing the pending request. Interrupted
refresh retains the pending request and exact cancellation provenance for resume.
Missing, malformed or unproven evidence remains blocked. During retirement, only the
selected pending F5 delete uses the ordinary reconciliation path. Physical or partial
registration requires its own retirement contract. Source or synthetic receipts do not qualify live interruption/recovery,
sensitive staging retirement, or full CE acceptance.

A native teardown plan with no cloud actions still requires a current account-bound
EC2 tag inventory and complete regional Resource Groups Tagging API inventory.
Require `sts get-caller-identity` for the expected account, plus the
`ec2:DescribeTags` and `tag:GetResources` read permissions for the inventory. Pending, foreign, partial,
malformed, or unavailable owner evidence blocks platform and credential retirement.
Do not treat an empty plan or missing resource IDs as proof that cloud resources
are absent. Native teardown retains its separate supporting-infrastructure
qualification boundary.

Single-node native preparation can use the platform pre-registration inventory
when a generated physical site has no registered nodes. This requires exact owned
logical and physical UIDs, the expected generated-site state, stable node-bound
token identities, and absence of registrations, routing and ingress resources.
Missing identifiers or advanced registration do not authorize this path.

### Native reservation retirement

Before cloud resources are created, an owned single-node logical reservation can
exist before its generated physical site or bootstrap token. `aws_ce_teardown`
uses a separate native reservation plan for these states. The plan binds the
original logical UID, exact source/cloud plan hashes, complete stable owner-bound
pre-registration inventory, and a physical UID or explicit authoritative absence.
An omitted physical state is not absence. Complete empty token inventory is valid
only for this reservation contract; registered token coverage is unchanged.

Apply requires authenticated complete cloud owner absence before any vendor
mutation. It rereads the no-registration/no-routing/no-ingress inventory and exact
remaining identities before and after each planned token or logical-site deletion.
A lost response resumes the same immutable plan using authoritative readback;
credentials remain staged until all remote identities and cloud owner inventory
are absent. Changed identities, new tokens, post-admission activity, stale query
collections, or incomplete/unauthorized/unavailable evidence block further mutation.
The collection timestamps bound API query age; they are not original CE heartbeat
timestamps. Supporting infrastructure and full live interruption remain separately
qualified. This contract does not replace the registered or Terraform lifecycle.

### Native foundation retirement before site reservation

The native workflow creates network foundations before reserving its logical site.
`aws_ce_teardown` uses a separate foundation plan when two complete stable current
reads prove that the expected logical/physical sites, registrations, bootstrap
tokens, routing and ingress are absent from current inventory. It binds the
original native source and exact reviewed cloud teardown plans, their ownership
inventory and rollback-backed restoration. It records absence without inventing a
site or token UID. An owned instance requires the separately qualified node/site
lifecycle contract; foundation retirement does not authorize that transition.

Native application and retirement share a process-bound operation lock. Only the
coordinator's exact approved cloud teardown may execute inside its active lock;
competing operations reject, and a released lock cannot be reused by a deferred
operation. The existing bootstrap exclusion remains. Application cannot resume a
retiring or retired deployment. Cloud deletion/recovery uses the existing ownership
and single-non-HA guards; current platform absence is rechecked before and after
cloud retirement. Missing, stale, unauthorized or newly published evidence remains
unqualified. Private credential retirement now records a version2 journal and
verifies empty launch-directory identity before removing interrupted empty staging.
This unreleased project does not migrate older private journals. Source and
controlled installed receipts still do not establish full live UAT acceptance.

### Native deletion response loss and revalidation

Before dispatch, native deletion records the exact action/resource/resolved request
hash and an owner-verified resource observation. A nonzero CLI result does not clear
that intent merely because a response was returned. Complete current readback must
prove deletion or its exact association/detachment effect; unavailable evidence
retains the intent and blocks replay. A proven client/service rejection can clear
intent only when complete owned readback verifies unchanged configuration.

Resume validates the original request and observation digests. Initial revalidation
compares the recorded target before its exact authorized transition while preserving
checks on every other resource and all regional, account, agreement, image, quota,
bootstrap and capability evidence. A changed target, foreign owner, malformed
snapshot, missing/duplicate observation or unrelated route/attachment change
rejects rather than granting broader deletion authority. The original failed
installed UAT256 recovery remains preserved until the changed candidate passes
actual public installed execution and independent cleanup verification.
