# Azure Customer Edge Provider Contract

The provider-neutral automation contract is published at
[`f5xc-ce-automation-policy/v2`](https://f5-sales-demo.github.io/mcn/_llms-txt/en/customer-edge/automation-contract.txt).
`azure_compute_discover` retrieves that dedicated document, validates its identity and version,
and records its normalized SHA-256. This reference adds only Azure-specific requirements.

## Marketplace and compute discovery

- Enumerate publisher, offer, image SKU, and exact versions with `az vm image
  list-publishers`, `list-offers`, `list-skus`, and `list`. User-supplied values are
  constraints and must still be observed live. Reject `latest`.
- Validate Marketplace terms for the authenticated subscription. For an initial Terraform
  deployment of the exact live-discovered F5 XC image only, Terraform signs the corresponding
  Marketplace agreement during apply before VM admission. Never use a CLI shell-out, mask a
  failure, accept a caller-supplied offer, or cancel the subscription-level agreement on teardown.
  Native deploys and Terraform replace/repair remain fail-closed until terms are accepted.
- Enumerate subscription-aware VM SKU restrictions, NIC limits, zones, regional vCPU
  quota, Azure Policy denies, and image availability. Require at least 8 vCPUs, 32 GB
  memory, an 80 GB OS disk, and support for every requested NIC.
- Rank every AzureCloud physical region deterministically. Prefer three distinct zones
  for a three-node deployment and surface any regional fallback in the plan.

## Azure networking

- Keep Azure attachment order identical on every VM, with exactly one SLO in slot 0.
  The planner accepts SLO/SLI order and the explicit three-NIC SLO/data/SLI order. In the
  [MCN marketplace layout](https://f5-sales-demo.github.io/mcn/en/customer-edge/interface-model/),
  cloud labels `mgmt`, `external`, and `internal` correspond to SLO, data, and SLI respectively.
  A cloud label `mgmt` does not enable the separate XC management network.
- Keep cloud resource names, attachment indices, XC roles, and guest device observations
  distinct. Discover SLI by its planned role and reciprocal VM/NIC resource identities, including
  slot 2 in the three-NIC layout. Do not construct guest interface names from attachment order.
  Resolve every greenfield or allowlisted brownfield subnet before planning.
- Use one Standard public IP per node for `public-ip`. For `nat-gateway`, `firewall`, or
  `proxy`, require the exact existing resource ID. Use firewall or proxy policy when
  strict FQDN egress is required; NSGs cannot express FQDN policy.
- Emit only explicitly requested application/VIP, management, intra-cluster, and
  platform-connectivity NSG rules. Surface broad CIDRs and management exposure.
- For single-node insertion, create explicit UDRs whose next hop is the CE data-plane
  private address.
- Route Server peering uses the observed SLO address. Explicit Route Server selection supports
  a single CE as well as the planner's HA topology; Route Server redundancy does not require
  selecting a three-node XC cluster. Use a dedicated `/26` `RouteServerSubnet` without an NSG
  or UDR, and separately verify both service addresses, BGP sessions, and learned routes.
  Reject unsupported same-VNet brownfield insertion.
- Three-NIC intent validation, role-based discovery, and Azure Terraform lifecycle execution have
  automated coverage. Fresh Azure native and Terraform acceptance remains pending; AWS receipts
  do not establish Azure runtime support or parity.
- Preserve the exact pre-change route-table, subnet association, and etag state for each
  allowlisted brownfield change.

## Azure operations and diagnostics

- Terraform Route Server translation creates the dedicated subnet, Standard public IP, Route
  Server, and one SLO-bound BGP connection per admitted CE. It exports the two computed Route
  Server service addresses and ASN for the later platform-routing stage; these outputs do not
  establish session or route health.
- Native and Terraform upgrades use the same verified action and fresh version evidence. Native
  execution persists the exact logical site identity before the request and reconciles an
  ambiguous response from platform convergence without replaying the mutation.
- `azure_ce_failover` preparation binds an exact node to fresh account, resource ID, immutable VM
  UUID, power state, region, and engine ownership evidence. Failover apply remains unavailable
  until the executable contract maps SLO BGP and the runtime collects both Route Server sessions,
  effective routes, and traffic through withdrawal and recovery. Never substitute a generic Azure
  VM power action for a Terraform-owned deployment.
- Use Azure VM, NIC, provisioning, boot diagnostics, cloud-init, effective-route, NSG,
  Route Server, and Network Watcher evidence together with platform status.
- Run VM Run Command and Network Watcher probes within the user's authorized diagnostic scope,
  preserving that authorization across resume. Return allowlisted states, counts, and digests rather than raw
  guest output, custom data, boot logs, or environment variables.
- During a three-node resize or replacement, operate one Azure VM at a time and check
  Azure provisioning, CE registration/health, BGP, routes, and traffic
  before advancing. Warn that a one-node VM or NIC change is disruptive.
- `azure_ce_teardown` drains owned platform listeners, origins, and routing before cloud mutation,
  revokes every live or checkpointed enrollment token, and deletes the exact logical site only
  after cloud retirement. Terraform targets come from the saved destroy plan and must remain
  inside the original live owned resource group. Native execution currently requires a greenfield
  teardown plan whose final action deletes that resource group, making group absence authoritative.

## Authoritative Azure references

- [Azure VM SKU discovery](https://learn.microsoft.com/en-us/cli/azure/vm#az-vm-list-skus)
- [Azure Marketplace image discovery](https://learn.microsoft.com/en-us/azure/virtual-machines/linux/cli-ps-findimage)
- [Azure Route Server FAQ](https://learn.microsoft.com/en-us/azure/route-server/route-server-faq)
- [F5 Secure Mesh Site v2 on Azure](https://docs.cloud.f5.com/docs-v2/multi-cloud-network-connect/how-to/site-management/deploy-sms-az-clickops)
- [F5 CE registration and upgrade](https://docs.cloud.f5.com/docs-v2/multi-cloud-network-connect/reference/ce-reg-upg-ref)
