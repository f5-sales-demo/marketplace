# GCP private HA candidate deployment and cleanup evidence

A fresh three-node Montréal candidate created all eighteen cloud/XC objects
from one reviewed saved Terraform binary on source `fcfff231aea1bdda2bae1b22e13117b935ed40e4` after
exact-head CI. The Platform and Terraform services executed from frozen bundles;
GCloud translation and the private campaign adapter used that source. Public HA
admission remained gated throughout this campaign.

| Frozen bundle | SHA-256 |
| --- | --- |
| Platform | `c1579d7e2e5522945680f4de2dcbdb6e082e4d17d4f2bf112c6ce7288df7ae5b` |
| Terraform | `b40b75332a16d5bf91216bb0a31ba1401ca7738fdeb6952ecb86654ab564fe3b` |
| Gcloud | `58994533111a9b861d750058210721005a4ab620667ff1cdb391724e0bdea753` |

The original runner receipt completed application. Ownership capture exposed
that Google 8.7.0 omits numeric firewall IDs from state. Repair source
`e76b755e3ca4ef4a33a798c8a8dedf555135279c`, with green exact-head CI, verified
completed insert-operation target IDs against provider-retained creation
timestamps and live numeric IDs. Recovery used the original frozen runner and
preserved binary, receipt and state. It captured all eighteen original identities
and produced an exact no-change plan without replaying deployment.

Two consecutive observations matched all three VM identities, ONLINE
registrations and both physical NIC joins on every node. All returned component
status rows were `Ready` (nineteen, twenty and nineteen rows by node). Exhaustive
component inventory and health semantics remain unqualified; these observations
do not establish full HA health, routing, traffic or failover acceptance.

A separate saved cleanup review contained exactly eighteen deletes bound to the
original identities and stable owning state. Cleanup passed an empty final
destroy plan, stable final state and independent absence checks for fourteen
cloud objects and four XC objects. Repeated cleanup resume confirmed all eighteen
absences without another submission. The cloud inventory included three VMs,
three explicitly managed disks, two networks, two subnets and four firewall rules.

| Receipt binding | Value |
| --- | --- |
| Original review | `sha256:ae3378f6b6993616dae6a41c408963beb74e21b78cde6a8801e29d91106dde21` |
| Original binary plan | `679a1cecc5e1c41c19f2d917dae3a64133c5e271796f53682a561e501b46f99b` |
| No-change plan | `01f1e5961f2b15080ad4e071af318544a56c78f7e8a51d8c2d814a76780fb685` |
| Delete-only cleanup review | `sha256:555d982264f7a632a2ad45bb8bd4910ea99c66ae38f8302df937256af1c64d12` |
| Final empty destroy | `5176b3b9e536e676500de1945679c263a12cc6bfaa20f3fd8ad8ab8a52972245` |
| Private sanitized receipt SHA-256 | `0bd9cf449639c7e0f27c78f77e42dba187dac97267ffb40ac076cc27bf533872` |

Source checks passed 224 GCloud CE tests, 235 Platform/Terraform tests, focused
source typechecking, runtime build, tracker validation, pre-commit and PII checks.
The initial harness NIC observation used short names; its corrected observations
use exact self-links. Temporary read failures remained reconciliation and caused
no replay. Raw observations, credential material, plans and state stay outside Git.

This private candidate qualifies the recorded deployment, ownership reconciliation
and complete cleanup path only. Interrupted/partial HA campaigns, exhaustive
health semantics, immutable owning API admission and fresh public installed
acceptance remain required. PR #1566 and upstream PR #1952 remain draft. Prior
native and single-node acceptance retain their original source attribution.
