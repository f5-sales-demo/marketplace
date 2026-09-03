# Azure Customer Edge Inventory

Build a deterministic, read-only inventory of existing F5 Customer Edge resources across one Azure
subscription. The tool owns Resource Graph paging, VM instance-view collection, Activity Log evidence,
privacy filtering, platform correlation, classification, canonicalization, and artifact persistence.

Pass the subscription UUID. Caller identity and non-secret platform-site evidence are optional. The result
keeps provisioning, runtime, platform, routing, and traffic-health evidence separate. Caller association is
historical evidence, never an ownership claim. Public and private addresses, prefixes, public-resource FQDNs,
bootstrap data, secrets, arbitrary tags, raw events, and continuation tokens are excluded. Do not substitute
generic `az_exec`, deployment discovery, planning, mutation, or web research for this inventory operation.
