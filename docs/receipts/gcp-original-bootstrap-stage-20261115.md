# Original bootstrap capture stage

Issue #1559 remains incomplete. Terraform 2.4.101 adds a source bootstrap stage
for the original apply controller. The full built-in GCP capture factory still
requires cloud inventory, original insertion and guest stages before release.

The stage binds the original prepared scope to persisted deployment intent and
exact Site/Token/node coverage. It starts the pinned creation reader through the
original before callback, waits only for readiness, and collects receipts in the
background after the single apply is released. Registered Platform observation
issues fresh Site/Token bodies in its own module. Original body joins and fresh
bootstrap inspection precede the durable single-use grant signer.

Successful publication is recorded separately from provider consumption,
original VM/NIC ownership, guest health and traffic acceptance. Refreshing an
original published node's evidence does not issue another grant. Changed token
content or identity permanently retires the stage even if the source is restored.
Authentication and publication failures retain partial counts and original
claims. Failure retention preserves both the original and storage errors.

The after callback must supply its exact original five-minute reserve. Final
capture retains creation coverage, publication counts and source hashes on both
success and failure. Closing requires the original executor group closure and
reader closure; failed reader closure remains incomplete and preserves its held
state. Observations retire even when reader closure fails. No process signals,
new key, budget renewal or unchanged publication retry are introduced.

Offline tests exercise source-issued scope and reader receipts, actual Platform
body issuers, shared durable checkout, the real Linux atomic publisher and actual
before/after callback issuance. The three-node fixture initially exposes only
Site and first-token receipts, then supplies the other two after the first grant.
A separate gate prevents any target from appearing until startup returns, proving
that resource observation does not block executor release. Authentication,
uncertain publication, wrong node, restored token and reader startup failure
remain explicit failures. These are source tests, not installed or live proof.

All original native/Terraform single-node and HA networking/lifecycle/traffic
acceptance, original guest capture, independent closure/cleanup/restoration,
remaining installed checks, required review/CI/merge, publication and supported
user installation remain required. No new live cloud campaign was submitted.

Validation passed 517 shared Terraform tests across 54 files, nine compiled
bridge/runtime checks, the strict Terraform typecheck, three runtime bundles,
catalog checks and the supported tracker update. The final retention change
passed all seven stage scenarios and compiled checks again. Historical runner
tests containing process-signal cases remain a required CI gate.
