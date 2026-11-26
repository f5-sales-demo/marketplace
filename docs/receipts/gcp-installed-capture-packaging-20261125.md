# GCP installed capture source and runtime prerequisites

Issue: [marketplace #1559](https://github.com/f5-sales-demo/marketplace/issues/1559).
Delivery: draft PR #1698, linked with `Closes #1559`. Full acceptance remains open.

The normal Terraform registration now supplies the installed GCP capture factory
through the shared runner and Platform service. Terraform 2.4.195 carries this
source change. Generated runtime packages retain `runtime/index.js` and ship
all sibling chunks. Rebuilding removes stale generated chunks. Copied-package
tests exercise complete installed directories without neighboring source.

HA cleanup validates the immutable lifecycle scope before consulting original
image authority. A new failing-first test and the retained public teardown test
both reproduced the earlier incorrect refusal. Original ownership, changed-image,
copied-capability and retired-origin checks remain enforced.

Qualification includes 59 focused cleanup tests, all 750 GCloud tests, all 98
shared tests and 33 affected generated-runtime tests. The retained full Terraform
suite passed 1,285 tests and Platform passed 352. Their source, test and script
hashes are unchanged; the two GCloud scope-order files were separately qualified.
These retained results are attributed to their original runs.

The previously absent agent-validation dependency is installed at published xcsh
24.0.0. Its actual parser validates the agent declarations. Consumed development
dependencies were installed from frozen locks without executing lifecycle hooks
or expanding dependency trust. Earlier missing-dependency, scope-order and
receipt-aggregation failures remain preserved privately.

The normal generated runtime build, the unchanged 1,024 KB artifact limit,
GCloud typecheck, dependency checks, source lint and diff checks pass. All
generated JavaScript artifacts remain below that size limit.

Ubuntu native prerequisites pass for xcsh 24.0.0 source
`55dd05b470d9f13bee9b23f2961007e84a740f81` and Bun 1.4.5. Both the native
build and source-matched probe pass; the checkout remains clean. Native artifact
SHA256: `313495af491c43768a4f2805c13938aab9165fd69038d9bcec940540d24b4b31`.
The probe ran after compilation and before any further broad suites.

Fresh Ubuntu identity and current main were independently verified. The pending
integration merge, historical worktrees, executors, failed captures, unresolved
locks and immutable v12.3.1 remain preserved. No cloud campaign was submitted
by this qualification.

Final staged hooks and commit, supported isolated installation and ordinary
Ubuntu `bun dev` remain separate gates. The changed factory still requires fresh
original guest capture and same-provider credential renewal across expiry.
Every original native and Terraform networking, lifecycle, content-verified
traffic, recovery and cleanup gate remains open, followed by current-head review,
CI, merge, qualified publication and installed published smoke.
