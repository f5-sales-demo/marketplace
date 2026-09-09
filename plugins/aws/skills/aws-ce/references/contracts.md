# AWS Customer Edge Provider Contract

The provider-neutral automation contract is published at
[`f5xc-ce-automation-policy/v2`](https://f5-sales-demo.github.io/mcn/_llms-txt/en/customer-edge/automation-contract.txt).
`aws_compute_discover` retrieves the dedicated document, validates its identity/version, and
records its normalized SHA-256. This reference contains only AWS-specific requirements.

## Marketplace and compute discovery

- Authenticate with STS and enumerate every enabled and opted-out region in stable order.
- Resolve `/aws/service/marketplace/prod-wrwzhcymymama/latest` in each enabled region and pin its
  returned AMI ID and SSM parameter version. Validate Marketplace ownership/product code,
  architecture, state/deprecation, Allowed AMI policy, root disk, and launch permission.
- Check active purchase agreements with AWS Marketplace Agreement Service. Never automate initial
  legal acceptance; provide the exact Marketplace console action, then rediscover and replan.
- Rank AMI availability, requested instance/AZ offerings, ENI limits, regional vCPU quota,
  permissions/policy evidence, TGW availability, and brownfield proximity. The CE planner requires
  at least 8 vCPUs, 32 GiB memory, and a 100 GiB root disk. Override a smaller AMI root mapping;
  boot success alone does not establish enough disk space for upgrades.

## AWS networking

- Keep ENI and VRF order symmetric across nodes: ENI 0 is SLO and ENI 1 is SLI when present.
- For EIP egress allocate and associate one address per node. NAT Gateway, firewall, and proxy
  modes require exact allowlisted existing identifiers and their observed route/policy behavior.
- `direct-eni` uses explicit VPC routes to the single node's SLI ENI.
- `nlb-ingress` uses three AZs, IP targets, health checks, and explicit cross-zone behavior. An NLB
  is ingress only and is never modeled as a VPC or TGW route next hop.
- `tgw-static` uses an appliance-mode VPC attachment, explicit TGW route tables, associations,
  propagations, TGW routes, and CE SLI ENI routes.
- `tgw-connect` uses an appliance-mode transport attachment and explicit `routing.connectPeers`.
  Each peer binds a node, a non-overlapping `/29` inside CIDR, and an observed transport interface
  index. The planner supports SLO or SLI transport selection; the payload routing context remains
  SLI. Keep transport interface identity separate from payload routing context.
- Derive session counts from the peers: two AWS BGP endpoints per peer. Three independent sites
  with two physical interfaces and two peers each require six peers and twelve sessions. Do not
  equate this topology with one three-node HA site. Correlate the actual node, MAC, interface name,
  GRE endpoint, and both AWS BGP endpoints before configuring routing.
- Ingress remains separate from routing. The internal Terraform adapters compose TGW Connect
  with NLB targets and exact site placement. A successful BGP session is neither packet-level
  multihop TTL evidence nor proof that a listener delivers traffic. Keep routes, targets, raw
  requests, retry-window requests, and origin-control health as separate acceptance evidence.

## Initial software and OS baseline

`aws_ce_plan` accepts `intent.initialVersions` with an exact `software` and `os` pair.
Both native and Terraform site reservations carry this pair into the schema-validated
`software_settings` before issuing bootstrap material. Omitting the pair selects the platform's
initial version policy; an exact AMI alone does not pin the versions installed on first boot.

For upgrade acceptance, select a supported baseline and separately discover an advertised target.
Use the create-time settings in the [MCN procedure](https://f5-sales-demo.github.io/mcn/en/customer-edge/smsv2/)
as a reference. The initial settings are immutable: changing them is not a software or OS upgrade
operation. A provisioning-time installation of the target does not prove the explicit upgrade
workflow. Upgrade invocation, per-node convergence, traffic continuity and final no-change evidence
remain required before claiming lifecycle acceptance.

The native and Terraform upgrade adapters collect fresh version evidence and bind one
software or OS action to the deployment, logical site, physical site, effective versions,
and verified API contract. Terraform uses an isolated stage and the checksum-verified XC
8.0.0 provider lock. Native execution checkpoints the exact site identity immediately before
submitting the verified API request. A response lost after that boundary is reconciled from
platform convergence without replay. OS eligibility follows the currently installed software,
including a preceding software upgrade. Version readiness alone does not establish registration,
routing, traffic, or serial admission. Separate AWS Terraform software and OS upgrade acceptance
receipts are recorded in [the parity ledger](https://github.com/f5-sales-demo/marketplace/issues/1326).
AWS native live upgrade acceptance remains pending.

The internal native and Terraform replacement drivers expose an admission callback before
shutdown mutation. Fresh owned-resource observations distinguish an intact deployment,
partial shutdown, and completed shutdown. Terraform also detects partial shutdown when an
EIP association has been removed while its original VM remains. Callback rejection prevents
the destructive call; a resumed completed shutdown remains observable without another deletion.
Replacement plans and checkpoints use schema v2; v1 artifacts remain inspectable but cannot
execute. Planning collects owned configuration, registered hardware identities, and stable
installed software/OS versions. An explicitly requested replacement also works when MTUs
already match. The coordinator persists version admission before shutdown, rechecks versions
on an intact retry, and requires that admission during partial shutdown recovery. Creation
uses the frozen installed versions without changing the original deployment baseline.
Registration completion requires a new physical site identity and matching installed versions;
missing or installing version evidence returns `pending-versions` for checkpoint resume.
Connect replacement requires the owning driver's routing recovery integration and the frozen
routing-object UID inventory before shutdown. After registration and version convergence, it
rediscovers interface bindings and rebinds the selected site's retained routing objects through
schema-validated updates. The coordinator returns `pending-routing` until observed BGP health
converges. Configuration readback alone cannot satisfy this gate. Terraform finalization requires
a refresh-enabled no-change plan before updating admission.

The [2026-09-08 AWS Terraform checkpoint-resume receipt](https://github.com/f5-sales-demo/marketplace/issues/1326#issuecomment-5592628652)
verifies one post-upgrade replacement with automatic routing recovery, retained routing-object
UIDs, restored twelve-session health, traffic checks, and final no-change plans. The local network
interruption required restarting the same executable checkpoint, with no deployment-state edits
or separate routing repair. Its BGP observation gap is recorded explicitly. This establishes that
scenario only; uninterrupted completion, native replacement, Azure, HA, and complete public
lifecycle acceptance remain separate requirements. Preserve failed or manually repaired runs as
such rather than counting them as unattended acceptance.

## AWS operations and diagnostics

- Native TGW Connect apply freezes the complete XC connector/BGP UID inventory in the restricted
  deployment store after routing configuration converges. Teardown and replacement must consume
  that engine-bound record rather than relying on conversational checkpoint state.
- Terraform failover keeps rendered bootstrap and temporary power controls in restricted storage.
  One authorized apply performs stop, exact selected-peer withdrawal, restart, full restoration,
  control release, and a refresh-enabled no-change plan with bounded polling. Submitted saved
  plans resume exactly after interruption. BGP success does not establish data-plane traffic or
  origin-control health; collect those as separate acceptance evidence.
- Native failover binds the selected instance from the completed deployment checkpoint, revalidates
  its account and ownership tags before state changes, and persists the exact stop/start request
  before mutation. An ambiguous response converges from live EC2 and BGP state without replaying
  the request.
- Native teardown binds this platform inventory to a fresh, independently reviewed native cloud
  teardown plan. Each owned delete intent is durable before mutation; an interrupted response is
  reconciled from exact scoped AWS state, including EC2's retained `terminated` records, and is not
  replayed. Brownfield restoration remains rejected until every restoration mutation has an
  equivalent readback contract.
- Correlate EC2 status/boot, ENIs, security groups, route tables, NLB targets, TGW attachments,
  Connect peers/BGP, and platform registration/health/routing evidence.
- The native apply route gate collects each planned TGW route-table/attachment association and
  propagation plus every exact static destination. It accepts only terminal associated, enabled,
  and active states from complete AWS responses. End-to-end traffic remains a separate gate until
  the intent identifies an authoritative probe source, destination, and expected response.
- Run SSM probes only within the user's authorized diagnostic or acceptance scope. Preserve that
  authorization across resume. Return allowlisted states, counts, and digests; withhold raw
  console output, user data, SSM output, tokens, and environment data.
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
