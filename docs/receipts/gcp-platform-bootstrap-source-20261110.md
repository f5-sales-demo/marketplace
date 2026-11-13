# GCP Platform bootstrap source evidence

Issue: #1559. Delivery: draft PR #1698.

Shared Platform deployment storage now retains original HTTP response bytes for
the scoped site and token APIs. Each received chunk is synced to private storage
before the next read. Initial partial markers retain original file, directory,
owner and creator provenance. Completed and failed bodies are sealed with byte
digests and original file identities. Copied references, replacement files,
ownership changes and modified body capabilities refuse.

The recorder requires explicit site and token names. Collection reads and
foreign reads or creates stop before requests. Native HTTP capture runs before
response classification, so error, malformed, truncated and interrupted
responses retain their bounded bytes. Read, cancellation and persistence errors
remain failures. Raw tokens and response contents never appear in reference
summaries.

The existing strict JSON decoder is shared through Platform; legacy Terraform
imports remain compatible. Invalid UTF8 and duplicate or escaped identity keys
refuse. A stream rejecting an undefined value cannot become an accepted result.

Original site/token source bodies can be joined to exact engine, deployment,
site UID, token UID, node labels and site binding. JWT expiry is required for
fresh bootstrap admission. Private inspection can retain an original expired
token for diagnosis; shared durable single-use checkout still gates execution.
Metadata corroboration does not grant bootstrap or cloud execution authority.

Verification: failing-first transport, scope, identity, expiry and provenance
cases; all 19 focused regressions pass with 81 assertions. Three native
typechecks and runtime builds pass. The compiled Platform artifact performed two
scoped native HTTP source reads using the existing F5 sales-demo context,
retaining their original private response bodies with zero mutations.

All 1,345 shared and canonical tests pass with 33,991 assertions. Dependency,
manifest and source lint checks pass. Independent verification confirms the
compiled source probe's owned, sealed body/metadata joins and read-only scope.

Positive live site/token ownership mapping, original VM/token/NIC/lifetime
joins, full default installed capture, actual refresh across expiry and complete
native/Terraform lifecycle and installed/runtime/publication gates remain open.
