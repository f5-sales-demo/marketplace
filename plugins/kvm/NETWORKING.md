# Home-LAN KVM network contract

The v3 plugin uses two distinct CE MACs. SLO (`52:54:00:10:00:11`) is on the
plugin-owned libvirt NAT network `10.100.0.0/24`; FRR and the HTTP demo origin
remain there. SLI (`52:54:00:10:00:12`) joins the physical wired LAN through a
separate bridge. The SLI static address has no gateway or competing default
route. The one HTTP-LB advertises its inside VIP on that LAN; its origin pool
targets the isolated workload at `10.100.0.100:80`. The BGP lab prefix is
`10.231.0.0/24`. TEST-NET addresses are examples only, never live routes.

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
The host can remediate missing packages and its own bridge, not an XC credential
that lacks permission to update a platform-owned `network_interface`. On the
Ubuntu prototype, the first partial apply was retired through a state-identity
checked, hashed destroy plan, then rebuilt on `/data`. XC admitted the CE and
created both interfaces, but denied the SLI static-IP PUT with `FORBIDDEN`.
That gap requires an XC credential authorized for the exact interface update;
do not retry a saved plan, switch tenants, or claim VIP acceptance until the
permission and a new reviewed plan are verified.
The forbidden Ubuntu rebuild was removed through a second reviewed destroy
plan. Its management Ethernet recovered, but an expired transient timer caused
restore cleanup to stop; the verified original route then allowed bounded
cleanup without switching the healthy link back to the bridge. The lab is
currently empty, not a successful LAN-VIP deployment.

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
device correlation, origin isolation, one VIP, BGP, traffic, conflict
monitoring, and a zero-change reapply are independent acceptance gates.

Read-only inventory on September 24, 2026 found Ubuntu's management DHCP on
`enp5s0`, with `br-kvm-lan` occupied by another uplink; NUC's static wired
management is on `enp109s0` under networkd, with Wi-Fi as a separate fallback.
No management link was moved during discovery. The switch multi-MAC policy,
router DHCP exclusions, and cross-device VIP reachability remain unverified.
