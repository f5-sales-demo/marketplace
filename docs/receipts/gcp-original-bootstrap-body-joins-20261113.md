# GCP original bootstrap body joins

Issue: #1559. Delivery: PR #1698. Full acceptance remains incomplete.

The Terraform bootstrap collector now has an explicit version 2 API for the
published xcsh 15.16.2 mapping. The original API retains its 15.15.7 profile and
schema 1 receipts. Existing deployments and cleanup receipts are not migrated.
The exact release source and registry artifact schema retain original creation
UID hashes, reject replacement identities and preserve historical null receipts.

A new source join binds a Platform GET to an original xcsh creation receipt,
the prepared scope and its issuing capture context. It checks the exact target,
owner, origin, credential hash, complete response, five-minute freshness and UID
hash. Copied reader results, copied HTTP bodies, different credentials, stale
evidence and replacement UIDs refuse. Private body access requires the original
issued join; a failed read permanently retires that access.

The version 3 pre-apply collector joins Site and Token bodies from the same
original creation result. It delegates JWT inspection to the issuing Platform
module while the owning Terraform apply remains busy. It starts no competing
state read. It requires owned labels, the supported GCP not-managed wire form,
the exact Site-bound token and fresh JWT claims. Serialized evidence contains no
JWT. Copies, foreign node or engine bindings, unsupported wire forms, foreign
labels and retirement remain refusals.

Focused tests use explicitly simulated executor and transport fixtures. The
compiled version 2 test exercises the real bundle boundary and keeps Platform
body authority in its issuer. Neither substitutes for normal installed execution
or live GCP acceptance. The earlier real shared-executor creation fixture remains
attributed to its own source and receipt.

The installed capture factory remains held. Original VM, NIC, insert and audit
joins, durable single-use checkout, same-provider refresh across expiry and guest
capture are still required. Fresh native and Terraform networking, lifecycle,
traffic, cleanup and restoration campaigns, ordinary Ubuntu `bun dev`, required
review/CI, publication and user installation remain separate acceptance gates.

Historical failures, locks, frozen collectors and immutable v12.3.1 assets remain
preserved. q12's exact failure cause remains unknown.
