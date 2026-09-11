# Azure Terraform foundation contract

The Azure Terraform foundation translates a verified schema-v3 Terraform deployment
plan into network and compute configuration. It uses Terraform 1.16.1, AzureRM 5.4.0,
and TLS 4.4.0 with the packaged provider lock. The generic Terraform plugin owns
execution, deployment storage, saved plans, and backend locking.

This stage currently requires AzureCloud, a new resource group, greenfield subnets,
and public SLO egress. It supports one-node and three-node HA sites, including the
explicit SLO/data/SLI attachment order. It can render the planned RouteServerSubnet
without associating an NSG or route table. Public execution rejects Route Server
plans before opening Terraform until the pinned platform contract supplies an
executable SLO BGP mapping and two-session convergence evidence. It also rejects
greenfield UDR destinations without explicit `routeChanges` that identify the target
subnet association, avoiding an unattached route table that would require manual repair.

An optional `workloadFixture` is available only for an initial Terraform Route Server
deployment that needs a private workload prefix for routing acceptance. It creates an
isolated subnet, static private NIC, and small Ubuntu HTTP-service VM without a public IP.
Its CIDR must be exactly one planned Route Server destination and must not overlap a CE
NIC subnet; the approved fixture is `10.253.0.0/24` with `10.253.0.4:8080`. It is a
private routing probe, not a substitute for public VIP traffic, ingress, or origin-health
evidence.

An empty admission map creates networking only. Compute admission requires retrieved
platform cloud-init for every node of an HA site. The foundation consumes that
material without generating a replacement bootstrap payload. It pins the observed
Marketplace image version and plan, uses a 100 GB managed OS disk, enables NIC IP
forwarding, disables accelerated networking, and generates per-node RSA SSH keys
with password authentication disabled. These are explicit foundation defaults.
For an initial Terraform deployment only, the same idempotent `terraform apply` signs an
unaccepted exact observed F5 XC Marketplace plan through the pinned AzAPI apply-only action before
any VM can be admitted. The action uses the immutable subscription, publisher, offer, and plan from
discovery; it never accepts caller-supplied or generic offers. No human acceptance, Azure CLI
command, separate authorization, manual state action, import, taint, rediscovery, or replan is
needed for that exact transition. Terraform destroy removes only this action's state and never
cancels the subscription-level Marketplace agreement. Native deployment, Terraform replacement,
and repair remain fail-closed when terms are unaccepted.

Rendered configuration, binary plans, and state are sensitive deployment artifacts.
Generated private keys remain in Terraform state and are not exported as outputs.
Outputs contain resource locators; the interface collector verifies current Azure
VM UUIDs, NIC attachments, MACs, addresses, ownership, and subnet identities before
they can inform platform configuration. Cloud attachment order does not establish
guest device names. Missing post-attachment observations remain unavailable.

The configuration has passed provider-backed Terraform validation for one-node and
three-node HA foundation fixtures. Registration staging is executable only when the
pinned contract verifies Azure headless bootstrap. Route Server and routing execution require
the pinned contract to supply an executable SLO BGP mapping and observed two-session convergence;
the implementation and automated coverage do not establish Azure live acceptance. Azure live
no-change acceptance remains unproven. Reference behavior comes from
the [MCN CE guide](https://f5-sales-demo.github.io/mcn/en/customer-edge/smsv2/)
and the pinned [AzureRM VM contract](https://registry.terraform.io/providers/hashicorp/azurerm/5.4.0/docs/resources/linux_virtual_machine).
