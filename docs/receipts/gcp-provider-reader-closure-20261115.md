# Original provider reader retirement and closure

Issue: [marketplace #1559](https://github.com/f5-sales-demo/marketplace/issues/1559).
PR: [#1698](https://github.com/f5-sales-demo/marketplace/pull/1698), retained as draft.

The provider reader now retires through an idempotent close operation that waits
for pending source reads and existing child commands to settle naturally. It
prevents later reads, new child release and successful pending-result delivery.
Window bodies and clock evidence also lose issuer authority after retirement.

Closure requires a retained receipt for every reader invocation. The original
child identity must match its admitted reader, differ from the apply parent,
and record actual exit, group absence, unchanged operation deadline and zero
signals. Receipt bytes and file identity are verified again before closure.
The apply parent's closure flag cannot substitute for reader-child closure.

Capture records are immutable. Missing, substituted, foreign or incomplete
closure evidence refuses. A failed observation may still close an independently
closed child; its failed result and unresolved flags remain preserved. Closure
does not qualify that observation or authorize another submission.

Ten failing-first retirement cases now pass alongside the existing twenty
provider reader cases. The broader run passes 564 Terraform cases, 665
Platform/GCloud cases and 13 shared cases. TypeScript 7, three bundles, catalog,
tracker and fourteen compiled checks pass. Compiled
verification exposed the missing reader export, which is now supplied with its
original body and clock accessors. The current Terraform 1.17.2 and Google 8.11
profile is used for the new closure fixtures.

A fresh component probe used real Terraform 1.17.2 and the qualified Python/SDK
reader, with current authenticated provider packages and an empty reviewed plan.
The reader child closed while the original apply parent was still alive. A
separate kernel and SDK review confirmed both original groups absent afterward.
The final plan, destroy and local state contain zero managed resources, and no
unresolved executor lock remains. No process signals were sent.

This component probe used zero cloud resources and did not qualify cloud
authentication, registered tools, guest behavior or ordinary installed execution.
Private original process, input, package and plan evidence remains retained.
Full built-in insertion/serial/guest capture, all original live GCP acceptance,
remaining installed checks and review/CI/merge/publication remain open.
