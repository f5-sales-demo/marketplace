# Native Azure Secure Mesh v2 experiment

Azure discovery enforces `f5xc-ce-automation-policy/v2`, retrieves current F5 and
Microsoft guidance, and binds normalized content hashes into immutable plans.
The Marketplace prerequisite workflow is embedded as `azure-marketplace-terms`
and is readable at `xcsh://plugin/azure/marketplace-terms`. It resolves the actual
purchase-plan identity and current certified image before a legal decision.
The optional `region` field restricts discovery to the requested region. A failed
Marketplace terms lookup remains a deployment blocker even when the Compute
image catalog lists the image.

Platform supports schema-validated creation of a single Azure node with one DHCP
SLO interface on `direct-nic`. Supply the hostname and explicit NIC MAC/device
identity through `config.nodes`. Other Azure topology, addressing, replacement,
and networking operations remain unavailable. Capabilities enumerate implemented
operations separately from provider support.

Azure bootstrap uses the independently verified, pinned immutable API release.
The driver issues a site-bound JWT, retrieves the platform's Azure cloud-init
template, substitutes only supported token placeholders, and rechecks the site
configuration before returning a local one-use reference. It preserves the
certified image's `/etc/vpm/config.yaml` and requires issued `/etc/vpm/user_data`.
The Azure consumer rejects session, expiry, site, node, digest, and replay errors.
Keep the upstream token name in the private journal and revoke it with
`f5xc_ce_v2_bootstrap_revoke`; local reference expiry does not revoke the JWT.

`osDiskSizeGb` selects the OS disk size. `shutdownAfterHours` is an optional
experiment lifetime from one to eight hours. The journal persists its deadline
before mutation. A plan arms and reads back an owned UTC cloud schedule before
launching the VM, and checks it again before launch on resume. If Azure rejects a
schedule targeting a VM that does not yet exist, apply stops before launching
compute. This pre-launch provider behavior still requires live qualification.

Registration observations correlate the configured hostname/MAC and cloud
instance. Registration ONLINE remains separate from operational health. The
pinned Azure contract has no operational-health mapping: health admission returns
unknown and stops. Caller-supplied health, BGP, and traffic booleans are rejected.
This repair does not claim GPU or vK8s runtime acceptance.

Resume skips completed journal actions and rejects creation when an owned
resource exists without a completed boundary. Preserve the failed candidate and
investigate the ambiguous action before creating another plan. Ownership checks
remain mandatory for teardown, including shutdown schedules.

Build isolated runtime bundles with `bun scripts/build-ce-runtime.ts platform`
and `bun scripts/build-ce-runtime.ts azure`. Load them as explicit xcsh extensions
in a dedicated test session. The build uses installed Bun and Biome tools and
copies referenced plugin assets into each bundle's `dist/assets` directory.

Validate the repair with
`bun test plugins/platform/test plugins/azure/test plugins/aws/test`.
Full experiment acceptance requires vK8s-submitted pods to execute verified CUDA
computation on the original CE's GPUs, followed by independent absence
inventories. Source tests, image enumeration, registration, and host GPU detection
are separate evidence gates.
