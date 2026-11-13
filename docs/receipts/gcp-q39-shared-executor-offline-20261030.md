# GCP q39 shared executor qualification

Issue: #1559. Qualification attempt: 293. This receipt covers offline source
and bundled-runtime checks. Live deployment and publication remain gated.

## Change

The shared Terraform service accepts an optional trusted executor. It captures
the executor once when creating the service, then passes it to each runner.
Existing callers retain the default executor.

The runner retains deployment ownership, isolated configuration, immutable
saved-plan application and interrupted-apply reconciliation. This hook enables
a separately qualified signal-free executor for the q39 campaign.

A fresh issue worktree reconciles current main with all retained candidate
commits. Historical worktrees, collectors and sealed receipts are preserved.

## Verification

- Failing-first service tests exposed the ignored executor option.
- Nine service tests pass, including injection, scope admission, durable
  ownership checks and interrupted execution across two resumes without replay.
- The broader source run passes 87 tests across seven files. Eight tests that
  execute the default subprocess or process-signal paths were excluded to honor
  this campaign's execution constraints; the exclusion inventory is retained.
- Strict Terraform typechecking passes.
- GCloud, Platform and Terraform runtime builds pass. Two isolated bundle
  registration and refusal tests pass. These are fixture checks.

The red run reached the prior default executor and returned a missing-CLI error.
That failure is retained. It did not submit infrastructure. Subsequent executor
tests use the injected policy.

## Remaining gates

The signal-free Terraform executor, production q39 bridge, campaign guard,
normal marketplace installation and ordinary interactive runtime still require
qualification before live submission. No new create plan or cloud submission
was made by this attempt.

Historical capture remains unresolved and unaccepted, and historical reader
closure remains incomplete. Independent q38 cleanup acceptance does not change
those flags. Live guest evidence, lifecycle and networking coverage, traffic,
cleanup, review, CI, publication and installed acceptance remain open for #1559.
