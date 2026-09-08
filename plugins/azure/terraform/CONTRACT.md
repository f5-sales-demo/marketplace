The Azure Terraform foundation translates a verified schema-v3 Terraform deployment
plan into network and compute configuration. It uses Terraform 1.16.1, AzureRM 5.4.0,
and TLS 4.4.0 with the packaged provider lock. The generic Terraform plugin owns
execution, deployment storage, saved plans, and backend locking.

This stage currently requires AzureCloud, a new resource group, greenfield subnets,
and public SLO egress. It supports one-node and three-node HA sites, including the
explicit SLO/data/SLI attachment order. It reserves the planned RouteServerSubnet
without associating an NSG or route table. Route Server deployment, peering, UDRs,
registration, and lifecycle orchestration are subsequent stages; the public Azure
Terraform lifecycle adapter remains incomplete.

An empty admission map creates networking only. Compute admission requires retrieved
platform cloud-init for every node of an HA site. The foundation consumes that
material without generating a replacement bootstrap payload. It pins the observed
Marketplace image version and plan, uses a 100 GB managed OS disk, enables NIC IP
forwarding, disables accelerated networking, and generates per-node RSA SSH keys
with password authentication disabled. These are explicit foundation defaults.
Marketplace terms must already be accepted; this module does not accept them.

Rendered configuration, binary plans, and state are sensitive deployment artifacts.
Generated private keys remain in Terraform state and are not exported as outputs.
Outputs contain resource locators; the interface collector verifies current Azure
VM UUIDs, NIC attachments, MACs, addresses, ownership, and subnet identities before
they can inform platform configuration. Cloud attachment order does not establish
guest device names. Missing post-attachment observations remain unavailable.

The configuration has passed provider-backed Terraform validation for one-node and
three-node HA fixtures. This is not Azure live acceptance or proof of final no-change
convergence. Reference behavior comes from the [MCN CE guide](https://f5-sales-demo.github.io/mcn/en/customer-edge/smsv2/)
and the pinned [AzureRM VM contract](https://registry.terraform.io/providers/hashicorp/azurerm/5.4.0/docs/resources/linux_virtual_machine).
