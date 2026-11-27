# Current installed GCP runtime acceptance

The current candidate passed supported marketplace installation and a fresh
ordinary Ubuntu `bun dev` session for Google Cloud Platform (GCP) issue
[#1559](https://github.com/f5-sales-demo/marketplace/issues/1559).
Deployment, complete guest capture and the full lifecycle acceptance remain
unfinished. Delivery remains in draft
[PR #1698](https://github.com/f5-sales-demo/marketplace/pull/1698).

## Candidate and installation

Marketplace source `d69661ba386740c8b921f72508697b48d4ba52ab` was installed
through the supported command-line interface into a distinct acceptance catalog.
All 834 installed plugin files matched committed source. Platform installed
automatically as GCloud's dependency; Terraform stayed optional and was then
installed explicitly. All 11 doctor checks passed, and all three integrations
reported ready. The held factory was excluded from the snapshot.

| Component | Version or source |
| --- | --- |
| GCloud | 1.7.73 |
| Platform | 6.3.33 |
| Terraform plugin | 2.4.169 |
| xcsh | 23.10.19, source `f8259574608a2a1172cb758109ca34854fed6586` |
| Bun | 1.4.4 |

## Registered runtime results

The existing task-owned terminal ran ordinary `bun dev` with the configured
model, installed plugins and an isolated session directory. It used neither
`--plugin-dir` nor a private plugin interface or fetch adapter. The saved session
records the installed GCloud skill and its provider/acceptance references.

One registered `gcp_project_identity` call succeeded. Exactly two registered
`gcp_ce_plan` calls used the original supplied parameters, as independently
verified from saved tool calls and results. The historical image was readiness
input only. Neither request included an outer operation.

| Readiness request | Selected engine | Executable | Actions | Approval |
| --- | --- | --- | --- | --- |
| Outer engine omitted | native | false | empty | not-requested |
| Explicit Terraform | terraform | false | empty | not-requested |

Both calls reported unqualified executable GCP mappings, unavailable shared
Platform runtime, unverified funding/license acceptance, unreserved capacity
and unqualified routing/return paths. Terraform also reported its shared GCP
runner unavailable. These explicit refusals remain acceptance blockers.

The model turn completed before a single normal `/exit`. The launcher returned
code 0. Independent reads verified three original runtime process identities
and both process groups absent. Model, profile and original empty-owner lock
hashes remained unchanged. No signal, approval or cloud mutation occurred.

## Evidence and remaining work

The private archive retains installation bytes, original transcripts, tool
results, independent closure evidence and the failed preliminary transcript
checker. All 884 archived files passed independent hash verification. Archive
SHA-256:
`a67b2846f0f4d7ee4e4cce8b617760981228094ec52d41ebd01e085b5779bceb`.

This completes the current installed readiness and ordinary runtime gate. It
does not qualify deployment or guest behavior. Complete assembled factory
before/final capture and same-original-provider renewal across real expiry;
then qualify native and Terraform single-node and three-node lifecycle,
networking, content-verified traffic, recovery timing and independent cleanup.
Review, passing continuous integration, merge, publication and published
installation remain required. Frozen captures, historical failures, unresolved
locks and immutable v12.3.1 assets remain preserved.
