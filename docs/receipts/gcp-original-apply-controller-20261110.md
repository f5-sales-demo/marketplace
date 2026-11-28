# GCP original-budget apply controller integration

Issue: #1559. Delivery: draft PR #1698.

The installed Terraform runtime now wraps its admitted capture worker with an
original-budget controller. Provider package verification and preparation run
before creating the gated apply child. Long preflight work consumes the original
two-hour budget without consuming or renewing the child's 15-second release gate.
Preparation is single-flight; a failed preparation cannot silently retry.

Startup and final callbacks retain the original context, authentication,
execution identity and budget. Callbacks are issuer-bound and reject copies,
wrong identities, wrong budgets and late startup completion. Their original
credentials remain available to the trusted worker without entering serialized
event summaries. Private controller events are synced to disk before completion.

Final callbacks use the already admitted original five-minute reader reserve,
including after the operation deadline. The reserve cannot be renewed. Final
capture is attempted even when its initial journal write fails; capture,
verification and persistence failures remain failures. Preparation and evidence
retention errors both survive. Disposal requires original executor closure.

Eight failing-first controller cases pass. Related installed-runtime and final
dispatcher regressions also pass. All 1,348 shared/canonical tests pass with
10,879 assertions. Three native typechecks and runtime builds pass. Historical
services and stored deployments keep their existing engine and cleanup paths.

This integrates controller lifecycle and callbacks; it does not qualify guest
capture or insertion. The default guest worker remains unavailable pending real
serial/SSH/VPM and container evidence. Actual same-original-provider expiry,
fresh managed VM/RPC/audit/token/NIC/lifetime joins, durable single-use bootstrap,
native/Terraform lifecycle and networking, installed runtime and delivery gates
remain required. No cloud campaign was submitted for this source change.
Historical failed captures, locks, frozen collectors and v12.3.1 remain unchanged.
