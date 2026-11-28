# Terraform apply hook candidate qualification

Issue: <https://github.com/f5-sales-demo/marketplace/issues/1559>.
Delivery: draft <https://github.com/f5-sales-demo/marketplace/pull/1698>.

Attempt 406 adds a bounded parser for Terraform 1.16.6 JSON UI 1.3.
It binds core apply hooks to reviewed resource addresses, types and ordered
actions, including separate replacement phases. Every result remains a
candidate: provider RPC and original GCP insert qualification are false.
The parser does not change the installed apply gate or enable capture.

The pinned [core hook implementation](https://github.com/hashicorp/terraform/blob/v1.16.6/internal/command/views/hook_json.go),
[hook schemas](https://github.com/hashicorp/terraform/blob/v1.16.6/internal/command/views/json/hook.go),
[resource addresses](https://github.com/hashicorp/terraform/blob/v1.16.6/internal/command/views/json/resource_addr.go)
and [JSON view](https://github.com/hashicorp/terraform/blob/v1.16.6/internal/command/views/json_view.go)
establish the supported event contract. Core hooks describe Terraform execution;
they do not establish receipt of a provider RPC or a cloud request.

Thirteen tests and 64 assertions pass. Failing-first cases cover framing,
version and producer mismatch, concurrency, replay, unfinished actions,
identity changes, replacement order and error outcomes. Additional semantic
cases failed before repair: null timing, duplicate identities and error-level
logs could appear successful. The final parser rejects duplicate escaped or
nested keys, decreasing elapsed values and unsupported operation hooks.
One-megabyte line and 64-megabyte stream limits remain fixed across calls.
Original line hashes include the newline; returned projections are immutable.

A fresh isolated local fixture used the retained Terraform 1.16.6 executable
with a reviewed saved plan, JSON output and parallelism one. Its only resource
was a builtin Terraform data object. The parser accepted the original create
and reviewed teardown streams. Final planning showed no changes, local state
was empty and all ten original executor groups closed without signals.
No cloud resources or requests were submitted.

The first probe selected the workstation's default Terraform 1.16.5 and refused
before init or apply. That failed probe and its natural closure are retained.
The successor changed the executable to the exact retained 1.16.6 path and
used a separate workspace. User defaults and historical evidence were preserved.

The successful private local receipt has SHA-256
`ca084edfcfe256fe2c734ed71ac951ae68527140aa705c6a8ff8f579ed65a313`.
Its source hashes match the parser qualified here. This fixture qualifies core
hook parsing, saved-plan execution and local cleanup. Original provider RPC,
request/audit and insert-incarnation joins remain open, along with full guest
capture, native/Terraform lifecycle and networking, content-verified traffic,
ordinary installed Ubuntu runtime, required review, merge and publication.

The relevant shared suites pass 986 tests and 4,344 assertions. All three
TypeScript checks, runtime builds and dependency checks pass. The canonical
tracker and integration checks pass 78 tests and 1,120 assertions, preserving
2,678 tasks, 315 surfaces and 22 plugins. These source checks do not grant
installed-tool or live GCP acceptance.
