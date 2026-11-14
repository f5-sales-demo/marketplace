# Reviewed GCP Terraform request reasons

Issue: [marketplace #1559](https://github.com/f5-sales-demo/marketplace/issues/1559).
Attempt: 411.

New public Terraform sessions now generate one opaque request reason before
preparing their configuration. A versioned private record binds that reason to
the original deployment intent. Its fingerprint joins the stored input identity;
the exact nonempty value appears in the Google provider configuration reviewed
by the saved plan. It contains no project, deployment or operator identity.
The supported mapping is pinned to Google 8.7.0.

Resumes reuse the stored reason. Replacement, omission, malformed identifiers,
unknown fields, changed intent or unsupported provider mappings refuse. Existing
sessions without a record preserve their original absence and configuration
bytes. The public runtime and session adapter clone caller inputs before awaits.
A failing-first regression demonstrated that storage acquisition could otherwise
change the original F5 context through a caller mutation; the clone fixes it.
No tool argument or user setting is added for this internal correlation value.

Four request-reason cases, original session resume and public-runtime regressions
pass. The focused run passes 14 tests and 62 assertions; the final shared run
passes 1,029 tests and 4,632 assertions. All three native TypeScript checks,
runtime builds and dependency checks pass. Initial module and fixture typing
failures remain retained. Shipped Python, frozen collectors and original receipts
are unchanged.

A fresh authenticated Terraform 1.16.6 / Google 8.7 source fixture used the
generated record and exact translated Google provider block. The standard runner
and original output capability retained 9,592 valid trace records and matched
the reviewed reason in the actual Google request header. Final no-change planning,
typed teardown, empty destroy, stable empty state and two non-submitting resumes
passed. Independent kernel and psutil checks verified all 26 groups absent.
The source receipt is
`cecb9fd7379c1d6ad4006903c5bf1f1a44adf9eb28623879a6a6cb6df1a3f119`.

The reviewed fixture allowed one local builtin create and one Google zones read,
with zero managed cloud resources or mutations. Its scope-only synthetic CE
fields and unused synthetic Platform fields were not applied. This qualifies the
source reason/provider/header contract; it does not establish installed-runtime,
CE creation or original insert acceptance. The reason provides correlation and
cannot authorize an RPC or resource incarnation. The default full capture
controller remains absent and ordinary GCP Terraform apply refuses before plan
consumption. Original provider/RPC/reviewed managed-resource action/create/audit/
numeric incarnation joins, full guest capture, every native/Terraform lifecycle,
networking, traffic and recovery gate, ordinary installed Ubuntu runtime,
review/CI/merge, qualified publication, downloads and published installation
remain required.
