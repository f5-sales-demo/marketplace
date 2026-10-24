# GCP installed HA readiness evidence

The read-only three-node/two-interface readiness check passed on marketplace
source `1515305d87912d7480d33381f0a54bbf5b16526c` after exact-head CI. The installed GCloud
1.7.10, Platform 6.3.2 and Terraform 2.4.2 bundles were frozen before execution.

| Frozen bundle | SHA-256 |
| --- | --- |
| Platform | `c1579d7e2e5522945680f4de2dcbdb6e082e4d17d4f2bf112c6ce7288df7ae5b` |
| Terraform | `b40b75332a16d5bf91216bb0a31ba1401ca7738fdeb6952ecb86654ab564fe3b` |
| GCloud | `e47f6f52be15870860d4f4808d64d69a5f954b7859f4d08f6c290111188c3a7d` |

The installed `gcp_ce_plan` readiness operation observed machines and zones in
all three Montréal zones. Scoped IAM, aggregate CPU/disk/external-address/VPC
quota, organization policy, exact image/license, machine NIC limit and zone
checks were verified. Capacity remains unreserved; legal acceptance is unknown
in this readiness result. No deployment approval was requested, the plan stayed
non-executable and its action list was empty.

Independent checks confirmed absence of all fourteen configured names before
and after the read-only run: three VMs, three disks, two networks, two subnets,
one site and three node-bound tokens. No cloud object was created. The private
sanitized receipt SHA-256 is `4149d2b5efd62a9ae642ac8f411d454c649879eaacdfb1f947a52ffba61cc12e`; the readiness
plan hash is `sha256:47b256b79634bd015f96cb555ec4aaaa78f945e15ac7201494513a1ab7fdd078`. Raw prerequisite responses and
restricted storage remain outside Git.

Source validation passed 458 GCloud/Platform/Terraform/runtime/tracker tests,
source typechecking, plugin validation and staged lint, secrets and PII checks.
Tests cover every candidate HA identity, later-node orphan disks, cross-node
disk attachments, wrong zones, replacement tokens and site identity drift.
The existing single-node saved-session layout and eight-object order are retained.

HA deployment and cleanup are not qualified by this read-only evidence. Public
admission remains single-node pending
[API contract qualification #1951](https://github.com/f5-sales-demo/api-specs-enriched/issues/1951)
and fresh installed/live HA campaigns. The current site-global health endpoint
returns one hostname and declares no node selector; a healthy response cannot
establish health for all three nodes. PR #1566 stays draft. Prior single-node
acceptance retains its original executable source and frozen bundle attribution.
