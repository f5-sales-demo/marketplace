# GCP provider contract

The consumer verifies the immutable `api-specs-enriched` v12.0.10 contract asset
against SHA-256 `2dd4d33693c9e228bfb304d7558a2f50ca9cc0146407f8fb9b5f0ca7d7c56f3c`.
That release declares AWS, Azure and KVM. GCP has no qualified executable mapping.
The readiness plan names `f5xc-ce-automation-policy/v2` but cannot bind a verified
policy release yet; it contains zero executable actions and requests no approval.

Shared Platform CE service and Terraform runner work is tracked by marketplace
#1326 and draft #1327. GCP must reuse restricted storage, authorization,
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
