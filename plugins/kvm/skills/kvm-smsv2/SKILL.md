---
name: kvm-smsv2
description: >-
  Plan, deploy, inspect, verify traffic, detect and recover drift, destroy, and
  rebuild F5 Distributed Cloud Secure Mesh Site v2 on a dedicated KVM/libvirt
  host with Terraform-owned FRR routing.
---

# KVM Secure Mesh Site v2

Use only the MCN Terraform configuration, the F5 Sales Demo tenant, the `qemu:///system` libvirt
connection, and the immutable API/provider versions pinned by that configuration. Never substitute a
generic Linux image for the provider-issued Customer Edge appliance.

## Required sequence

1. Call `f5xc_ce_v2_capabilities`. Preserve the KVM prerequisite ID, reason, release tag, commit,
   `openapi.json` SHA-256, and source operation.
2. Call `kvm_smsv2_preflight`. It must prove the live image prerequisite, exact host identity,
   Terraform availability, libvirt access, and project-scoped resource inventory before planning.
3. Call `kvm_smsv2_plan` for `apply` or `destroy`. Inspect the complete saved-plan summary and require
   zero Azure actions. Keep its artifact identifier and SHA-256 together.
4. Apply only through `kvm_smsv2_apply` with the exact artifact and SHA-256 after approval. The tool
   rechecks the tenant prerequisite, host identity, ownership, and saved-plan bytes before mutation.
5. Call `kvm_smsv2_status` until the Terraform state, libvirt domains/network/volumes, FRR BGP peers,
   F5 site health, advertised load balancer, and generated traffic are healthy.
6. Call `kvm_smsv2_drift` for refresh-aware no-change or controlled-drift evidence. Recover only by
   inspecting and applying a new saved plan.
7. For teardown, create a destroy-mode saved plan, verify every target is project-owned, apply that
   exact plan, and prove both state and owned host inventory are empty.
8. Rebuild from empty state and repeat online health, BGP, load-balancer traffic, and final no-change
   verification.

If `maurice_config_cardinality_exactly_one` is unavailable, stop before Terraform apply, F5
configuration, libvirt, FRR, Docker, or cloud mutation. Report the immutable prerequisite reason.
The plugin has no supported API for creating or repairing the tenant-owned object.

Do not use Terraform import, taint, direct state editing, generic shell mutation, legacy site types,
or an Azure execution path.
