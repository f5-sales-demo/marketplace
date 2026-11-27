# Installed host-key consistency mapping

Issue: [marketplace #1559](https://github.com/f5-sales-demo/marketplace/issues/1559).
PR: [#1698](https://github.com/f5-sales-demo/marketplace/pull/1698), retained as draft.

Terraform 2.4.124 ships the host-key consistency parser through its original
installed source pins. The mapping checks complete SSH wire keys, SHA256
fingerprints, supported cloud-init generation/randomart and final-section
framing. Contradictory, malformed, stale or incomplete evidence refuses.
New pin artifacts never replace existing pins and grant no live or release
qualification. Caller-supplied receipts cannot establish original VM provenance.

Synthetic tests use independently generated OpenSSH keys. Exact refusal messages
come from the frozen validator; historical captures are excluded from published
tests. The frozen source remains byte-identical, with SHA256
`99c3587b3c09a89b9dfcdb7523daa7f7003f46c551713894d7214d78e8280fac`.

Failing-first tests exposed missing installed mapping, integer-form and
out-of-range numeric VM IDs, and timestamp overflow. The new parser requires
canonical uint64 strings and finite JSON-number clocks. Existing timestamp
and ownership bindings remain required; no freshness window is renewed.

Verification passed: 50 parser checks and 218 subtests, 78 guest regressions,
52 capture/source-admission checks, 99 shared/observer-plan checks, strict
Python and Terraform types, lint and all three runtime bundles. The source
fixture was extended to include the new shipped module; missing or changed
parser bytes explicitly refuse. Port-formatting failures and fixture omissions
remain retained as private evidence.

Catalog/tracker, privacy, normal hooks and exact-head CI remain separate gates.
The original-serial/key-scan consumer and built-in capture factory still require
qualification. Real provider refresh, fresh SSH/VPM/container evidence and every
original live networking/lifecycle/traffic/recovery/cleanup/restoration gate
remain open, followed by installed runtime, review, merge and publication.
Frozen collectors, historical locks and immutable v12.3.1 assets are preserved.
