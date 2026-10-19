# GCP provider contract

The public Terraform deployment adapter uses configuration version 2 with an
explicitly managed boot disk. Its overall review binds the isolated saved binary,
configuration, backend, provider lock, F5 context name and actual API endpoint,
and prerequisite receipts. Endpoint changes are rejected before deployment or
cleanup; credentials may rotate at the original endpoint.
Only the exact `approvedPlanHash` authorizes submission. Resume inspects consumed
attempts, verifies the original executor stopped, compares cloud numeric identities
and XC original creation hashes, and requires an exact no-op follow-up for a
complete outcome. Completion binds the stable state snapshot used for no-op verification. Resumed
completion rechecks that exact snapshot and the original live identities; lost
or changed state requires reconciliation without another submission.
Partial ownership requires a separate delete-only cleanup review
bound to the original attempt and stable state. Missing state or replacement
identities require reconciliation. Cleanup remains available without billing access
and finishes only after an empty destroy plan, a matching final state snapshot,
and eight independent absence checks.
Legacy stored configurations retain their existing teardown behavior. Enabling
this adapter uses the published and installed-qualified XC v15.13.0 provider,
Terraform 1.16.6, Google 8.7.0 and the verified lock for Darwin ARM64 and Linux AMD64.
Fresh public single-node deployment, interrupted recovery and partial cleanup
campaigns passed; see
[the source-bound receipt](../../../../../docs/receipts/gcp-public-terraform-deployment-20261019.md).

The consumer verifies the immutable `api-specs-enriched` v12.1.3 contract asset
against SHA-256 `ae71bf8f1d69bb248f21a664bfec974c322188b6e17755c245d20d24e1e0e6bc`.
It declares GCP schema mappings and observational registration/interface joins,
with single-node boot, registration and physical interface evidence for both
engines. Public native single-node deployment has a reviewed plan/apply candidate,
with fresh isolated installed/live review, apply, healthy observations and typed
teardown passing on the narrow disposable profile. Publication remains pending.
Terraform deployment and broader
lifecycle tools remain unavailable; narrow
teardown qualification is recorded below. The readiness plan
binds the current verified `f5xc-ce-automation-policy/v2` receipt when available;
it contains zero executable actions and requests no approval. Explicit native
`operation=deploy` instead saves an overall reviewed plan that binds exact intent,
translation, immutable contract, current policy, server-collected preflight,
corporate funding and BYOL authorization. Apply refuses changed bindings and
persists authorization across original asynchronous-operation reconciliation.
Completed journal resources support partial native cleanup; ambiguous creation
requires exact outcome reconciliation. Neither path infers routing or traffic.

Shared Platform CE service and Terraform runner work is tracked by marketplace
issue #1326 and draft PR #1327. GCP must reuse restricted storage, authorization,
checkpoints, restoration inventory and ownership. Do not copy AWS/Azure wire
schemas, synthesize provider fields, or enable mutation based on declaration alone.

Image discovery uses `f5-7626-networks-public` with `--no-standard-images` and no
limit. Only ready x86 images with exact image and license identities qualify as
candidates. A candidate is not a supported boot/registration receipt. Billing,
enabled APIs, machine inventory and region quotas are observations; permissions,
organization policy, zone capacity and machine NIC limits remain independent gates.

Readiness planning collects live IAM, project/regional quota, effective organization
policies, zone availability and exact image/license responses for the qualified
single-node, two-interface `n2-standard-8` profile. Plans bind the sanitized source
hashes and collection time to their intent. Missing, stale, conditional or ambiguous
evidence remains unavailable. An observed UP zone does not reserve capacity, and
`chargesUseFee=false` does not establish Marketplace acceptance.

Requested future profiles are external IP/Cloud NAT and explicit firewall/proxy
egress; static insertion; internal passthrough LB ingress and next-hop routing;
NCC router appliance/Cloud Router BGP only with verified F5 mappings. Each profile
requires cloud, interface, routing, return-path and application evidence.

API-only qualification on 2026-10-18 accepted GCP site configuration and a
site-bound JWT, but `provider=gcp` cloud-init returned only a token placeholder.
The response is not a usable image bootstrap template. Placeholder-only material
must be rejected before VM creation. The separate guide-backed `user-data`
bootstrap candidate passed disposable single-node boot and registration with the
exact F5 image for native and Terraform engines. This evidence does not enable
public deployment tools. Owned probe and qualification objects were deleted and
independently verified absent.

Full-window native and shared Terraform runner campaigns subsequently observed
the expected node in `PROVISIONED` global health after initial software and OS
convergence. These private campaign receipts extend the published boot evidence;
v12.1.3 publishes read-only global-health observation with the exact node join,
state enum and sanitized native/shared-runner evidence. Global health establishes neither
routing nor application traffic. HA, explicit upgrade operations, replacement,
repair, failover and route/application recovery within 120 seconds still require
their own installed and live acceptance.

The v12.1.3 single-node lifecycle profile records exact site creation and
site-bound bootstrap mappings for one node and two interfaces. Consumers must
qualify their execution runtime before enabling mutation. HA, routing and explicit
upgrade operations remain unqualified.

The native teardown consumer binds a saved review to the immutable release,
current policy, persisted intent, six exact disposable cloud resource identities
and the owned XC site/token identities. It rechecks every identity before cloud
deletion and records durable authorization for interruption recovery. Final
evidence requires fresh cloud, site and token absence. Its installed runtime was
qualified against synthetic Compute identities and live disposable XC objects;
a later fresh installed campaign passed native live cloud teardown and eight
independent absence checks on the same narrow disposable single-node profile.
Terraform ownership projections select exact nested disk/NIC identities and array
counts while rejecting sensitive provider fields. A preserved live-plan replay
passes with the rebuilt installed runner; fresh live typed Terraform teardown
also passed without fallback, including final empty destroy and eight independent
absence checks on the narrow disposable profile. Full parity remains unqualified.

Marketplace consent uses the Google Cloud SDK's Consumer Procurement v1alpha1
project consent `check` and `grant` methods. Grant dry runs validate the exact
agreement document; a grant is followed by an independent current-consent check.
Image/license IDs, the license billing service and project number bind the review.
Lost grants are reconciled without blind resubmission. Existing consent references
can be discovered with pagination; absent or ambiguous offer/document mappings
remain unavailable. Purchases and billing-account orders are outside this flow.
The initial installed live probe encountered `SERVICE_DISABLED`; explicit API
enablement then returned `UREQ_TOS_NOT_ACCEPTED` for Google's prerequisite cloud
terms. After console acceptance, scoped API enablement succeeded and Service
Usage confirmed `ENABLED`. Subsequent project consent inspection returned
`Method not found.` The consumer reports this as `method_unavailable`, without
exposing raw provider responses. No Marketplace consent was granted. Successful
live grant and its use as a deployment prerequisite remain unqualified.

The Terraform teardown candidate uses the owning shared runner and exact saved
binary. Original site UID and token identity hash are recorded only after the
runner attests that the exact creation plan completed. The token provider's `uid`
contains sensitive bootstrap material and is excluded from ownership projection.
Only named nonsensitive state fields are selected for the destroy review, and
live cloud/Platform identities are rechecked before application. Stored session
inputs preserve provider locks, context and engine across resume. Lost applies
require independent absence evidence; partial outcomes never authorize blind
reapplication. Final reconciliation requires a current empty destroy plan.
Fresh installed live typed teardown passed on the narrow disposable single-node
profile. Other topologies and full lifecycle parity remain unqualified.

The pinned BYOL VM has a separate evidence-backed terms profile in
`byol-vm-contract.json`. It fixes publisher image ID, license ID/code, billing
service and Google Marketplace/F5 Platform document hashes. Exact reviewed
access/use authorization is persisted in restricted deployment storage and
revalidated against the intent, engine, F5 context, documents and corporate
funding before billable execution. It makes no procurement grant and acquires
no software license. Corporate funding classification comes from the user's
explicit confirmation; scoped live identity, organization and billing reads
verify the unchanged association. Neither engine switches billing or creates
payment methods to resolve failures. Deletion can proceed without funding access.

The shared runner can privately project explicitly selected nonsensitive fields
from applied state. The projection binds the original saved-plan receipt,
backend, configuration, provider lock, state digest, lineage and serial. It
rejects changed snapshots, sensitive ancestors/leaves, duplicate resource
identities and addresses outside the reviewed plan. GCP creation ownership also
checks exact cloud identities, boot-disk retention and ordered NIC links before
recording the durable ledger. This adapter supports the qualified single-node public Terraform deployment
and original-attempt recovery paths.

Interrupted-apply inspection uses the same restricted projection and exact saved
receipt. It returns the recorded applying/applied phase, including missing state
resources, without marking success or submitting another apply. Owning adapters
must persist independently verified outcome evidence before reconciliation.

HA candidate ownership enumerates every VM, separately managed boot disk and
node-bound token, deduplicates shared networks/subnets, and compares each node's
exact zone, disk and ordered NIC identities. A three-node site with two shared
VPCs has eighteen configured objects, including four guide-required interface firewall rules. Read-only preflight checks every zone and
requires total CPU, disk and external-address quota; it does not reserve capacity.
The pinned global-health endpoint returns one node hostname and declares no node
selector. It cannot establish health for the other HA nodes. Public admission
remains single-node pending
[the HA contract qualification](https://github.com/f5-sales-demo/api-specs-enriched/issues/1951)
and fresh installed/live evidence.
