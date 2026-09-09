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

Use only Secure Mesh Site v2. Read the [AWS provider contract](references/contracts.md) before
discovery or planning. `aws_compute_discover` fetches and validates the provider-neutral contract;
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
   exact XC listener/domain/origin-pool intent, three independent sites, current NLB quota, and
   platform capability evidence for that composition,
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
   `aws_ce_teardown` for the owning engine: native teardown consumes a separately reviewed fresh
   `aws_ce_plan` teardown plan bound to the original deployment, while Terraform derives its saved
   destroy plan internally. Both retain authorization and resume from durable evidence; version
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
