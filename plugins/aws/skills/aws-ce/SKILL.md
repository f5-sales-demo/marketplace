---
name: aws-ce
description: >-
  Discover, plan, deploy, reconcile, operate, diagnose, repair, and tear down F5
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

## Workflow

1. Use `web_search` to read the dedicated `f5xc-ce-automation/v1` document, the current official
   F5 AWS SMSv2 guide, and relevant current AWS Marketplace, EC2, AMI policy, quota, NLB, and TGW
   documentation. Cite the sources used.
2. Call `aws_sts_whoami`, `f5xc_ce_v2_capabilities`, then `aws_compute_discover`. Require live
   identity, schema v1 discovery, the validated shared-contract receipt, current source digests,
   every region in stable rank order, the exact regional SSM parameter version and AMI, agreement,
   instance/ENI/AZ/quota/policy evidence, and a discovery artifact.
3. Translate the request into `AwsCeIntent` schema v1 and call `aws_ce_plan`. Show the plan ID/hash,
   exact AMI, topology/ENI order, egress/routing/security changes, restoration state, billable
   resources, warnings, and ordered argv actions before approval.
4. Plan the platform site with `f5xc_ce_v2_site`; after approval submit its exact hash. Checkout one
   opaque bootstrap reference per node immediately before `aws_ce_apply` needs it.
5. Use `f5xc_ce_v2_status` at registration, health, BGP, NLB/TGW routing, and traffic gates. Resume
   only the same AWS plan ID/hash; rediscover and replan for source, AMI, quota, agreement, route,
   target, attachment, peer, tag, or capability drift.
6. Finish with `aws_ce_status`, passive `aws_ce_diagnose`, and platform evidence. Obtain separate
   approval for active diagnostics and teardown.

TGW Connect is disabled unless both the current F5 guide and `f5xc_ce_v2_capabilities` prove the
supported SMSv2 GRE/BGP schema. Missing evidence is a release blocker, never permission to use a
legacy site type.

## Terraform lost-state lifecycle

For the MCN Terraform showcase, require `terraform-provider-xcsh` `v9.2.6` and its immutable API
contract. A failed delete retains Terraform state: do not conceal it by changing names, using direct
cloud or F5 deletion, editing state, tainting, or invoking `terraform import` interactively.

Recover a verified, project-owned lost generation only with the dedicated recovery root: inspect the
exact ownership manifest, review an import-only saved plan backed by configuration-driven Terraform
import blocks, apply it, then review and apply the ownership-verified destroy plan. The recovery
state must end empty. Every created AWS and XC identity requires an immutable
`deployment_generation`; reject absent, invalid, or already-live generations before any mutation.

For headless execution use only `XCSH_CE_HEADLESS_MUTATIONS=1` and
`XCSH_CE_ALLOW_DESTROY=1` for their respective operations. AWS Marketplace initial legal
acceptance is console-only and always requires rediscovery and replanning.
