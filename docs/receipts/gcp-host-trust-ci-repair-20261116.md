# Host-trust Python CI repair

Issue: [marketplace #1559](https://github.com/f5-sales-demo/marketplace/issues/1559).
PR: [#1698](https://github.com/f5-sales-demo/marketplace/pull/1698), retained as draft.

Super-Linter run
[43950801216](https://github.com/f5-sales-demo/marketplace/actions/runs/43950801216)
failed for source `73fd0322`. Full CI checked both the parser and its tests.
Pylint found oversized validation functions, resource-lifecycle and loop issues;
Mypy also found undeclared shared fixture attributes and invariant dictionary
arguments. The source-only local typecheck had missed test typing.

Terraform 2.4.125 separates producer, frame, context and serial validation into
small helpers. Read-only mapping annotations preserve input bindings. Typed
fixture state uses managed cleanup, private helpers and direct row enumeration.
No lint configuration, acceptance threshold or refusal contract is relaxed.

The same 50 parser tests and 218 subtests pass. Pylint, Ruff and Mypy now check
all four source/test files successfully. Runtime bundles are rebuilt with the
new exact source pin. Capture and shared checks, catalog/tracker, privacy,
normal hooks and new-head CI remain separate recorded gates.

Attempt 626 retains its three failing-first original-serial consumer tests in
a separate worktree. Implement those getters after this CI repair, then bind
real original-VM serial and key-scan evidence before built-in guest capture.
Every original live networking/lifecycle/traffic/recovery/cleanup/restoration,
installed runtime, review, merge and publication gate remains open.
Frozen collectors, historical evidence and immutable assets are preserved.
