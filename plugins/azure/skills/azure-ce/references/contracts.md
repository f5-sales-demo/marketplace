# Azure Customer Edge Provider Contract

The provider-neutral automation contract is published at
[`f5xc-ce-automation/v1`](https://f5-sales-demo.github.io/mcn/_llms-txt/en/customer-edge/automation-contract.txt).
`azure_compute_discover` retrieves that dedicated document, validates its identity and version,
and records its normalized SHA-256. This reference adds only Azure-specific requirements.

## Marketplace and compute discovery

- Enumerate publisher, offer, image SKU, and exact versions with `az vm image
  list-publishers`, `list-offers`, `list-skus`, and `list`. User-supplied values are
  constraints and must still be observed live. Reject `latest`.
- Validate Marketplace terms for the authenticated subscription. Keep legal acceptance
  separate from infrastructure apply.
- Enumerate subscription-aware VM SKU restrictions, NIC limits, zones, regional vCPU
  quota, Azure Policy denies, and image availability. Require at least 8 vCPUs, 32 GB
  memory, an 80 GB OS disk, and support for every requested NIC.
- Rank every AzureCloud physical region deterministically. Prefer three distinct zones
  for a three-node deployment and surface any regional fallback in the plan.

## Azure networking

- Keep the Azure NIC order identical on every VM. NIC 0 is SLO; NIC 1 is SLI when a
  second NIC exists. Resolve every greenfield or allowlisted brownfield subnet before
  planning.
- Use one Standard public IP per node for `public-ip`. For `nat-gateway`, `firewall`, or
  `proxy`, require the exact existing resource ID. Use firewall or proxy policy when
  strict FQDN egress is required; NSGs cannot express FQDN policy.
- Emit only explicitly requested application/VIP, management, intra-cluster, and
  platform-connectivity NSG rules. Surface broad CIDRs and management exposure.
- For single-node insertion, create explicit UDRs whose next hop is the CE data-plane
  private address.
- For eligible greenfield HA, use a dedicated `/26` `RouteServerSubnet` without an NSG
  or UDR, peer each CE node, and verify both Route Server instances, BGP sessions, and
  learned routes. Reject unsupported same-VNet brownfield insertion.
- Preserve the exact pre-change route-table, subnet association, and etag state for each
  allowlisted brownfield change.

## Azure operations and diagnostics

- Use Azure VM, NIC, provisioning, boot diagnostics, cloud-init, effective-route, NSG,
  Route Server, and Network Watcher evidence together with platform status.
- Treat VM Run Command and Network Watcher probes as active diagnostics and request
  their own approval. Return allowlisted states, counts, and digests rather than raw
  guest output, custom data, boot logs, or environment variables.
- During a three-node resize or replacement, operate one Azure VM at a time and check
  Azure provisioning, CE registration/health, BGP, routes, and traffic
  before advancing. Warn that a one-node VM or NIC change is disruptive.
- During teardown, restore Azure route tables and subnet associations before deleting
  resources tagged `xcsh-managed-by=azure-ce` for the approved deployment and plan.

## Authoritative Azure references

- [Azure VM SKU discovery](https://learn.microsoft.com/en-us/cli/azure/vm#az-vm-list-skus)
- [Azure Marketplace image discovery](https://learn.microsoft.com/en-us/azure/virtual-machines/linux/cli-ps-findimage)
- [Azure Route Server FAQ](https://learn.microsoft.com/en-us/azure/route-server/route-server-faq)
- [F5 Secure Mesh Site v2 on Azure](https://docs.cloud.f5.com/docs-v2/multi-cloud-network-connect/how-to/site-management/deploy-sms-az-clickops)
- [F5 CE registration and upgrade](https://docs.cloud.f5.com/docs-v2/multi-cloud-network-connect/reference/ce-reg-upg-ref)
