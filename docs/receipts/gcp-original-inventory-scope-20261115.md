# Original plan-bound GCP inventory scope

Issue #1559 remains incomplete. Terraform 2.4.103 adds a source-issued inventory
scope that joins the active owning runner projection with its persisted validated
GCP deployment intent. It supplies no execution authorization.

The scope uses the existing public Terraform cloud and Platform mappings. The
single-node graph has eight resources: six Compute and two Platform objects.
The HA observer graph has 21: 17 Compute and four Site/Token objects. Observer VM,
disk and SSH firewall identities remain distinct from CE nodes. No resource
counts, names or identities are guessed from caller flags.

Every managed plan address must match the expected resource type, known name,
original project, regional or zonal identity, and system namespace where required.
Initial creation must be exact; extra or missing resources, replacements,
unknown names and foreign Platform names refuse. Unsupported resource mappings
remain explicit blockers. This initial deployment mapping does not substitute
for existing-Site replacement or other lifecycle evidence.

The original input file, configuration and provider lock hashes bind the intent
and plan. A private input monitor rechecks immutable file and parent identities;
observed replacement remains refused after byte restoration. Cached preparation
also checks the supplied store and cannot ignore a different owner. Source-issued
scope references and their context binding refuse copied or fabricated packets.
Read-only final inspection can retain original inputs after operation expiry,
while the operation check continues to reject the expired budget. It neither
renews the scope nor grants release authority.

Tests use actual owning runner projections and shared storage with offline
execution fixtures. They cover both complete graphs, wrong and missing resources,
identity and namespace changes, unknown values, replacement actions, input
replacement/restoration, expired operation inspection and cached owner changes.
Compiled tests reject fabricated scope packets before exposing targets. These
checks do not prove a live deployment or guest/network acceptance.

Full factory composition, independent initial absence capture, original insertion,
cloud/serial/guest evidence, closure/cleanup/restoration, all native/Terraform
networking and lifecycle acceptance, remaining installed checks, review/CI/merge,
qualified publication and supported user installation remain required.

Validation passed 546 shared Terraform tests across 55 files and eleven compiled
bridge/runtime checks, strict Terraform typecheck, three bundles, catalog and
supported tracker update. Earlier inventory and callback-lifetime source has
passing hosted CI; this changed scope source requires its own fresh CI.
Historical runner tests containing process-signal cases remain a required gate.
