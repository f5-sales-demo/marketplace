# Issue 1559 deployment and qualification context

Complete marketplace issue 1559 sequentially. The qualified installation baseline is
`c177be807588b9e730138a8d3f561606afedcd79`; PR #1698 stays draft.
The Platform unsigned-integer validation repair and subsequent tracker fixes
are implemented. Native result framing now refuses ambiguous create/mutation
arrays and asynchronous replies without a verifiable operation; this later
payload passed isolated installation and registration with 20 successful CI
checks and four skips. New synchronous network/subnet completion receipts retain
the original numeric identity and reject replacement during reconciliation and
final ownership capture. Legacy unversioned receipts recover without rewrite.
Attempt 189 verified the current payload through supported installation,
485-file parity, dependency and installation lifecycle checks, ordinary
runtime registration, bounded interactive status/setup capture and removal.
Exact-head CI passed 20 checks with four skips. Live qualification remains open.
Source tests, installation, runtime execution, live behavior,
cleanup, CI, review, publication and published installation are separate gates.
Do not infer any later gate from an earlier one.

Google's advertised Compute v1 discovery schema, revision `20261016`, defines
operation `targetId` as the identity of a specific resource incarnation and
`targetLink` as the modified resource URL. New native VM operation receipts bind
both fields and retain them through reconciliation, disk capture and final
ownership capture. Missing or changed target identity refuses; documentation
does not guarantee field availability for every outcome. Legacy operation
receipts remain readable without rewrite or retroactive target evidence. This
repair passed source checks and attempt 189 installation. Live qualification
remains open; installation does not establish target-field availability in GCP.

Use Bun 1.4.2, xcsh source `33d1e443d`, its source-matched native build,
Python 3.15 and `TMPDIR=/private/tmp`. Use isolated catalogs and configuration
for candidate installation. Preserve user settings and unrelated plugins.
GCloud depends on Platform. Terraform is optional; explicit Terraform requests
must preserve that engine and report missing setup prerequisites. Use ordinary
`bun dev` without `--plugin-dir`, the configured model and existing authenticated
contexts. Never substitute a private runtime adapter for installed acceptance.

The earlier attempt 175 model probe failed upstream authentication. Preserve its
transcript and negative classifier. After the reported repair, attempt 189
independently verified fresh configured-model inference without tool calls.
Separate ordinary sessions selected the installed GCP skill and executed native
upgrade and explicit Terraform failover tools. Both reported the typed
unqualified-operation refusal with `mutationAttempted=false`. A bounded ordinary
120-by-40 interactive capture rendered the actual native refusal. These checks
qualify installed execution and refusal behavior; live operation remains open.
Do not replace the configured provider or replay a failed request unchanged.

An isolated GCloud configuration independently had zero active accounts.
The installed discovery tool executed in a fresh model session and returned
`validation_or_read_failed` with `mutationAttempted=false`. Retain that generic
reason without inventing a more precise authentication diagnosis. Gateway
authentication, GCloud authentication and F5 context credentials are separate.

Use the [reviewed deployment prompt](gcp-reviewed-deployment-prompt.md) with
explicit scope inputs and this context. The prompt grants no apply authority.

## Recommended deployment controls

Keep each deployment in its owning engine and exact resource scope. Use reviewed
saved plans, durable authorization, single-use bootstrap, exact original
numeric VM identities and independent ownership reads. Reconcile asynchronous
operations before dependent steps. Interrupted creates, unresolved executor
locks, ambiguous identities, changed credentials and restoration conflicts
must refuse submission or require explicit reconciliation without replay.
Preserve legacy deployment receipts and cleanup paths.

Start with supported profiles whose F5 and GCP mappings are verified. Keep
external-IP, Cloud NAT and explicit firewall/proxy egress choices explicit.
Keep internal passthrough ingress separate from static ILB next-hop routing.
Google permits explicit backend-service VPC network selectors for separate
backend NICs, but actual CE interfaces and health behavior still need evidence.
An ILB next-hop route forwards all ports and stays active when all backends
are unhealthy. Do not use `L3_DEFAULT` or a shared forwarding-rule VIP as a
static-route next hop. Symmetric paired load balancers require matching
eligible backends, health, failover, affinity and connection tracking behavior.
Verify effective routes, return paths and content independently.

Google NCC router appliances require two Cloud Router interfaces and two BGP
peers. The peer address must be the appliance VM's primary internal address
on nic0. Do not assume an SLI address, transplant a Linux startup script into
CE bootstrap or invent a Site CLI command. F5 CE VRF, interface, route-policy,
NCC membership and session mappings remain unqualified until verified.

For software or OS upgrades, inspect current supported targets and fresh
owned-site versions and prechecks. The captured global software catalog is
candidate information, not site eligibility or a recommendation. Perform
serial upgrades, coupled replacement, targeted repair and reviewed failover
only through the same durable reviewed-plan authorization. Restore only
networking changes owned by this deployment.

## First-stage live campaign limits

At most three fresh sequential campaigns are authorized at this stage. Clean
up each independently before another. Preserve q12 as closed with its exact
cause unknown, all frozen collectors, historical executor locks and immutable
v12.3.1 artifacts. Both guest holds remain active:

- `gcp_bootstrap_journal_timestamp_mapping_unavailable`
- `gcp_runtime_listing_namespace_mapping_unavailable`

Account for 21 resources: 18 CE resources plus observer VM, disk and a narrowly
scoped SSH firewall. Pin the observer to
`ubuntu-2404-noble-amd64-v20261021`, numeric image ID
`4996011480491275419`, with no cloud service account. Review initial absences
and the saved create plan independently. Start cloud and serial capture before
the single apply, and bind each original numeric VM as its insert appears.

Use campaign-only SSH keys through the documented F5 Site admin credential
path. Fresh official F5 GCP and Site v2 pages, captured in attempt 179, reconcile
the original metadata-path assumption: the GCP guide sends SSH configuration
to Site creation, where the public SSH key belongs in admin credentials. Its
manual VM metadata contains `VmDnsSetting=ZonePreferred` and token-only
`user-data`. The pinned XC 15.13.0 schema explicitly maps
`admin_user_credentials.ssh_key` to access as `admin`.

Use the opt-in `site-ssh-sli` candidate only within its supported two-interface,
external-IP Terraform HA profile. Bind the exact campaign public key into the
reviewed Site configuration. SSH is enabled on SLI, blocked on SLO, and local
DNS and web UI are blocked on both VRFs. This is a documented and
provider-validated configuration; original-node SSH access, serial host-key
trust and bootstrap-period command coverage still require fresh live evidence.
Do not put the CE public key into VM metadata. Preserve token-only CE cloud-init;
do not create shell accounts, use password fallback or interactive serial access.
Establish observer and CE access independently. Pin both SSH hosts from fresh,
unambiguous original-VM serial fingerprints; reject changed or stale trust,
and disable forwarding and agent forwarding.

Discover supported commands through help and completion. Retain bounded VPM
status and journals, health, diagnosis, clock, interfaces and routes, fresh
runtime listings, inspections and bootstrap/VPM and exited-container logs.
Derive container identities from that original node's fresh listing. Derive
registration/proxy endpoints privately from its token and corroborate VPM
output. Record unavailable Linux diagnostics without inventing a shell.
Require attributed journals covering bootstrap and relevant container evidence;
missing or truncated captures remain incomplete.

Keep command limits at 60 seconds, freshness at five minutes, rounds 45 seconds
apart and startup at 15 seconds. Preserve existing apply/observation deadlines
and reserve a separate five-minute final-capture window on every outcome.
Preserve 36 placement profiles, 24 component services, 30 runtime services
and zero exclusions. Verify ownership, token and NIC joins and final native
reconciliation or Terraform no-change planning.

Measure failover from disruption start and repair from restoration-command
start. Action completion cannot restart the 120-second clock. Record route
recovery, application recovery, outage duration and loss separately. Use
owned disposable clients and origins with content-verified traffic. Stop on
a demonstrated failure mechanism, access/capture failure, cleanup failure
or the campaign cap. A retry needs a concrete changed hypothesis and input.

Finish with independently reviewed cleanup, all 21 absences, empty destroy,
stable state and two resumes without submission. Retain unresolved locks.
Further topology/profile campaigns beyond the first-stage cap need a new
allowance; do not imply the initial three qualify the full acceptance matrix.

## Verified troubleshooting commands and placement prerequisites

Attempt 188 followed the Site v2 guide's troubleshooting link and retained the
fresh official guide and exact command examples. It documents
`execcli systemctl-status-vpm`, `status vpm` and
`execcli journalctl -fu vpm`. The journal example follows output indefinitely;
it is not a bounded capture command. Discover bounded options through supported
help/completion before execution and retain their original-node evidence.

The examples use journal prefixes such as `Aug 09 09:14:57`, without a year or
timezone. They do not qualify the collector's required explicit timestamp or
original bootstrap interval. The guide does not document `crictl` commands or
runtime namespace selection. Both original guest holds therefore remain open;
do not infer support from generic Linux documentation or manufacture mappings.

F5's deployment checklist recommends SSD-backed storage, at least 500
sequential IOPS, and low-latency multi-node placement on a single L2 in the same
data center or host cluster, with etcd peer RTT p99 below 10 ms. Its diagnostic
disk benchmark expects sync p99 below 10 ms.
These are prerequisites to verify for the proposed topology, not measured
properties of a three-zone plan. Do not silently change the reviewed placement.
The documented `collect-database-stats` diagnostic can write temporary benchmark
data; include that action in the reviewed diagnostic scope before execution.

Official reference retained by attempt 188:

- <https://docs.cloud.f5.com/docs-v2/multi-cloud-network-connect/troubleshooting/troubleshoot-site-smsv2>

## Delivery

Run proportional checks and repair exact-head CI failures. Preserve prior
receipts when source changes reopen acceptance. All GitHub writes execute
through verified Ubuntu SSH. Keep the PR draft until applicable source and
live gates pass. Publish only newly qualified immutable artifacts, verify
downloaded hashes, then install published GCloud, Platform and explicit
Terraform into the Mac user scope. Finish a fresh ordinary installed runtime
smoke and sanitized acceptance receipt before marking issue 1559 complete.

Official Google references retained by attempt 172:

- <https://docs.cloud.google.com/load-balancing/docs/internal/ilb-next-hop-overview>
- <https://docs.cloud.google.com/load-balancing/docs/internal/setting-up-ilb-next-hop>
- <https://docs.cloud.google.com/network-connectivity/docs/network-connectivity-center/how-to/creating-router-appliances>

F5 access references refreshed by attempt 179:

- <https://docs.cloud.f5.com/docs-v2/multi-cloud-network-connect/how-to/site-management/deploy-sms-gcp-clickops>
- <https://docs.cloud.f5.com/docs-v2/multi-cloud-network-connect/how-to/site-management/create-secure-mesh-site-v2>

## Pinned F5 BGP contract review

Attempt 181 verified the retained immutable API v7.0.1 schema against its
publication receipt and unchanged loader. It inspected 20 schema definitions
and six configuration and operational routes. BGP supports Site/virtual Site
placement, the SLO network enum, external-peer interface object references,
ordered import/export policies and peer/route observations. Its eight-peer
limit accommodates six peers for three appliances only as a cardinality check.

Do not infer original-node mapping from this schema. Interface references use
tenant, namespace and name; they do not contain numeric GCP VM identity. Require
an independent join from each original VM's nic0 ID/IP/MAC to the actual CE SLO
interface object and observed BGP source address. Bind both Cloud Router peers
and their sessions to that same original node. Qualify policy node selectors,
owned import/export prefixes, replacement resource versions and restoration
semantics, then verify effective routes, return paths and content traffic.
These five mapping/evidence gaps keep the NCC consumer unavailable. Preserve
the original guest journal and runtime namespace holds and all unused campaign
allowances. No authenticated request, guest SSH or infrastructure was submitted
by this contract review.
