---
name: gcp-ce
description: >-
  Plan and inspect F5 Distributed Cloud Customer Edge on GCP. Use for GCP CE
  deployment, HA, networking, native or Terraform lifecycle, diagnostics,
  upgrades, replacement, repair, failover, recovery, or teardown.
---

**Canonical skill URI**: `skill://gcloud:gcp-ce`

Use typed GCP CE tools. Native is the conversational default; explicit Terraform
selection persists for the entire deployment. Platform installs as a required plugin dependency.
Terraform is optional: explicit Terraform requests require `xcsh plugin install terraform`
and `xcsh plugin setup terraform`; missing setup never selects native instead. Require an explicit project and F5
context. Never switch the ambient gcloud project to execute a deployment.

Read [provider contract](references/provider-contract.md) before planning and
[acceptance](references/acceptance.md) before reporting qualification.

1. Use `gcp_project_identity` to verify the explicit target.
2. Use `gcp_compute_discover` with the explicit region. Pin the exact F5 image ID,
   selfLink and licenses. Unknown IAM, organization policy, capacity, NIC limits,
   quotas or legal acceptance cannot become a passing prerequisite.
   Use `gcp_marketplace_agreement` with the pinned schema-v1 intent. For the
   qualified BYOL image, it reviews the exact Google Marketplace and F5 Platform
   documents, image/license identities, F5 context and confirmed corporate funding.
   Supply the saved `approvedPlanHash` to authorize access or use programmatically.
   This records authorization in restricted storage; it acquires no software license,
   places no order and makes no remote procurement consent grant. Document changes
   require requalification. Read [BYOL contract](references/byol-vm-contract.json).
   For products with qualified procurement agreement references, the tool uses
   server validation and independently checks active consent. Do not require that
   procurement path universally for BYOL; report unavailable mappings explicitly.
   Set `enableMarketplaceApi=true` only when API enablement is requested.
   If Google returns `UREQ_TOS_NOT_ACCEPTED`, use the returned
   [Google Cloud terms acceptance link](https://console.developers.google.com/terms/cloud).
   No supported API for this prerequisite acceptance has been qualified. Verify
   scoped recovery after acceptance; these terms are separate from product terms.
   Missing `alpha` or `beta` CLI groups install automatically without prompts;
   component-manager failures remain explicit.
   Before billable execution, require an owner-only corporate funding policy at
   `~/.config/xcsh/gcp-ce-funding.json` (or `XCSH_GCP_FUNDING_POLICY_FILE`). Bind the
   explicit project, corporate account/organization domains and existing billing
   account confirmed by the user as IT-funded. Both engines recheck this association
   against the reviewed plan. Never create payment methods or switch billing to
   satisfy a failed check. Owned deletion remains available without funding access.
3. Use `gcp_ce_plan` with a schema-v1 intent. Name each independent site and each
   node; one node and three HA nodes are distinct topologies. NIC zero is SLO;
   each NIC requires a distinct VPC and non-overlapping subnet. HA uses identical
   NIC order and VRFs. Readiness checks each requested zone and total node quota,
   counting shared HA VPCs once; executable HA remains unqualified. Minimum sizing is 8 vCPUs, 32 GiB RAM and 80 GiB disk.
4. Without an explicit operation, the plan is non-executable readiness. Use
   `operation=deploy` for the native single-node BYOL candidate: two interfaces,
   `n2-standard-8`, external-IP egress, no ingress and no destination routes.
   It collects prerequisites itself and persists intent, image/license, translation,
   immutable API, current policy, corporate funding and BYOL authorization under
   the overall `planHash`. Review it before supplying that exact `approvedPlanHash`
   and unchanged intent to `gcp_ce_apply` with `operation=deploy`. Resume with the
   same hash; cloud creation does not establish registration, health or traffic.
   Fresh isolated installed native review/apply, healthy status and typed teardown
   passed on this narrow disposable profile. Publication remains pending. Explicit
   Terraform deployment has a candidate using XC v15.13.0 and a packaged verified
   lock. Fresh installed single-node deployment, interrupted recovery and partial
   disk cleanup passed; the acceptance receipt binds actual source and bundles.
   Use the same exact review hash for recovery; consumed applies are inspected
   without replay. Verified partial ownership requires a separate delete-only
   cleanup review. HA, upgrade and failover remain unavailable. Do not bypass an
   unavailable gate with generic CLI, Terraform or Platform tools.
   For the two-interface external-IP Terraform HA candidate, optional
   `initialAccess={schemaVersion:1,profile:"site-ssh-sli",publicKey:"ssh-ed25519 ..."}`
   binds one canonical Ed25519 public key without options or comments to the Site's
   admin credentials. It permits Site CLI SSH as `admin` on SLI, blocks SSH on SLO,
   and blocks local DNS and web UI on both VRFs. Use a campaign-only key. Omitted
   access retains the historical all-services-blocked configuration; native and
   single-node access requests refuse before cloud calls. This provider-validated
   configuration does not establish authenticated guest access or HA acceptance.
   Do not place this key in CE VM metadata or create guest shell accounts.
5. Inventory and status without a context read cloud provisioning only. For an
   existing owned deployment, status/diagnose with explicit region and its persisted
   `platformContext` use the shared Platform service and exact ledger topology to
   observe registration, physical interface identity and global health. Sanitized node status includes the exact owned instance ID used for the cloud
   and registration joins. Candidate labels do not prove ledger ownership. Routing, application traffic, HA health
   and independent absence remain separate unqualified gates.
6. For teardown of an existing disposable single-node deployment, supply
   its explicit project, region, deployment name and persisted F5 context to
   `gcp_ce_teardown`, or use `gcp_ce_plan` with `operation=teardown`. Review the
   saved plan, then supply its exact `approvedPlanHash` to `gcp_ce_apply` with
   `operation=teardown`. The supported profile has two interfaces, external IP
   egress, no ingress and no destination routes. Six exact cloud ledger identities
   and the owned site/token binding are required for complete deployments. Native
   interrupted creation can review completed journal resources; ambiguous
   submissions require reconciliation before cleanup. Authorization survives
   interruption; changed identities and reappeared objects fail closed. Explicit
   Terraform selection uses the candidate saved-plan teardown path. It requires
   stored session inputs and original Platform identity recorded after the exact
   creation plan completed. Missing ledgers cannot be replaced with labels or
   caller assertions. Partial interrupted application remains pending until
   independently reconciled. Final Terraform evidence requires an empty current
   destroy plan and fresh absence checks. Installed live cloud teardown passed for
   both engines on this narrow disposable profile; other topologies remain
   unqualified.

When executable support is qualified, concrete billable, intrusive diagnostic
and teardown plans must be reviewed before required approvals. Immutable SLO
identity changes require replacement. Keep ingress separate from routing and
prove return-path symmetry. Bootstrap belongs only in restricted deployment
storage with deployment/site/node binding and one-use checkout. Marketplace
acceptance requires the qualified product-specific mechanism: exact document
authorization for BYOL access/use, or independently observed procurement consent. Do not invent consent, agreement mappings or unsupported APIs.
