# GCP operational health candidate

The version 2 candidate evaluates operational health for the original three
nodes. Production handlers remain on the existing behavior until discovery and
live qualification establish a pinned contract and parser mappings.

The candidate requires stable context and ownership fingerprints, distinct
configuration and runtime identities, three numeric VM identities, original
registration and token identities, both NIC joins and frozen roles. Required
reads cover ONLINE registration, interface identity and state, VER operational
state, component readiness, inventory, runtime liveness and node diagnostics.
Peer connectivity and required domains are mandatory. Health scores and gateway
ICMP are informational. Traffic, quorum and failover remain outside coverage.

The historical intersection of seventeen component names seeds the minimum
coverage. DNS and networking dependencies require runtime coverage. Auxiliary
exclusions require evidence. Routine observations cannot shrink the declared
coverage. Identical normalized inventory rows count as repeated references;
conflicting rows, duplicate components and ambiguous runtime joins are invalid.

Unknown coverage takes precedence over healthy or degraded results. Validated
failures remain visible when another required read is unavailable. Public hashes
cover sanitized results. Container inspection exposes only matched identity and
liveness. Fixed commands accept inspection IDs only from the selected original
node's fresh runtime listing.

Collection captures each attempt before starting the next read and rechecks
ownership at the end. HTTP operations have a sixty-second bound; observations
expire after five minutes. Acceptance requires two distinct healthy rounds at
least forty-five seconds apart with unchanged qualification and identities.

The documented [Site CLI catalogue](https://docs.cloud.f5.com/docs-v2/multi-cloud-network-connect/reference/ea-sitecli-ref)
provides read-only `crictl-ps-a` and `crictl-inspect` commands. Live console
authentication succeeded after correcting the supplied password. API
authentication also succeeded. Discovery is in progress; actual node-bound
request and response mappings and role placement remain unqualified.

Remaining gates are authenticated isolated discovery, independent cleanup,
upstream contract publication, a second fresh qualification campaign, immutable
release verification, downstream pinning and installed public handler campaigns.
Existing campaigns, provider pins, billing association and draft PRs are preserved.
