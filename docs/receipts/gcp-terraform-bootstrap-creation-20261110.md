# GCP Terraform bootstrap creation evidence

Issue: #1559. Delivery: draft PR #1698.

Terraform plugin 2.4.71 adds a compiled bootstrap collector that reads the shared
runner's original applied state through restricted field selections. Site and
Token ownership joins use the SHA-256 of each original API resource UID. JWT
token `uid` contains a sensitive registration credential and cannot supply the
resource identity; neither `uid` nor `content` is selected from Terraform state.
The JWT remains in original private HTTP evidence and source-bound inspection.

The collector requires every declared deployment, engine and node label. It
also verifies F5's exact Google provider marker and the observed GCP not-managed
Site wire form. Unknown provider profiles, managed or malformed wire forms,
foreign labels, replaced identities, stale plans and missing creation hashes
refuse. Original HTTP capabilities and five-minute freshness checks remain.
Two restricted state reads must agree throughout collection. JWT freshness is
checked again after the final state read.

A disposable two-resource API campaign created one owned GCP Site and one JWT
Token through a separately reviewed saved plan using Terraform 1.17.1, Google
8.11.0 and xcsh provider 15.15.7. Fresh official release metadata confirmed these
versions remained current. No CE VM or GCP managed resource was created.

The first field qualification failed because the API adds a Google provider
label that Terraform excludes from user-owned labels. Both original creation
hashes matched the API UIDs. The latest provider's immutable source confirms its
owned-label filtering. The original failed driver and capture remain preserved.
A cleanup-only successor retained positive private metadata and GCP wire joins;
it did not submit another create or clear the failed qualification.

Independent cleanup verifies both API objects absent, an empty typed destroy,
stable empty state, two resumes without submission and 25 original executor
groups absent. No new unresolved locks remain. Original failed and historical
evidence remains unchanged. The positive metadata receipt has SHA-256
`61c7a3795f23a1b5f5c14fe58c47a1c1c4714e4a31d874a5488929e77297a698`;
independent closure has SHA-256
`b9338a596ac5a9029409459325cbd069b2527cc0f238b9a59beddf55de73697c`.

Eight failing-first collector regressions pass, including state replacement and
JWT freshness during final collection. The compiled runtime test now supplies
only an explicit CLI-presence response and rejects every other process request,
so registration and wrong-engine refusal checks also run without a real cloud
CLI. The standard repository test entrypoint includes this regression.

This evidence does not qualify bootstrap execution. The changed collector needs
fresh live composition and post-create no-change planning. Original VM, token,
NIC and lifetime joins, shared durable single-use checkout, Google 8.11 managed
insert qualification, default installed capture, actual refresh across expiry,
full native/Terraform live behavior, ordinary installed runtime and delivery
gates remain open. Historical publication holds and immutable v12.3.1 remain.
