# Source-owned Google cloud and serial reader

Issue: [marketplace #1559](https://github.com/f5-sales-demo/marketplace/issues/1559).
Attempt: 397.

The installed capture controller needs real cloud and serial reads. Frozen
private collectors depend on historical Mac paths and signal-based closure;
they remain preserved. A source-owned reader now uses fixed Google Compute GET
endpoints through the verified original ADC snapshot. Bearer tokens stay private
inside the read capability and never enter authentication receipts.

The reader retains exact response bytes and hashed private receipts before
decoding or identity checks. Interrupted and oversized responses retain their
bounded prefix with an incomplete receipt. Numeric VM identity, creation time,
metadata and NIC mappings bracket serial reads. Later observations cannot adopt
a replacement for the same name. Serialized or cloned observation objects cannot
authorize serial reads. The installed-context entry point consumes the original
admitted ADC and all six provider-package inputs without choosing ambient
credentials or resetting the controller's budget.

Google Compute discovery revision `20261106` confirms the serial endpoint is
`instances/{instance}/serialPort`, the one-megabyte rolling buffer and signed
64-bit byte offsets. Initial wrong-suffix tests and all failed probes remain
retained. The reader refuses discarded serial prefixes, malformed output and
out-of-range offsets; documented single-character names remain supported.

Thirteen new regressions cover endpoint selection, attributable absence,
injection, identity replacement, malformed and partial output, truncation,
credential changes, installed-context admission, final input failure and naming
bounds. They failed first. Final validation passes 857 shared tests with 4,493
assertions, native Terraform typechecking, source Biome, three runtime builds
and dependency checks. The isolated runtime/integration/tracker suite passes
81 tests with 667 assertions.

A fresh actual Compute read uses native fetch, the installed runtime's selected
account and immutable ADC bytes. It retains an attributed notFound body for a
fresh probe name. The final private receipt SHA-256 is
`4735cbd45d5270af63613101f7257ae87c277cfcd01021c28f5cb85ab0855b94`.
No cloud resource was created. Earlier probes stopped on a shared credential
parent, an incorrectly selected default account and a shared config file; each
changed-input successor and its evidence remain private. Global gcloud settings
and permissions were unchanged.

This is cloud-read component evidence. Live serial and guest evidence,
apply-provider and original VM insert attribution, complete bootstrap/VPM and
exited-container capture, and the default controller remain incomplete. New GCP
Terraform apply remains refused. Original-provider refresh across expiry is a
separate gate; reader token refresh cannot substitute for it. All lifecycle,
networking, traffic, cleanup, ordinary installed runtime, review, CI, merge,
publication and published-installation gates remain open.
