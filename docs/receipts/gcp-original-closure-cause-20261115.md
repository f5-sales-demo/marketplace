# Original output closure failure causes

Issue: [marketplace #1559](https://github.com/f5-sales-demo/marketplace/issues/1559).
PR: [#1698](https://github.com/f5-sales-demo/marketplace/pull/1698), retained as draft.

The previous workspace probe failed original output capture during process-group
closure inspection. Independent cleanup verified empty local state/destroy,
26 absent command groups and zero locks or cloud resources. The discarded
underlying exception prevents a retrospective diagnosis of that failure.

The output issuer now preserves the original closure exception as its cause.
Version 2 private failure packets retain its type, code, bounded message and
complete message hash. Closure checks and permanent source refusal continue to
govern capture. Historical failure files remain retained.

A failing-first test uses a real gated process with a deliberately injected
operating-system exception. It verifies private cause retention; the injected
error does not explain the previous live failure. The existing format assertion
now requires version 2. Source verification passes 47 focused cases, 643 Terraform
cases, 17 compiled checks and 13 catalog/tracker regressions. Typecheck and three
runtime bundles pass.

Additional published package metadata confirms qmd 2.8.3, TypeBox 0.34.52,
tar-stream types 3.1.5 and Bun types 1.4.4 are current. qmd requires its distinct
TypeScript 5.9.3 peer; development checks use TypeScript 7.0.2.

A fresh changed-source real provider probe passed its original image read,
workspace-bound HTTP/UI/lifecycle capture and no-change planning. Independent
cleanup verified 26 absent command groups, empty local state/destroy and zero
locks or cloud resources. It did not reproduce the earlier failure, whose
exact cause remains unknown. These are component checks.

Full built-in capture, original GCP live
networking/lifecycle/traffic/recovery/cleanup/restoration, remaining installation
checks and review/CI/merge/publication remain required.
