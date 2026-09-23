# KVM Secure Mesh Site v2

This document is generated from `knowledge/ledger.json`. Edit the ledger, then regenerate this file.

## Fixed contract

The plugin owns one Ubuntu 24.04 x86_64 KVM deployment: one 8-vCPU, 32-GiB, 100-GiB Secure Mesh CE; one deterministic workload; one FRR peer; namespace `system`; and no AppStack, public-cloud, legacy-image, or external-workspace paths.

## Validated knowledge

### KVM-001: image-contract

- Hypothesis: The legacy image endpoint was required before creating a KVM site.
- Experiment: Created a disposable SMSv2 KVM configuration, joined its configuration owner to the Site UID, and queried software_os_version.
- Sanitized evidence: The Site-UID query returned complete image metadata; the legacy endpoint returned a cardinality failure.
- Outcome: validated
- Root cause: Image selection belongs to the created SMSv2 Site UID, not a tenant-global configuration object.
- Rejected: get-image-download-url, maurice_config prerequisite, guessed image URLs
- Correction: Create the configuration, resolve its Site UID, query software_os_version, and verify the returned MD5 before import.
- Plugin requirement: Use xcsh_site_image from provider 9.5.2 and expose no legacy image path.
- Automated test: The bundled Terraform contract contains xcsh_site_image and rejects legacy endpoint tokens.
- Live acceptance: The resolved qcow2 passed its published MD5 and booted to an ONLINE registration.
- References: api-specs-enriched#1806, terraform-provider-xcsh#2118, terraform-provider-xcsh#2134, multi-cloud-networking#1210

### KVM-002: transport

- Hypothesis: Terraform schema generation caused the POST EOF failures.
- Experiment: Compared release and development providers, captured secret-free HTTP timing, and isolated protocol negotiation.
- Sanitized evidence: Both payload-equivalent clients failed until mutation ALPN was made consistent with the HTTP/1-only transport.
- Outcome: validated
- Root cause: Inconsistent ALPN and HTTP transport behavior closed mutation connections before response headers.
- Rejected: blind POST retry, state surgery, payload logging
- Correction: Pin provider 9.5.2; after EOF, GET the exact namespace/name and reconcile only an owned spec match.
- Plugin requirement: Never retry ambiguous mutation responses and retain only sanitized transport classifications.
- Automated test: EOF classification covers absent, exact-owned/spec-matching, and collision outcomes.
- Live acceptance: The fixed provider created the site and token without ambiguous EOF.
- References: terraform-provider-xcsh#2118, terraform-provider-xcsh#2134, multi-cloud-networking#1210

### KVM-003: networking

- Hypothesis: A generic libvirt DNS forwarder was sufficient for CE bootstrap.
- Experiment: Observed the CE startup dependency chain and dnsmasq queries on the deterministic 10.100.0.0/24 network.
- Sanitized evidence: Forwarded ce.local searches exhausted dnsmasq and stalled Vector-to-Vega startup; authoritative local DNS removed the amplification.
- Outcome: validated
- Root cause: The CE search domain must not be forwarded upstream.
- Rejected: additional retries, alternate subnets, manual guest repair
- Correction: Set libvirt DNS local_only and retain fixed CE, FRR, and workload identities.
- Plugin requirement: Reject topology conflicts; use CE 10.100.0.11, FRR 10.100.0.2, workload 10.100.0.100, and authoritative ce.local DNS.
- Automated test: Terraform contract pins the subnet, addresses, MACs, ASNs, and local_only DNS.
- Live acceptance: The CE reached ONLINE, one BGP peer established, the route imported, and workload traffic succeeded.
- References: multi-cloud-networking#1210, multi-cloud-networking#1220, multi-cloud-networking#1223, multi-cloud-networking#1225

### KVM-004: ownership

- Hypothesis: Runtime hostnames and broad inventories were stable identifiers for approval and teardown.
- Experiment: Compared site-scoped registrations, deterministic MACs, Terraform state, and live host resources across rebuilds.
- Sanitized evidence: XC appended a runtime suffix while site scope and deterministic MAC identity remained stable.
- Outcome: validated
- Root cause: Runtime hostname mutation makes literal hostname filters incomplete and broad deletion unsafe.
- Rejected: literal hostname matching, tag-only deletion, arbitrary workspace input
- Correction: Persist the site identity before mutation and gate reconcile/destroy on exact ownership and saved-plan receipts.
- Plugin requirement: Use plugin-owned state, names, pool, plans, inventory, and mode-0600 receipts.
- Automated test: Collision, stale-receipt, exact plan hash, ownership-safe destroy, and unrelated-resource tests are required.
- Live acceptance: Destroy proved XC/libvirt/Docker absence and preserved unrelated resources before a clean rebuild.
- References: multi-cloud-networking#1216, multi-cloud-networking#1218, multi-cloud-networking#1223, multi-cloud-networking#1225

### KVM-005: plugin-lifecycle

- Hypothesis: An external Terraform workspace and a second setup confirmation were acceptable deployment boundaries.
- Experiment: Installed the marketplace plugin from its cache and traced direct, bulk, dependency, refresh, and upgrade paths.
- Sanitized evidence: The v1 adapter required external state and direct installation could not carry bounded setup authorization.
- Outcome: validated
- Root cause: Lifecycle ownership was split between the plugin, xcsh, and an unrelated repository checkout.
- Rejected: workspace adapter, compatibility shim, bulk auto-setup, upgrade auto-setup
- Correction: Bundle the controller and Terraform root; allow setup only from an explicitly reviewed direct install.
- Plugin requirement: Declare setupAuthorization install, atomically install artifacts, resume after reboot, and expose five v2 tools.
- Automated test: Installed-cache and xcsh authorization tests distinguish direct installs from all indirect flows.
- Live acceptance: A clean-host install owns readiness, reboot/resume, deploy, verification, destroy, and rebuild.
- References: marketplace#1330, multi-cloud-networking#1210
