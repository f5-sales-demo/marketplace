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
Use supported marketplace installation and ordinary `bun dev` on the verified
Ubuntu workstation, with the configured model and existing authenticated contexts.
The managed MacBook cannot sign software. Preserve the requested engine throughout.
Install Platform as GCloud's dependency; explicit Terraform also requires its
installation and setup. Report concrete unavailable capabilities before execution.

The user removed the numerical campaign cap. Attribute prior diagnostic campaigns
to their original receipts in the acceptance matrix; q28 closed without submission,
and q30 and q31 finished independently verified cleanup after their distinct
guest-access failures. Continue sequentially
through the acceptance matrix. Historical launchers, plans, keys and
authorization remain immutable and cannot be replayed.

Use the [q30 evidence and preserved capture boundary](gcp-q30-disposable-diagnostic-20261026.md)
alongside the [qualified process-completion successor](gcp-process-completion-offline-20261025.md).
Prepare a fresh owning-engine plan for the explicit scope. Bind current source,
installed bytes, executables, configuration and credentials independently. Preserve
historical plans, receipts and executor locks; do not repin a historical source
guard or transfer its authorization. Verify fresh prerequisites, exact initial
absences, corporate funding, BYOL authorization and original resource identities.
Return a concrete plan, full inventory, supported mappings and unresolved gates.
Apply requires that plan's exact durable reviewed authorization.

Use the [qualified v15 host trust successor](gcp-keygen-host-trust-offline-20261026.md)
for documented cloud-init 24.4/OpenSSH generation evidence. Its 137 offline
parser/consumer tests do not qualify current guest access. Bind its exact bytes
and fresh campaign scope before another guest campaign. Preserve frozen v14 and
q30's stopped reader, failed capture and unresolved locks. Retain exact original
serial provenance and reject changed, missing, ambiguous, truncated or stale
host evidence. Current guest transport requires a new signal-free successor;
do not invoke the frozen adapter's signal-producing cleanup. Preserve q30's
historical backend in place. Use the current verified Ubuntu worktree and private
evidence root for new execution. Do not use sudo, software signing, MDM changes
or process signals.

For the first Terraform HA diagnostic profile, account for all 21 resources:
18 CE resources plus observer VM, disk and narrowly scoped SSH firewall. Preserve
independent cleanup between campaigns. Pin the
observer image and numeric ID from the linked context, without a service account.
Use campaign-only SSH keys through Site admin credentials and token-only CE
metadata. Verify original-VM serial host fingerprints before SSH and discover
supported commands through help/completion. Both original guest capture holds
remain active; do not enable a consumer or submit infrastructure by bypassing them.

Verify F5's SSD, sequential IOPS and etcd latency recommendations against the
proposed placement. Keep SLO identity immutable and all node NIC layouts consistent.
The supported `pd-balanced` profile consumes `SSD_TOTAL_GB`; account for every
owned disk and reject missing, duplicate or insufficient SSD quota without
falling back to standard-disk quota. Bind provider-added attribution labels to
the pinned provider contract and original `terraform_labels`/`effective_labels`;
retain every required ownership label and subsequent-change check.
Keep egress explicit, separate ILB ingress from next-hop routing, and bind NCC/BGP
and load-balancer behavior to verified CE interfaces. Require independent effective
routes, peer/session state, return-path symmetry and content-verified traffic.

For an internal NIC network or subnet update, review the original numeric VM and
NIC identity, private IP allocation and owned restoration inventory. Google may
allocate a different private IP when the previous address is unavailable in the
new subnet. Its network-update command does not qualify CE role or VRF remapping;
report the missing guest mapping before planning that change.

Retain bounded bootstrap/VPM journals and original-node container evidence, durable
partial captures and a separate 300-second final-capture window.
Use one 60-second session-construction operation for ownership, trust, route
verification and startup. Keep the SSH child's prompt startup within 15 seconds
and the parent deadline; do not reset either clock or skip an ownership check.
On deadline or durable-receipt failure, retain partial capture and retire further
commands. Use supported logout or verified SSH protocol closure and wait for
natural completion within the admitted deadline or its final-capture reserve.
Do not send signals, including signal-zero probes, or close a live PTY master
as a shortcut. Require captured original kernel and SDK identities, independently
verify every original reader and process group absent, and reject reused
identities or unavailable identity evidence. Unresolved readers, failed-capture
flags and claims remain preserved; they cannot authorize replay or late acceptance.
Keep five-minute freshness, forty-five-second observation spacing and the original
operation and final-reserve clocks without resetting them.
Measure failover and repair
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
