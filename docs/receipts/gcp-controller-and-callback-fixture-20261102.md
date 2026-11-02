# GCP original controller and callback fixture qualification

Issue: <https://github.com/f5-sales-demo/marketplace/issues/1559>. Draft PR:
<https://github.com/f5-sales-demo/marketplace/pull/1698>.

Attempt 318 qualifies an actual capture-only controller using the original system-monotonic
start. Eight budget tests passed. The disposable local execution captured four ordered
boundaries from one original Python process, retained the fixed operation and final deadlines,
and independently verified three process groups absent. Two read-only resumes preserved the
original result and submitted nothing. The controller refuses arbitrary scripts and Terraform
execution; this qualification does not admit a Google apply.

The initial fixture used an executable alias that differed from the pinned canonical path.
Capture refused. Its original failure result, source bytes and claim bytes remain preserved.
After fresh independent absence review, its claim was released and all three groups were
verified absent. Capture acceptance remains false. The changed fixture uses the canonical
executable and the fixed final reserve for recovery. Python lint passed after retained repairs.

Attempt 319 prepares a new local Terraform refresh fixture. It declares three local
`terraform_data` resources and three deferred `google_client_config` reads, with zero cloud
resources and no token outputs. A read dependent on the final local callback is intended to
keep the original provider alive through that callback. Live execution must still prove this
behavior. Provider tokens remain private data-source state and callback inputs.

Eight failing-first plan-guard tests and five context-argument tests passed. The callback
dispatcher binds its phase, canonical private context path, context hash and frozen callback
source. Missing hashes, traversal, injected paths and foreign phases refuse. The actual local
saved-plan test passed with eleven assertions and four natural execution closures. Independent
plan inspection verified all six identities and operations. TypeScript type checking, configured
Biome and Python lint passed after retained narrowing and import-format repairs.

The planned callback bytes are preserved. Import formatting and traversal rejection changed
their current bytes after planning, so execution requires fresh consumer bindings and review.
The saved plan remains unsubmitted. The original-budget apply controller must produce the
dynamic callback context, bind original ADC and package bytes, and collect final evidence before
real token verification across expiry can run. No actual tokeninfo callback ran in these attempts.

Full GCP lifecycle, guest and traffic acceptance, teardown and restoration, review, publication
and published installed acceptance remain open. The PR remains draft. Historical failed capture
flags, frozen collectors and immutable v12.3.1 assets remain unchanged.
