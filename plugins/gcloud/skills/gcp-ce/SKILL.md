---
name: gcp-ce
description: >-
  Plan and inspect F5 Distributed Cloud Customer Edge on GCP. Use for GCP CE
  deployment, HA, networking, native or Terraform lifecycle, diagnostics,
  upgrades, replacement, repair, failover, recovery, or teardown.
---

**Canonical skill URI**: `skill://gcloud:gcp-ce`

Use typed GCP CE tools. Native is the conversational default; explicit Terraform
selection persists for the entire deployment. Require an explicit project and F5
context. Never switch the ambient gcloud project to execute a deployment.

Read [provider contract](references/provider-contract.md) before planning and
[acceptance](references/acceptance.md) before reporting qualification.

1. Use `gcp_project_identity` to verify the explicit target.
2. Use `gcp_compute_discover` with the explicit region. Pin the exact F5 image ID,
   selfLink and licenses. Unknown IAM, organization policy, capacity, NIC limits,
   quotas or legal acceptance cannot become a passing prerequisite.
3. Use `gcp_ce_plan` with a schema-v1 intent. Name each independent site and each
   node; one node and three HA nodes are distinct topologies. NIC zero is SLO;
   each NIC requires a distinct VPC and non-overlapping subnet. HA uses identical
   NIC order and VRFs. Minimum sizing is 8 vCPUs, 32 GiB RAM and 80 GiB disk.
4. The current plan is non-executable. Report its unavailable gates. Do not use
   `gcloud_exec`, CLI commands, Terraform or generic Platform tools to bypass it.
   Apply, upgrade, failover and teardown tools report unavailable before mutation.
5. Inventory and status without a context read cloud provisioning only. For an
   existing owned deployment, status/diagnose with explicit region and its persisted
   `platformContext` use the shared Platform service and exact ledger topology to
   observe registration, physical interface identity and global health. Candidate
   labels do not prove ledger ownership. Routing, application traffic, HA health
   and independent absence remain separate unqualified gates.

When executable support is qualified, concrete billable, intrusive diagnostic
and teardown plans must be reviewed before required approvals. Immutable SLO
identity changes require replacement. Keep ingress separate from routing and
prove return-path symmetry. Bootstrap belongs only in restricted deployment
storage with deployment/site/node binding and one-use checkout. Marketplace
legal acceptance is human-only.
