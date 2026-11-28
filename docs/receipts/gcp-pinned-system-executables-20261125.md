# Pinned system executables for GCP cleanup

Issue: [marketplace #1559](https://github.com/f5-sales-demo/marketplace/issues/1559).

The installed Google CLI is an ordinary root-owned system executable. The shared
native executor previously required caller ownership and refused that SDK before
launching a reader. Terraform 2.4.178 accepts regular executable files owned by
the caller or the system. It still requires exact reviewed bytes, a single link,
safe permissions, original file and symlink identities and lifetime checks.
Writable, foreign-owned, setuid and setgid executable files remain unavailable.
GCloud 1.7.77 contains this qualified mapping in its cleanup runtime.

Native tests use a real system identity command through both its system path and
an owned symlink. The result retains the original caller UID, closes naturally
and sends no process signals. A wrong reviewed hash refuses before launch;
replacing the symlink with the same target refuses command release. Metadata
tests cover unsafe ownership, permissions, file type, links and caller identity
without executing elevated programs or altering system files.

## Verification and remaining gates

Native owner admission and the missing metadata helper failed first. The focused
run passed 56 cases. The full Terraform and GCP domain run passed 1655 cases
and 13224 assertions without source drift. Both strict typechecks, normal
three-plugin runtime builds and configured lint passed. Shared Platform storage
and process-lock checks passed during final source qualification.

These results establish executable admission and source behavior. Actual installed
SDK observations, original reader-group and Platform ownership bindings, reviewed
successful or interrupted cleanup, full command release and every original guest,
provider-expiry, lifecycle, networking, traffic, recovery, teardown, CI, review,
merge, publication and published-installation gate remain open. The fresh
21-resource campaign remains planned and unsubmitted. The complete capture factory
stays inactive; historical receipts, failed captures, locks and immutable artifacts
remain preserved.
