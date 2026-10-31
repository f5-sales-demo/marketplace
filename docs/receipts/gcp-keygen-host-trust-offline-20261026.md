# GCP generation host trust qualification

Attempt 234 qualifies a private v15 successor for the documented cloud-init 24.4
Ed25519 host-key generation output. The source baseline is `d73701e1`. This is
offline parser and consumer evidence; fresh GCP guest access remains unverified.

The mapping is pinned to cloud-init commit
`c9b9eef30252f6470e0b132d831ceb4de2521c38` and OpenSSH V_9_9_P2 commit
`d76b2675116617394cd355a3437b4963a562b64d`. The original guest's OpenSSH package
version remains unverified. A retained q30 serial frame establishes grammar only;
its missing wire-key candidate cannot establish current trust.

The successor requires one complete generation block and its unique preceding
cloud-init `init` producer. It verifies the supported version, producer PID, real
UTC calendar, monotonic finite guest uptime, exact private/public key paths,
canonical original-address SSH wire key and SHA256 fingerprint. Its 17-column
by 9-row randomart must match the independently obtained wire-key digest.
Randomart and its fingerprint are related representations of that digest.

Missing, truncated, duplicate, foreign, malformed, injected, changed or stale
evidence refuses before SSH. A present final fingerprint section must be complete
and unique; qualified generation output must agree with it. The legacy final
section mapping remains supported, including alongside an unqualified generation
version. Historical receipts are preserved.

New pin receipts use `original-serial-host-trust-v15` and identify the consumed
mapping. Parsing alone records `wireKeyMatched=false`. A verified pin still
records `liveAccessVerified=false`, `replacesExistingPin=false` and
`qualifiesRelease=false`.

Failing-first evidence covers missing generation support, conflicting final
evidence, invalid calendar/version input and the consumer's old dependency guard.
The final scope passed **137 tests**, including independently generated Ed25519
keys, actual local PTY command captures, both host pins, ownership changes,
authentication failure, bounded output, freshness, foreign container identifiers
and dependency replacement. SSH argument tests use explicit offline stubs.

All nine frozen v14 files remain byte-identical. The successor preserves both
ownership checks, strict host checking, disabled forwarding, the 60-second
command limit, 15-second prompt startup and five-minute evidence freshness.
Its existing campaign scope remains unchanged; a new campaign requires its own
reviewed scope, installation, prerequisites, plan and ownership bindings.

The original [q30 cleanup and failed capture](gcp-q30-disposable-diagnostic-20261026.md)
remain preserved. No q30 launcher, guest access, destroy or empty plan was replayed.
Its stopped reader and unresolved locks remain isolated. No administrator
privileges or new infrastructure submission were used for this qualification.

The bootstrap journal timestamp and runtime listing namespace mappings remain
held. Fresh guest capture, operational HA, lifecycle, networking, traffic,
recovery, review, publication and published user installation remain required in
the [acceptance matrix](gcp-issue-1559-acceptance.md). PR #1698 remains draft.
