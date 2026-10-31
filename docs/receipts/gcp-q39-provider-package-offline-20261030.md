# GCP q39 provider package admission

Issue: #1559. Attempt: 302. Full issue acceptance remains incomplete.

The shared Terraform package verifier checks the complete unpacked provider
against the reviewed dependency lock using Go's documented `h1` directory hash.
It binds each file digest and the exact provider executable, version and Darwin
ARM64 Mach-O architecture. Changed lock bytes, duplicate provider entries,
comment-injected fields, altered contents, extra files, aliases and unsafe names
are refused. Other platform mappings require separate qualification.

The algorithm follows the upstream
[Go directory-hash implementation](https://github.com/golang/mod/blob/master/sumdb/dirhash/hash.go).
A private immutable snapshot retains the reference used. A lock hash must come
from the caller's trusted reviewed inputs; this verifier does not authenticate
an arbitrary lock supplied by a caller.

Read-only inspection of the retained public Google 8.7.0 and xcsh 15.13.0
Darwin ARM64 packages passed against the existing public GCP dependency lock.
No provider executable was launched and no cloud calls occurred. Source tests
and shared-service regressions passed 16 tests with 62 assertions; the strict
Terraform typecheck passed.

This helper is not enabled as a production cloud consumer. Exact configuration,
credential and saved-plan admission, external provider execution and process
closure, production deadlines, the shared-service bridge and campaign guard
remain open. Installation, runtime, live guest and traffic acceptance, cleanup,
review and publication retain their existing gates. Historical capture and
complete reader-closure flags remain false; original locks and immutable
artifacts are preserved.
