# GCP HA scoped observation preparation

GCloud 1.7.17 and Platform 6.3.3 add read-only component-status and independent
service-inventory collection to the existing persisted GCP deployment scope.
The collector binds the original site identity, all three original VM IDs,
their exact resource links and the apply ownership receipt before collection.
It checks persisted context, ownership and site identity again after collection.
Only fixed documented GET paths are exposed; credentials and response bodies
remain in the private collection channel. Requests retain the existing
sixty-second timeout. A failed read cannot reuse an earlier successful body.

Public `gcp_ce_status` and `gcp_ce_diagnose` expose a versioned HA observation
result with aggregate and per-node states, coverage counts, fixed reasons,
observation times and receipt hashes. The evaluator joins inventory `(node, value)`
to component status `(node, name)`, verifies receipt hashes and rejects incomplete,
duplicate, foreign, stale, malformed or unavailable evidence. Global health applies
only to its exact hostname. Registration and both NIC joins are required.
Single-node results retain their existing fields and behavior.

These changes prepare observation only. The pinned immutable API contract has
no qualified complete HA health declaration, so the public HA result remains
unknown even when returned components are Ready. This result does not establish
two consecutive healthy observations or admit the three-node lifecycle.

The [earlier private campaign](gcp-ha-health-qualification-gap-20261019.md) used
marketplace source `e9375431b982cb0033f0448ca4d4bb372a00c2df`. It completed its separate
reviewed cleanup with eighteen independent absences. Its frozen executables and
raw evidence remain private and unchanged. The new source and rebuilt bundles
have not completed fresh public installed live HA acceptance.

The owning `api-specs-enriched` candidate at
`c87dc9c2ed0bb8754f0d920d5ce94f63f6a8bfc7` validates candidate wire shapes but cannot
assert inventory completeness. The exact joins lack component coverage for
`vector-agent`, `voucher`, `kube-proxy` and `coredns` on every original node;
`voucher` occurs twice per node. The owning API must qualify completeness and
required-service coverage, or an explicit evidenced alternative mapping and
duplicate policy. Its untyped diagnosis response supplies no such contract.
Adding schema wording, discarding duplicate rows or excluding these services
cannot supply owning evidence.

The qualified Terraform lifecycle already passed creation, exact no-change
planning, recovery without replay and exact cleanup. No provider defect has
been established by this health gap. Preserve the qualified image/provider pins;
a provider enhancement requires a separately demonstrated lifecycle or readback
failure, or a qualified API contract that the provider must consume.

Focused rejection tests cover missing coverage, duplicate and replacement
identities, stale evidence, unhealthy states, transport failures, malformed
responses, contract changes, receipt tampering and sensitive projections.
The final affected GCloud, Platform and Terraform suites plus isolated runtime
tests passed 618 tests across 98 files. Source and changed-test typechecks,
tracker validation, plugin validation, repository hooks, documentation lint,
secret detection and staged PII enforcement and audit passed. The owning API
contract suites passed 44 tests. These checks do not establish live HA health.

Marketplace PR #1566 and owning API PR #1952 remain draft. Contract publication,
public HA admission and fresh public installed campaigns remain gated on owning
health qualification. Native HA, routing, traffic, upgrades, repair, replacement,
failover and immutable marketplace publication remain outside this milestone.

| Rebuilt bundle | SHA-256 |
| --- | --- |
| gcloud | `a51dda213d697e39e1578f766fefe089143862e7f462d766846b6dbd8c4c5ed9` |
| platform | `3ea544bc8504b7958aa5228f97c622b79d5c21f1f629d8e2ba0d9d792d9b3667` |
| terraform | `b40b75332a16d5bf91216bb0a31ba1401ca7738fdeb6952ecb86654ab564fe3b` |
