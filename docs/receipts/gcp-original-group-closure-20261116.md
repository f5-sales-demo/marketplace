# Original group closure after final capture starts

Issue: [marketplace #1559](https://github.com/f5-sales-demo/marketplace/issues/1559).
PR: [#1698](https://github.com/f5-sales-demo/marketplace/pull/1698), retained as draft.

The controller previously retained the executor's initial open-group snapshot
after a descendant exited naturally. Terraform 2.4.120 accepts a later closure
acknowledgement only from the same original output completion and actual final
callback. Directory, actor identity and complete prefix hashes must agree.
The original snapshot stays unchanged and the five-minute reserve cannot renew.

A durable source record precedes the controller state change. Original inputs
and source proof are checked again after that write. Same-source acknowledgements
serialize their reads and are idempotent; failed persistence remains single-use.
Copied callbacks/completions, foreign sources, expired reserves and changed
original inputs refuse. No apply, guest or insertion qualification is granted.

Failing-first source and compiled API tests are retained. The fixture uses a real
gated parent and an owned descendant held through bounded file IPC. Original
output proves natural group closure; authentication values remain explicit
offline placeholders. Tests cover concurrent calls, foreign completion,
persistence failure and mutation during the durable write.

Original output reads remain exclusive. Acknowledgement calls serialize their
proof reads; each caller still receives its own refusal. Source tests include
the fixed reserve's expiry and original input mutation during the durable write.

Verification passed: 694 Terraform tests, 825 combined Platform/GCloud tests,
strict Terraform typecheck, all three runtime bundles and 18 compiled bridge
checks. Shared, catalog/tracker, privacy, normal hooks and exact-head CI remain
separate checks. No live GCP acceptance is inferred.

Final VM/serial handoff, observer insertion mapping, built-in factory composition
and all original live networking/lifecycle/traffic/recovery/cleanup/restoration,
ordinary installed runtime and publication gates remain open. Historical
workspace-v2 closure cause remains unknown and its rejected capture is preserved.
