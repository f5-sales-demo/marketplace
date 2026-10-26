# GCP q24 disposable diagnostic

Issue [1559](https://github.com/f5-sales-demo/marketplace/issues/1559) remains
incomplete. The first of three authorized fresh sequential campaigns provisioned
its complete 21-resource inventory and was independently cleaned up. Guest
capture failed before SSH; this campaign does not qualify guest commands,
operational health, routing, traffic or installed lifecycle execution.

## Provisioning and failure

The reviewed Terraform scope contained three two-interface CE nodes, their
owned networking and bootstrap resources, plus an observer VM, disk and narrow
SSH firewall. The observer had no service account and used the frozen image
`ubuntu-2404-noble-amd64-v20261021`, numeric ID `4996011480491275419`.
Campaign keys were confined to the documented Site admin credential path and
observer access. CE metadata retained token-only bootstrap.

An initial launcher refused before capture or infrastructure submission because
the remote clock was about 150 ms ahead of the local clock. A separate tested
successor conservatively measures probe freshness from the local transport
start and retains the remote timestamp separately. Identity checks, two nonce
egress probes, the saved `/32` firewall and five-minute freshness remained
required. This rejected launcher consumed no cloud campaign allowance.

The revised launcher verified current funding, BYOL authorization, launch
prerequisites, full quota, original saved-plan hashes and independent initial
absences. Durable cloud/serial capture started before the single create apply.
The apply completed and all four VMs were bound to original insert identities.

Guest establishment then rejected the observer's labels. Its original numeric
identity, name, zone and required ownership labels matched, but the provider
added `goog-terraform-provisioned`. The pinned [Google provider reference](https://github.com/hashicorp/terraform-provider-google/blob/v8.7.0/website/docs/guides/provider_reference.html.markdown)
documents this default attribution label and its `terraform_labels` and
`effective_labels` fields. Retained private-state reconstruction reproduced
the refusal; token and bootstrap metadata joins passed. No SSH child started.
Any consumer correction must verify the documented provider label and preserve
all required ownership, exact identity and subsequent-change checks.

## Cleanup and recovery

The reserved final-capture window completed. The capture worker and child
processes resolved before an independent delete-only plan review. The single
destroy apply completed and independent reads found all 21 resources absent.

The final empty-plan check exposed a shared runner assumption: Terraform 1.16.6
returns only `format_version` from `show -json` for empty state. Its private raw
state still contains the pinned version, lineage, serial, zero resources and
zero outputs. A separate source worktree repaired that narrowly verified case;
wrong versions, hidden resources/outputs and ambiguous summaries still refuse.

A separately reviewed recovery adapter used the corrected state reader and
original shared planner. It denied infrastructure submission and configuration
changes, produced an empty destroy plan and confirmed stable empty state,
21 independent absences and two read-only resumes with zero submissions.
Original failures, receipts, source bytes and executor evidence remain private.

## Remaining gates

Both GCP guest mapping holds remain active. A later campaign needs a concrete
reviewed collector change, fresh scope and evidence, and independent cleanup.
Two of the first-stage campaign allowances remain. Full lifecycle/network/traffic
acceptance, required review, merge, publication and published installation remain
open. PR #1698 stays draft; q12 and immutable v12.3.1 remain preserved.
