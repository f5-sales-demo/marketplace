# CE UAT86 computed interface readback

Fresh exact UAT85 installed AWS Terraform discovery, planning and first apply reached registration-pending. Public status and passive diagnosis subsequently verified the exact instance registration ONLINE and site-global health PROVISIONED. These results do not establish interface freshness, routing or traffic acceptance.

The owning resume persisted a preboot MTU replacement plan, quiesced the original instance and created a new logical site with both interface MTUs1500. It then failed readback
reconciliation: `Read-only provider input: is_management`. The original instance is terminated; the saved submitted F5 create journal, replacement checkpoint and retained
interfaces remain preserved.

The installed XC provider15.12.1 declares nested interface is_primary and is_management computed-only. Terraform replacement configuration excludes these readback flags; native API
projection retains them. Observed SMSv2 provider comparison removes the flags only at the exact AWS/Azure interface path when the installed schema declares them computed-only.
Direct request rendering still rejects them; writable priority, roles and identities still participate in full comparison.

Two regressions fail before correction. Focused99tests/436assertions and full2051tests/12515assertions pass. Four compiler checks and runtime builds pass. The retained submitted
request and real replacement API readback match using the exact installed provider schema. Catalog-version mismatch during tracker refresh was corrected; its failure is preserved.

All four plugins advance together to UAT86. Exact archives match source `feb1fe5e2182f452a1ec10b4bdc3764c6a6f561e`, verifying754committedfiles. Isolated installed public terminal
teardown/repeat/rejection passes on xcsh23.8.0,23.9.3 and23.9.5 with the source checkout unavailable; cloud/API absence in those lanes remains synthetic. Ubuntu focused
regressions18/84, both changed compilers and tracker pass. Exact-source plugin39653240782 and lint39653241336 are green.

Real installed public apply reconciles the retained submitted F5 operation without replay, records the existing new logical UID and advances through bootstrap and owning launch. It
completes pending-registration at2026-10-21T18:37:58Z. Independent AWS inspection confirms originalinstance terminated, newinstance running, the same MarketplaceAMI and
ownershiptags, and both retained ENIIDs/MACs atindices0/1. Registration, effectiveversions, configuredMTU, operationalinterfaces, traffic and final newfixture cleanup remain
unqualified.

The earlier UAT80 fixture cleanup passes a fresh strict independent audit at2026-10-21T18:39:38Z: both AWS ownership inventories are empty, all ten saved cloud IDs are absent,
logical/physical sites404, registration/token/routing/ingress/interface absence and runner/parent artifact retirement verify. Preserved root/F5 refresh-enabled final no-change
receipts remain valid; no new plan was executed after retirement. The original deleted-subnet inventory failure remains preserved.

Full UAT remains incomplete. Preserve Argo, the single-node AWS mutation guard, the failed212977ms/45000ms recovery, supported SLI-control/freshness dependency, six-interface
transition, complete matrix, producer qualification/publication and scanner convergence. PR1565 remains draft with auto-merge disabled; normal publication requires explicit UAT
acceptance.
