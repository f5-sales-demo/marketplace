# Azure CE Contracts

## Determinism

- Research current official guidance from F5 and Microsoft before live discovery.
  A recommendation requires both retrieved official sources and an
  `azure-cli-live` discovery receipt; neither model memory nor a prior session is an
  observation.
- Enumerate the Marketplace publisher, offer, image SKU, and versions using
  `az vm image list-publishers`, `list-offers`, `list-skus`, and `list`. Treat
  user-supplied values only as constraints that must be observed live.
- Treat identical normalized intent and observations as byte-identical input to the
  canonical plan, SHA-256, and ordered argv actions.
- Pin the exact Marketplace publisher, offer, plan, and image version. Reject
  `latest`.
- Apply only a plan persisted in the current xcsh session whose ID and SHA-256 both
  match. Reject changed image, terms, SKU restrictions, NIC limits, zones, quota,
  policy, route, etag, subscription, or ownership observations before mutation.

## Topology and Networking

- Use one node when HA is disabled and three symmetric nodes when HA is enabled.
- Keep NIC count, index, role, subnet, and VRF symmetric across HA nodes. Use SLO as
  NIC 0 and SLI as NIC 1 when a second NIC exists. Require 1–8 unique subnets and an
  observed VM NIC limit at least as large as the request.
- Require at least 8 vCPUs, 32 GB memory, and an 80 GB OS disk for every node.
- Prefer three distinct zones for HA. Put any approved zone fallback in plan warnings.
- Use a dedicated `/26` `RouteServerSubnet` without an NSG or UDR for eligible
  greenfield HA. Peer every CE node and verify both Route Server instances and learned
  routes. Reject unsupported same-VNet brownfield insertion.
- Use explicit UDRs with the CE data-plane private address for a single node. Modify
  only named brownfield route-table associations and routes from the plan; preserve
  their exact restoration state.

## Egress and Security

- Default to one Standard public IP per node. Allow only an explicitly selected NAT
  Gateway, firewall, or proxy resource for other egress modes.
- Use a firewall or proxy for strict FQDN egress. An NSG cannot express FQDN policy.
- Generate only application/VIP, management, intra-cluster, and platform-connectivity
  rules. Make broad CIDRs or management exposure visible approval warnings.

## Ownership

- Tag only created resources with `xcsh-managed-by=azure-ce`, the deployment ID, and
  the exact plan SHA-256.
- Never adopt or delete a pre-existing resource. Permit brownfield mutation only for
  an exact resource, association, and route present in the approved plan.

## Secret Boundary

- Treat `f5xc-ce://<session>/<id>` as opaque. Never pass bootstrap token bytes through
  a tool parameter/result, model message, plan, YAML export, argv, tag, log, artifact,
  or checkpoint.
- Checkout one token per node just in time. The Azure tool validates session, owner,
  file mode, digest, expiry, and single use, atomically consumes it, and deletes it.
- Fail closed in headless mode when only interactive console checkout is available.

## Mutation Gates

- In interactive mode, confirm apply, Marketplace terms, active diagnostics, and
  teardown separately.
- In headless mode, require the exact plan hash and
  `XCSH_AZURE_CE_HEADLESS_MUTATIONS=1`.
- Also require `XCSH_AZURE_CE_ACCEPT_MARKETPLACE_TERMS=1` for terms and
  `XCSH_AZURE_CE_ALLOW_DESTROY=1` for destructive operations.

## Authoritative references

- [Azure VM SKU discovery](https://learn.microsoft.com/en-us/cli/azure/vm#az-vm-list-skus)
- [Azure Marketplace image discovery](https://learn.microsoft.com/en-us/azure/virtual-machines/linux/cli-ps-findimage)
- [Azure Route Server FAQ](https://learn.microsoft.com/en-us/azure/route-server/route-server-faq)
- [F5 Secure Mesh Site v2 on Azure](https://docs.cloud.f5.com/docs-v2/multi-cloud-network-connect/how-to/site-management/deploy-sms-az-clickops)
- [F5 Secure Mesh Site v2 deployment](https://docs.cloud.f5.com/docs-v2/multi-cloud-network-connect/how-to/site-management/create-secure-mesh-site-v2)
- [F5 CE registration and upgrade](https://docs.cloud.f5.com/docs-v2/multi-cloud-network-connect/reference/ce-reg-upg-ref)
