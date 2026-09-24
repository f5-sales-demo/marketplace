---
name: kvm-smsv2
description: >-
  Install, deploy, inspect, reconcile, destroy, and rebuild one plugin-owned F5
  Distributed Cloud Secure Mesh Site v2 on Ubuntu KVM/libvirt.
---

# KVM Secure Mesh Site v2

This is a clean-break v3 networking workflow. Use only `kvm_smsv2_readiness`, `kvm_smsv2_deploy`,
`kvm_smsv2_status`, `kvm_smsv2_reconcile`, and `kvm_smsv2_destroy`. Do not use retired application
stack modes, an external Terraform workspace, public-cloud providers, legacy image discovery,
Terraform state editing, imports, taint, or direct resource deletion.

Direct installation is the authorization for the controller's declared setup plan. That plan may
install missing Ubuntu 24.04 prerequisites, repair service or group readiness, persist an encrypted
one-shot resume credential, reboot when required, and continue the deployment. Bulk recommended
installation, dependency installation, upgrades, and cache refreshes never authorize setup.

The controller persists the site name before mutation, rejects collisions, uses namespace `system`,
and applies only a newly inspected saved plan whose SHA-256 still matches. An ambiguous POST is never
retried: query the exact persisted site name and use `kvm_smsv2_reconcile` only for an exact
plugin-owned, spec-matching object.

After deployment, use `kvm_smsv2_status` to require the fixed CE/workload identities, XC registration
and approval, ONLINE health, LAN VIP HTTP, generated traffic, and a zero-change plan.
For lifecycle acceptance, destroy through `kvm_smsv2_destroy`, prove absence,
and rebuild from empty state. Never overlap Ubuntu and NUC CEs: finish Ubuntu
acceptance, destroy and prove absence, then install the released plugin on NUC
and leave only that final CE deployed and healthy.

Follow `NETWORKING.md`: report the exact wired LAN gap, the bounded bridge
remediation attempted, and the result of its timed rollback/health check.
Do not write the platform-owned XC `network_interface` child. Bootstrap the
one owned CE, wait for XC to populate its node, then use an exact-UID,
version-bound saved site plan to set the MAC-mapped SLI static address through
`securemesh_site_v2`. Verify guest convergence and ARP before the final plan.
On a denial, version drift, or ambiguous PUT, preserve receipts, query the
exact owned site, and stop for a new reviewed plan rather than blindly retry.
Do not claim SLI/VIP acceptance from the API response alone.
Never move an occupied `br-kvm-lan`, claim an unverified DHCP exclusion, or
assume home DNS. Verify the inside VIP with an explicit Host header from
another LAN device and prove the VPN-connected laptop still routes locally.
Retire an MCN-owned CE through MCN's own reviewed lifecycle before installing
this plugin; do not delete shared resources or confuse physical switch
multi-MAC restrictions with remediable host configuration.
