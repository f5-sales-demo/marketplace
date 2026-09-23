---
name: kvm-smsv2
description: >-
  Install, deploy, inspect, reconcile, destroy, and rebuild one plugin-owned F5
  Distributed Cloud Secure Mesh Site v2 on Ubuntu KVM/libvirt.
---

# KVM Secure Mesh Site v2

This is a clean-break v2 workflow. Use only `kvm_smsv2_readiness`, `kvm_smsv2_deploy`,
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
and approval, ONLINE health, one Established BGP peer, imported and advertised routes, generated
traffic, and a zero-change plan. For lifecycle acceptance, destroy through `kvm_smsv2_destroy`, prove
absence, rebuild from empty state, and leave the final CE deployed and healthy.
