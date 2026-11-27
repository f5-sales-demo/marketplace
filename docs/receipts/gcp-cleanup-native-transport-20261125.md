# Native transport for captured GCP cleanup

Issue: [marketplace #1559](https://github.com/f5-sales-demo/marketplace/issues/1559).

Captured cleanup can retain a failed executor claim in the original Terraform
workspace. The new compiled transport uses a separate private native executor
directory and passes the exact original workspace through Terraform's `-chdir`
argument. It uses the same admitted interpreter and Terraform binary, preserves
the original failed claim, and checks independent original group closure and
source inputs around execution. It refuses foreign workspaces, caller directory
overrides and auto approval. Cancellation permits natural child completion and
does not send process signals.

The transport grants no cloud ownership or deletion authority. The shared runner
and GCloud domain still require exact owned identities, a reviewed delete-only
plan, preserved state and original reader-group evidence. Full admission and
final capture remain required. Read commands retain sixty-second limits, native
startup remains limited to fifteen seconds, and the cleanup operation and final
reserve retain their existing bounds.

## Source verification and remaining gates

The missing implementation and missing shared export failed first. Three real
native transport cases, shared cleanup recovery and runtime exports, and GCloud
ownership, durable recovery and public teardown suites passed: 87 cases and 447
assertions. Strict Terraform typecheck, normal runtime build, configured lint and
privacy enforcement passed.

The fresh 21-resource campaign is prepared and independently reviewed, but has
not submitted apply. Concrete campaign ownership-observer and successful or
interrupted cleanup composition still require qualification. The generic gcloud
executor supports process-signalling cancellation, so this task must use a
signal-free observation path. No process signal was sent by this qualification.
Full command release, original guest capture and provider expiry evidence, all
original lifecycle, networking, traffic, recovery and independent teardown
acceptance, required CI and review, merge, publication and published installation
remain unfinished. The complete factory stays inactive and historical evidence,
failed flags, locks and immutable assets remain preserved.
