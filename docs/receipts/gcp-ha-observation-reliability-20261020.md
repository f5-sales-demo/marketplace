# Secure Mesh HA observation reliability

The cleaned marketplace baseline is `934ad4ba`; the owning API candidate remains
`a5ba58a5`. Neither baseline establishes complete Secure Mesh v2 service health.
Both qualification PRs remain draft. No health mapping, HA admission or release
is authorized by these reliability changes.

Terraform executor startup now has a fifteen-second deadline covering private
identity persistence and gate release. On failure it kills only its own child
and requires verified exit before releasing its process-bound claim. A late
identity claim is released only after that exit; an unresolved stop retains the
claim and blocks recovery. Saved-plan authorization, process-start identity,
operation deadlines and lock ownership remain in force.

Private executor diagnostics retain invocation IDs, timestamps, launcher and
executable attribution, executable hashes and persisted PID/start identity at
gate transitions. They export neither command arguments nor environment values.
GCloud embeds the same runner, so both runtime bundles are rebuilt.

The new private observation helper directly invokes the verified SDK Python
entrypoint with the original argument array and existing credentials. It freezes
interpreter, entrypoint, SDK version and SDK library-tree hashes. Each HTTP
attempt persists its status, timestamps, duration, classification and bounded
private body before another read starts, including transport failures and
truncated responses. HTTP reads retain sixty-second deadlines. Historical
campaign executables and captures remain unchanged.

The private successor campaign is gated against provisioning pending authenticated
console access and an owning Secure Mesh health contract. Its source review,
artifact freeze and saved-plan checks remain required before it can be enabled.
An unavailable Work browser account prevents console tracing. No temporary local
Kubernetes credential has been created. No supported internal CE coverage or
credential scope/expiration/revocation declaration has been established.

Four prior proxy snapshots returned empty node, namespace, pod and daemonset
lists without resource versions. The prior health window was interrupted by a
stopped shell; attribution to gcloud is unproven. The private owner request now
includes both findings and asks for complete required-service or aggregate
coverage, exact joins, states, freshness and duplicate handling.

Validation: 480 focused Terraform, Platform CE and GCloud CE tests passed,
including four new gate-failure tests; Terraform typechecking passed. The private
HTTP rejection test passed 36 assertions for successful, transport, malformed,
HTTP failure and bounded-body cases. Direct SDK version/auth checks used existing
credentials. Installed public handlers and two consecutive fully qualified
three-node healthy observations remain pending the owning contract.
