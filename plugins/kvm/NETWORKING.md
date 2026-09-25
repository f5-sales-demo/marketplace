# Home-LAN KVM network contract

The v3 plugin uses two distinct CE MACs. SLO (`52:54:00:10:00:11`) is on the
plugin-owned libvirt NAT network `10.100.0.0/24`; the HTTP demo origin
remains there. SLI (`52:54:00:10:00:12`) joins the physical wired LAN through a
separate bridge. The SLI static address has no gateway or competing default
route. The one HTTP-LB advertises its inside VIP on that LAN; its origin pool
targets the isolated workload at `10.100.0.100:80`. No BGP peer or lab route
is needed for an on-link VIP. TEST-NET addresses are examples only.

The SMSv2 site, site token, registration approval, and platform-managed
interfaces stay in the `system` namespace. The HTTP-LB and its origin pool
belong in the selected application namespace. On first deployment, pass
`applicationNamespace` explicitly or let the controller use the active xcsh
context's `XCSH_NAMESPACE`; setup stops when neither is available. The selected
value is persisted with the deployment, and a later conflicting selection is
rejected. A receipt without `applicationNamespace` is stale and must not be
silently migrated. The controller substitutes the selected value as the required
Terraform `application_namespace` variable for both objects and the LB's pool
reference. A direct Terraform invocation must set its actual application
namespace rather than hardcode `system` for application objects. Changing a
deployment's namespace requires an ownership-scoped destroy and fresh deploy;
never call it a zero-change reapply.

The installer accepts only a discovered subnet wholly inside `192.168.0.0/22`
or `192.168.4.0/23`; the expected LAN is `192.168.2.0/24`. A VPN interface,
Wi-Fi route, or overlapping wider prefix cannot substitute for the wired
route. It records management IP, gateway, IPv6 use, bridge members and manager
before a mutation. Only the wired management link can be moved into the
dedicated `xckvmlan` bridge; an occupied `br-kvm-lan` is never repurposed.
An existing management bridge is reused only when it is `xckvmlan` with the
wired port and, if the CE is running, one tap attested by the CE's SLI MAC and
libvirt bridge source. Other bridges and extra ports stop installation.

On NetworkManager hosts, the bounded attempt uses `nmcli device checkpoint`
with a 120-second rollback deadline. On networkd hosts it saves Netplan YAML,
uses `netplan try` with a 100-second confirmation deadline, and schedules an
independent 120-second restore. The check requires the original management
address and default gateway on the new bridge, the physical port enslaved,
gateway reachability and working DNS before confirmation. Original profiles
are stored root-only under `/var/lib/kvm-smsv2/lan-rollback` for an owned
teardown. Failure requires checking that restoration actually occurred; never
retry by blindly switching interfaces over SSH.
The dedicated single-uplink NetworkManager bridge disables STP forwarding delay.
Inventory requests detailed link metadata so a default route on the bridge is
correlated with its physical Ethernet port after the checkpoint commits.
The host can remediate missing packages and its own bridge, but a
platform-owned `network_interface` cannot be updated directly with the tenant
owner's API token: that PUT returned `FORBIDDEN`. The supported path is a
two-stage deployment of the **same CE**. A hashed bootstrap plan creates the
site and CE without an HTTP LB or origin. After XC admits the node, the
controller observes its hostname and two MAC/device pairs. XC first populates
one node with both interfaces on the owned site; adding a node before that
point was rejected, and creating a site with an incomplete node returned a
server error. A separately hashed, version-bound site plan changes only the
observed SLI from DHCP to static, with no gateway. One `securemesh_site_v2`
replace succeeds with the same owner token; exact-name GET and guest address
checks must then prove convergence before the final Terraform plan can create
the VIP and origin. Do not retry a stale plan or blindly repeat an ambiguous
PUT. The previous forbidden deployment was removed by an ownership-scoped
saved plan; a later single-CE iteration proved the site-level update on
September 24, 2026. Full VIP acceptance remains a separate gate.

The CE and VIP candidate addresses are distinct, never the host, gateway,
network or broadcast addresses, and exclude observed neighbors and probe
responders. The owner must inspect any available DHCP lease inventory and
reserve the chosen addresses on the router when possible. ARP probing is only
best-effort: it **does not create or prove a future DHCP exclusion**. Monitor
for conflicts and stop on one; allocate replacements only via a fresh reviewed
plan. A switch that forbids additional source MACs cannot be fixed in host
software. Do not bypass that gate with NAT, macvtap, or DNS assumptions.

The installer selects `/data/libvirt/images` for its owned libvirt pool only
when `/data` is mounted and that directory exists; otherwise it selects
`/var/lib/libvirt/images`. The selection is persisted with the deployment and
must remain mounted for subsequent plans and teardown. Image downloads stay in
the plugin cache. If the selected filesystem lacks capacity, stop and inspect
the mount rather than silently relocating an existing pool.

The hostname is `<site>.internal.f5-sales-demo.com`. No home DNS record is
assumed. From another LAN device, verify the VIP's ARP and HTTP response with
`curl --resolve <hostname>:80:<vip> http://<hostname>/`; use the exact site and
VIP from the receipt. Verify separately on a VPN-connected laptop that routes
for the VIP still resolve over the local LAN. Registration, SLO/SLI MAC and
device correlation, origin isolation, one VIP, traffic, conflict
monitoring, and a zero-change reapply are independent acceptance gates.

The shared lab has capacity for only one KVM CE across hosts. Complete Ubuntu
acceptance, then destroy its exact owned deployment with a reviewed saved plan
and prove its absence before starting NUC installation. The final NUC
deployment stays online after published-plugin UAT. Never overlap the two CEs
or remove another owner's resources to make room.

Read-only inventory on September 24, 2026 found Ubuntu's management DHCP on
`enp5s0`, with `br-kvm-lan` occupied by another uplink; NUC's static wired
management is on `enp109s0` under networkd, with Wi-Fi as a separate fallback.
No management link was moved during discovery. The switch multi-MAC policy,
router DHCP exclusions remain unverified. An Ubuntu LAN client observed both
CE and VIP ARP from the SLI MAC and HTTP 200 from the VIP on September 24,
2026; NUC external-client and VPN route checks remain separate gates.
