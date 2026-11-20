# Provider reader exit race and independent cleanup

Issue: [marketplace #1559](https://github.com/f5-sales-demo/marketplace/issues/1559).
Attempt: 399.

Terraform exited naturally while the original provider reader was discovering
its cohort. The reader now accepts that boundary only after rechecking admitted
inputs and independently proving the original executor and its group absent.
Live groups, changed identities, changed inputs and unrelated errors still fail.
Existing partial captures and failure records remain preserved.

A separate compiled cleanup adapter permits reviewed destroy operations after
failed capture. It binds the original manifest, state hash, lineage, serial,
resource addresses and IDs, and retained lockfile and parent identities.
Independent physical and domain closure are required. It refuses creation,
configuration changes and provider actions. Normal capture gates and the
original failed locks remain unchanged.

Fifteen Python process cases run through the Bun gate. The exit-race regression
and three refusal cases failed before implementation; five cleanup regressions
also failed before their fixes. Final validation passes 960 shared tests with
4,217 assertions, 74 bundle/integration/tracker tests with 644 assertions, all
three plugin typechecks, strict Python Ruff/mypy, runtime builds, source lint
and privacy checks. Production Python 3.15, psutil 7.2.2 and Bun 1.4.2 remain
unchanged.

The failed v5 fixture was independently cleaned before v6. Its two local
objects are absent, destroy is empty, state is stable and two resumes submitted
no work. All eleven original process groups were independently absent; failed
capture flags and locks were retained. Cleanup receipt SHA-256:
`f85434cc042e5017561f7a56a3bbdbe9b927cf273dfb9ddbb43fdda578fb7847`.

The fresh v6 fixture executed the shipped one-shot reader with its real
production pins. Two independent captures retained the same original Google
8.7.0 provider; a third correctly reported original group closure. Its reviewed
two local objects were deleted, destroy planning is empty, state is stable and
two resumes submitted no work. All 39 original process groups were independently
absent. Reader receipt SHA-256:
`133fbb954c087770cdd73403a97bdc8a3086d8fccec83ac6bce9935bebccbfd0`.
Independent final review SHA-256:
`ece6783a6a7f097289a03709b1e984f90a23deb263aff48796028e59069889d4`.

These fixtures created zero GCP resources and sent no process signals. Provider
candidates retain `applyPhaseQualified: false`; local data reads do not prove
cloud apply attribution. The default cloud/serial/SSH controller, complete guest
capture, live networking/lifecycle/traffic, ordinary installed Ubuntu runtime,
required review and CI, publication and published installation remain open.
Historical executors, frozen evidence and immutable v12.3.1 remain preserved.
