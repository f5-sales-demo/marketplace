# Reviewed GCP deployment context prompt

Use this prompt with the [qualification context](gcp-deployment-context-20261025.md)
and [acceptance matrix](gcp-issue-1559-acceptance.md). Fill the scope inputs before
planning. This document is context, not saved-plan authorization.

## Scope inputs

- Explicit GCP project, region and owning F5 context.
- Owning engine: native by default, or explicitly Terraform.
- Deployment/site/node names, topology and each node's zone.
- Distinct SLO/SLI VPCs, non-overlapping subnet CIDRs and NIC order.
- Pinned CE image numeric ID, selfLink, licenses and requested versions.
- Explicit egress, ingress and routing profiles and owned destination prefixes.
- Campaign-only Site admin public-key reference when the profile supports it.
- Reviewed diagnostic scope and resource inventory.

## Prompt

Complete issue 1559 qualification using the linked context and acceptance matrix.
Use supported marketplace installation and ordinary `bun dev`, with the configured
model and existing authenticated contexts. Preserve the requested engine throughout.
Install Platform as GCloud's dependency; explicit Terraform also requires its
installation and setup. Report concrete unavailable capabilities before execution.

Prepare a fresh owning-engine plan for the explicit scope. Bind current source,
installed bytes, executables, configuration and credentials independently. Preserve
historical plans, receipts and executor locks; do not repin a historical source
guard or transfer its authorization. Verify fresh prerequisites, exact initial
absences, corporate funding, BYOL authorization and original resource identities.
Return a concrete plan, full inventory, supported mappings and unresolved gates.
Apply requires that plan's exact durable reviewed authorization.

For the first Terraform HA diagnostic profile, account for all 21 resources:
18 CE resources plus observer VM, disk and narrowly scoped SSH firewall. Preserve
the three-campaign limit and independent cleanup between campaigns. Pin the
observer image and numeric ID from the linked context, without a service account.
Use campaign-only SSH keys through Site admin credentials and token-only CE
metadata. Verify original-VM serial host fingerprints before SSH and discover
supported commands through help/completion. Both original guest capture holds
remain active; do not enable a consumer or submit infrastructure by bypassing them.

Verify F5's SSD, sequential IOPS and etcd latency recommendations against the
proposed placement. Keep SLO identity immutable and all node NIC layouts consistent.
Keep egress explicit, separate ILB ingress from next-hop routing, and bind NCC/BGP
and load-balancer behavior to verified CE interfaces. Require independent effective
routes, peer/session state, return-path symmetry and content-verified traffic.

Retain bounded bootstrap/VPM journals and original-node container evidence, durable
partial captures and a separate final-capture window. Measure failover and repair
from the required disruption or restoration-command start; action completion
cannot reset the 120-second clock. Record route recovery, application recovery,
outage duration and loss separately. Do not infer guest, health or traffic evidence
from provisioning, registration or a successful model turn.

Finish with reviewed typed teardown, independent absences, restoration proof,
empty destroy or final native reconciliation, stable state and two non-submitting
resumes. Preserve private raw evidence and publish only sanitized receipts. Keep
the PR draft and issue incomplete until applicable source, installed, live, cleanup,
CI, review, publication and published user-installation gates pass. Preserve q12
and immutable v12.3.1 assets.
