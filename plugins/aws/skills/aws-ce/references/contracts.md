# AWS Customer Edge Provider Contract

The provider-neutral automation contract is published at
[`f5xc-ce-automation/v1`](https://f5-sales-demo.github.io/mcn/_llms-txt/en/customer-edge/automation-contract.txt).
`aws_compute_discover` retrieves the dedicated document, validates its identity/version, and
records its normalized SHA-256. This reference contains only AWS-specific requirements.

## Marketplace and compute discovery

- Authenticate with STS and enumerate every enabled and opted-out region in stable order.
- Resolve `/aws/service/marketplace/prod-wrwzhcymymama/latest` in each enabled region and pin its
  returned AMI ID and SSM parameter version. Validate Marketplace ownership/product code,
  architecture, state/deprecation, Allowed AMI policy, root disk, and launch permission.
- Check active purchase agreements with AWS Marketplace Agreement Service. Never automate initial
  legal acceptance; provide the exact Marketplace console action, then rediscover and replan.
- Rank AMI availability, requested instance/AZ offerings, ENI limits, and minimum 8 vCPU/32 GiB/100 GiB root disk. The launch plan must override the Marketplace AMI root mapping to 100 GiB or larger; the current 79 GiB image default is boot-only and is not upgrade-safe.
  regional vCPU quota, permissions/policy evidence, TGW availability, and brownfield proximity.

## AWS networking

- Keep ENI and VRF order symmetric across nodes: ENI 0 is SLO and ENI 1 is SLI when present.
- For EIP egress allocate and associate one address per node. NAT Gateway, firewall, and proxy
  modes require exact allowlisted existing identifiers and their observed route/policy behavior.
- `direct-eni` uses explicit VPC routes to the single node's SLI ENI.
- `nlb-ingress` uses three AZs, IP targets, health checks, and explicit cross-zone behavior. An NLB
  is ingress only and is never modeled as a VPC or TGW route next hop.
- `tgw-static` uses an appliance-mode VPC attachment, explicit TGW route tables, associations,
  propagations, TGW routes, and CE SLI ENI routes.
- `tgw-connect` uses an appliance-mode transport attachment, GRE on SLI, one Connect peer per node,
  two AWS-managed BGP sessions per peer, deterministic non-overlapping `/29` inside CIDRs, valid
  distinct ASNs, explicit propagation, and three-zone symmetry. Enable it only with current F5
  documentation and an explicit tenant capability schema.

## AWS operations and diagnostics

- Correlate EC2 status/boot, ENIs, security groups, route tables, NLB targets, TGW attachments,
  Connect peers/BGP, and platform registration/health/routing evidence.
- Treat SSM probes as active diagnostics and request separate approval. Return allowlisted states,
  counts, and digests; withhold console output, user data, SSM output, tokens, and environment data.
- Operate a three-node lifecycle one node at a time and gate EC2 state, registration, F5 health,
  BGP, NLB/TGW routes, and traffic before advancing. Warn that single-node disruption requires a
  maintenance window.
- Teardown restores allowlisted route tables and TGW association/propagation state before deleting
  only resources bearing the exact `xcsh-managed-by=aws-ce`, deployment, and plan tags.

## Authoritative AWS references

- [F5 Secure Mesh Site v2 on AWS](https://docs.cloud.f5.com/docs-v2/multi-cloud-network-connect/how-to/site-management/deploy-sms-aws-clickops)
- [AWS Marketplace public parameters](https://docs.aws.amazon.com/systems-manager/latest/userguide/parameter-store-public-parameters.html)
- [Allowed AMIs](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/allowed-amis.html)
- [Marketplace Agreement Service](https://docs.aws.amazon.com/marketplace/latest/userguide/programmatically-accessing-agreement-details.html)
- [Transit Gateway Connect](https://docs.aws.amazon.com/vpc/latest/tgw/tgw-connect.html)
