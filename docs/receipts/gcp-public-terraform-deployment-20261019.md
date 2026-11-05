# GCP public Terraform installed acceptance

The qualified disposable single-node BYOL profile passed installed campaigns in
Montréal using marketplace source `a92f2c9778a3ff57811e29707196a8412b5cfc65`.
Exact-head CI passed before freezing the executable bundles. Terraform 1.16.6,
Google 8.7.0 and immutable XC 15.13.0 used the packaged verified provider lock.

| Frozen bundle | SHA-256 |
| --- | --- |
| Platform | `41da08c1f49749d025109ba4e4ba044727611b2841d8240570eecdb47a9e6ab0` |
| Terraform | `b40b75332a16d5bf91216bb0a31ba1401ca7738fdeb6952ecb86654ab564fe3b` |
| GCloud | `b1867e906f9adec1c9be418dffdb44af8373096a256640da3a0ef864cfdaa2be` |

The successful campaign applied the exact reviewed binary once, verified all eight
original cloud/XC identities, and completed a no-change plan. Repeated resume did
not replay creation. Registration was ONLINE, both physical NIC joins were observed,
and two consecutive matching-node observations were healthy, 45 seconds apart.
Typed teardown and its repeated resume completed with an empty destroy plan and
independent HTTP 404 checks for the VM, boot disk, two networks, two subnets, site
and token. The private campaign receipt SHA-256 is
`200b79cf56504625da0ae03e42fc58af5b9c67e391b418a4825a820d0441c8f8`.

The interrupted-success campaign stopped the caller after the real Terraform child
completed. Recovery refused the still-live original wrapper without mutation. After
that executor stopped, recovery verified original identities and reconciled completion
with a no-change plan. Exactly one creation submission remained recorded. Typed
teardown, empty final destroy and independent eight-object absence also passed.
Its private campaign receipt SHA-256 is `66777aced4136d9616731736fe492737e35d9751ad9138bf0303fd94888e6968`.

The partial campaign held XC CONNECT before TLS and forwarded zero requests to XC.
It interrupted creation after owning state contained the boot disk, two networks and
two subnets, with no VM. Recovery captured that verified subset and a separate
review authorized only deletion. Typed cleanup and repeated resume passed, followed
by an empty destroy plan and independent absence checks for all eight possible
objects. Its private campaign receipt SHA-256 is
`a0d69b812c3e79ddbb7c5333cbc6a24333ad5a5d4d344d14d014faaa1bd788f1`.

An earlier campaign exposed numeric 64-bit subnet IDs rounded during JavaScript
JSON parsing. A failing-first regression and parser repair preserve original integer
bytes. The original attempt recovered without replay and was cleaned; its preserved
original and repair bundles are separate evidence. Failed harness and disk-capacity
runs are excluded from acceptance. Credentials, bootstrap, raw logs, binary plans
and state remain restricted outside Git.

These results qualify only this single-node deployment, original-attempt recovery
and typed cleanup milestone. Prior native acceptance retains its original executable
source attribution. HA, routing/application traffic, upgrades, repair, replacement,
failover, 120-second recovery and immutable plugin publication remain later gates.
PR #1566 remains draft.
