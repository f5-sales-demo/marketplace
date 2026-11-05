# Private GCP HA partial cleanup qualification

The private three-node Montréal campaign submitted one exact eighteen-create
binary plan, interrupted XC traffic before TLS, and retained eleven objects:
three explicitly managed orphan disks, two networks, two subnets and four
interface firewall rules. No VMs or XC site/token objects were created.

The original ownership inspection stopped because Google firewall creation time
did not equal the insert operation's start time. Original state and operation
receipts showed creation inside the operation's recorded interval. The repaired
inspection requires equal retained/live creation timestamps, one completed insert,
the exact target link and immutable target ID, and valid operation time ordering.
Missing, ambiguous and replacement evidence still require reconciliation.

Recovery captured the eleven-object subset without another creation submission.
A separate reviewed eleven-delete plan removed that subset. The final destroy
plan was empty, state was stable, and independent checks found all eighteen
expected cloud/XC objects absent. Repeated cleanup resume confirmed absence
without another deletion. The original binary and receipt remain in restricted
plan history; raw state, identities, credentials and bootstrap material remain private.

This qualification used frozen installed Platform and Terraform runners with the
GCloud source adapter. It does not establish public installed HA acceptance or
exhaustive HA health. Public HA admission remains closed.

| Binding | SHA-256 or value |
| --- | --- |
| Original executable source | `4de636f7285930f5c0102d47de96e1c9d533d772` |
| Ownership repair source | `8acc6ec27ce800b9e62584fecad4e03dc61543c7` |
| Original binary plan | `dc1bf8d7ecf873431de8e8ffb50ff2b37a691449fb0576ae124293981230c399` |
| Original review | `sha256:6cbc42ac49f195ae49707b496c4a209152de7ad99f877aea8781ca93e5a0fc51` |
| Cleanup review | `sha256:108968a2941708cd2029d6f6a5189f4fdb9fbc8b17b8c39c8b02882c02088d61` |
| Final empty destroy plan | `be1c65e372238a03785be9dbfa6dad65abef25f36ba350e12de3a6c6c8f69280` |
| Sanitized private receipt | `c2149d5d2d3ac4d90df0aa45d1fa3b0539cdf25b52f9e34bd28c0c448b826182` |
| Original creation submissions | `1` |
| Delete submissions | `1` |
| Independent absences | `18` |

Both executable sources have passing exact-head CI.
Repair validation covered 461 GCloud/Platform/Terraform tests, focused ownership
typechecks, runtime build, plugin validation, presentation tracker, pre-commit,
secret detection and PII enforcement. The initially timed-out executor test passed
with the repository's thirty-second allowance.

| Frozen original bundle | SHA-256 |
| --- | --- |
| Platform | `c1579d7e2e5522945680f4de2dcbdb6e082e4d17d4f2bf112c6ce7288df7ae5b` |
| Terraform | `b40b75332a16d5bf91216bb0a31ba1401ca7738fdeb6952ecb86654ab564fe3b` |
| Gcloud | `260a564d9bdade6dc3e97181364f46651c53bbe276590811d88ac0b04352f45b` |
