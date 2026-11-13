# Original input monitor refusal attribution

Marketplace issue #1559 remains incomplete.

The retained earlier no-creation test failure reported a generic changed-input
error. Its precise cause remains unknown. Later passing tests do not establish
that the earlier failure was transient or justify an unchanged cloud retry.

A private source-copy probe added watcher and assertion instrumentation without
changing the marketplace checkout. All 14 monitor and prepared-scope tests passed.
Four additional scheduling cases tested a fresh parent, an existing parent
watcher, writes queued before admission and unrelated sibling output. All passed;
none reproduced the historical failure. This is diagnostic evidence only.

The source monitor now retains a typed, sanitized first-refusal reason. It
distinguishes closure, watcher events/errors, invalid file metadata, file/parent
identity changes, changes during open/read, byte mismatch and unavailable
filesystem reads. The same first reason survives restoration and closure. Error
objects retain no credential contents, selected paths or raw filesystem errors.

Three new tests failed before implementation and passed afterwards, covering
closure, durable watcher refusal and byte mismatch with privacy assertions.
Focused monitor/scope checks passed all 17 tests. The shared Terraform, Platform
and GCloud family passed all 1,301 tests with zero failures and 6,319 assertions.
The normal builder produced all three runtime bundles. Source formatting/lint
passed for the two changed TypeScript files.

These are source and offline diagnostic results. Published SDK consumer
typechecks, genuine installed capture, original provider/token/VM/NIC/audit joins,
GCP guest and traffic acceptance, delivery and publication remain separate gates.
The default capture factory and runtime activation pin remain held. No GCP
campaign was submitted for this change. Historical failures, private captures,
executor locks and immutable assets remain preserved.
