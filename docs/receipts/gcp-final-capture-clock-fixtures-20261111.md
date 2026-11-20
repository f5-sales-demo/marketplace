# Final-capture fixtures on fresh runners

Issue: <https://github.com/f5-sales-demo/marketplace/issues/1559>.
PR: <https://github.com/f5-sales-demo/marketplace/pull/1698> remains draft.

The adapter commit's plugin CI failed three existing final-capture tests on a
fresh runner. Each subtracted two hours from host uptime to build an expired
operation. On a runner younger than two hours, the resulting negative start was
correctly refused before the intended final-capture behavior could be tested.

The controller tests now use an explicit positive fixture timeline. Final-reader
admission captures its source-test clock separately from the serialized reserve.
Installed callers continue to use Linux monotonic time. The original two-hour
operation, five-minute final window, identity checks, single original window and
source-issued reserve authority remain intact. Copies cannot issue authority,
options cannot replace a captured clock, and exhaustion still refuses.

Four tests failed before implementation, including the new captured-clock
regression. All 13 focused tests passed after the repair. Earlier CI failures and
the mapping commit's automatic manifest changes remain retained. Historical
changelog attribution is restored, and all three affected bundles are explicitly
versioned before their final build and validation.

This is source and test-fixture evidence. Default installed guest capture,
positive GCP guest and traffic evidence, full lifecycle acceptance, required
review, merge, qualified publication and published installation remain open.
No cloud resources were created; historical locks and v12.3.1 remain preserved.

The final source qualification passed 1,399 shared tests with 11,351 assertions,
focused controller/reader/worker/access regressions, three builds and typechecks,
dependencies, generated catalog, manifests and tracker checks. Exact-head CI must
pass before this source repair satisfies the CI gate.
