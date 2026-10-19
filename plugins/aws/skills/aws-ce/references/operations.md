# AWS CE sizing, permissions, routing, and evidence

Use the certified F5 Marketplace image from the regional public SSM parameter. Match its
architecture to the observed instance-type capabilities. Require at least eight vCPUs,
32 GiB memory, the requested ENI capacity, and a 100 GiB root disk. Check remaining quota,
including pending instances, existing VPCs, gateways, and allocated Elastic IPs. An owned
allocation may be reused only with its original deployment and plan bindings.

Persist the selected AWS profile in the plan. Omission selects `default`; environment
changes cannot redirect an approved deployment. Validate the instance-profile account and
partition. `iam:PassRole` applies to the role inside an instance profile, so review that role's
actual ARN and EC2 trust policy. Keep policies scoped to the approved deployment.

Use F5-issued site-bound JWT/cloud-init material in restricted deployment storage. Preserve
the certified image configuration. Registration, cloud attachment/MAC identity, guest device
identity, physical links, and application traffic are separate observations. The v12.0.9
AWS node-configuration contract still restricts mutations to one non-HA node. Three admitted
nodes and six hardware interfaces do not qualify a replacement HA configuration contract.

For static TGW routing, record each appliance node and AZ, forward prefixes, and return
prefixes. Verify the attachment's appliance mode and terminal availability, the exact
associations and propagations, route precedence, each VPC next hop, and each subnet's route-table
association. Changes to a failed appliance's next hop require a fresh reviewed cutover plan
and measured recovery. NLB ingress targets an explicit CE application service and remains
independent of the routing profile.

SSM probes require a running, ownership-verified Linux EC2 managed node with an online agent
and a recent ping. An instance profile or an explicitly configured Default Host Management
Configuration may provide its permissions. The agent and outbound SSM service path must already
work. Poll each command to a terminal result; TCP connection success and UDP submission do not
establish application response correctness.

Passive evidence reads existing configuration, EC2 checks, CloudWatch metrics, and bounded
CloudTrail and existing CloudWatch Flow Log samples. Flow Log queries bind account and interface
identity, interpret the configured record format, and report ACCEPT/REJECT counts without raw
addresses or messages. Queries cover a fixed recent window, at most 20 log groups, and at most
100 events per query. Missing permission, pagination, malformed data, and stale samples remain unknown.
Configuration analysis and observed samples do not satisfy an end-to-end traffic gate.

Terraform keeps AWS state and a separate F5 resource stage under the same deployment owner.
Both use exact provider locks, explicit backend identities, private saved plans, and isolated
CLI configuration. The F5 stage translates validated requests with the installed provider
schema. Native REST cannot mutate its F5 views. Preserve a submitted journal after a lost
response and reconcile both provider state and the exact API resource before replay or deletion.

The reviewed [reference inventory](reference-inventory.json) records the selected toolkit
versions, retrieval commands, and source digests. Only CE-specific guidance was reused.
Its installer, AWS MCP configuration, generic service catalog, and global mutation rules
are outside this workflow.


For static IPv4 deployment, set each interface's `addressing.mode` to `static`
and supply exactly one CIDR in `addressing.addresses` per node, in subnet order.
The CIDR prefix must match the subnet; AWS reserves its first four and final addresses.
Supply distinct verified `guestDevice` identities for every interface before registration.
Native and Terraform allocation preserve the selected address as primary; an explicit
NLB listener remains a distinct secondary SLI address. Mixed DHCP/static configurations
leave DHCP allocation unchanged. Static SLO configuration uses the subnet router at
network address plus one and AmazonProvidedDNS at the VPC network address plus two,
so an exact VPC CIDR is required. CE configuration is installed before bootstrap using
the pinned SMSv2 schema, then correlated with registered device and MAC identities.
Configuration evidence does not establish current operational state, freshness, or traffic.
