# GCP provider contract

The consumer verifies the immutable `api-specs-enriched` v12.1.1 contract asset
against SHA-256 `93c430e884be34fb80de9e572e1aa6dddbb1e804df65867b9479cb77660c0f16`.
It declares GCP schema mappings and observational registration/interface joins,
with single-node boot, registration and physical interface evidence for both
engines. Its GCP executable capabilities remain unavailable. The readiness plan
binds the current verified `f5xc-ce-automation-policy/v2` receipt when available;
it contains zero executable actions and requests no approval.

Shared Platform CE service and Terraform runner work is tracked by marketplace
issue #1326 and draft PR #1327. GCP must reuse restricted storage, authorization,
checkpoints, restoration inventory and ownership. Do not copy AWS/Azure wire
schemas, synthesize provider fields, or enable mutation based on declaration alone.

Image discovery uses `f5-7626-networks-public` with `--no-standard-images` and no
limit. Only ready x86 images with exact image and license identities qualify as
candidates. A candidate is not a supported boot/registration receipt. Billing,
enabled APIs, machine inventory and region quotas are observations; permissions,
organization policy, zone capacity and machine NIC limits remain independent gates.

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
v12.1.1 does not yet publish health acceptance. Global health establishes neither
routing nor application traffic. HA, explicit upgrade operations, replacement,
repair, failover and route/application recovery within 120 seconds still require
their own installed and live acceptance.
