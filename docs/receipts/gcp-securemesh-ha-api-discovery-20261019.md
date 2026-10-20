# Secure Mesh CE HA live API discovery

A fresh private campaign used marketplace source
`f7d9e4b19d26416c996cfb767b858f7be2920f1c` and only
`xcsh_securemesh_site_v2`. It verified eighteen original owned objects,
an exact no-change plan and resume without another submission. All three
original nodes became ONLINE with both isolated NIC joins. Seventeen observation
rounds were retained, including a separate thirty-minute health window.

Component status converged to Ready for 19, 19 and 20 returned rows. Global
health converged to PROVISIONED for its matching original hostname only.
Inventory changed between 20, 20 and 21 rows and 24, 24 and 25 rows. The larger
inventory reproduced missing exact status joins for `coredns`, `kube-proxy`,
`vector-agent` and `voucher` on every node. Each node returned two identical
`voucher` inventory rows. A later smaller inventory cannot establish completeness
or qualify an exclusion for previously observed services.

The all-node diagnosis initially returned HTTP 503, then supplied an exact map
of the three original node names. Every `node_name` matched its map key and
registration status was OK. Its fields concern network connectivity, DNS,
interfaces, routes, time synchronization and registration. It supplies no health
mapping for the four missing services.

The Kubernetes-manifest endpoint returned HTTP 500 with API error code 13:
this Secure Mesh v2 site has no recognized K8s provider for that operation.
It cannot establish the workload inventory here. No legacy AppStack behavior
was used. Virtual Kubernetes objects select execution sites through virtual-site
references, but their object conditions do not establish complete CE service
health. The vK8s lead remains unqualified for the missing service mappings.

The owning API contract still needs inventory completeness, duplicate behavior,
required-service coverage, exact identity mappings and healthy-state semantics.
Each alternative mapping or service exclusion needs explicit owning evidence.
No Terraform creation or teardown defect was established. Provider and image
pins remain unchanged. Public HA admission, contract publication and installed
HA acceptance remain gated; both draft PRs remain draft.

An optional concurrent probe caused the initial controller to stop on its live
operation lock. Original failed attempts remain private. A separate sequential
recovery inspected the same apply and submitted no creation. Separately reviewed
cleanup passed eighteen independent absences, an empty destroy plan and stable
state. Repeated cleanup resume submitted nothing. Historical executables and
campaign evidence remain unchanged.

Raw responses, credentials, Terraform state and saved plans remain private.
