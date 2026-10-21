# CE UAT86 computed interface readback

Fresh exact UAT85 installed AWS Terraform discovery, planning and first apply reached registration-pending. Public status and passive diagnosis subsequently verified the exact instance registration ONLINE and site-global health PROVISIONED. These results do not establish interface freshness, routing or traffic acceptance.

The owning resume persisted a preboot MTU replacement plan, quiesced the original instance and created a new logical site with both interface MTUs1500. It then failed readback reconciliation: `Read-only provider input: is_management`. The original instance is terminated; the saved submitted F5 create journal, replacement checkpoint and retained interfaces remain preserved.

The installed XC provider15.12.1 declares nested interface is_primary and is_management computed-only. Terraform replacement configuration excludes these readback flags; native API
projection retains them. Observed SMSv2 provider comparison removes the flags only at the exact AWS/Azure interface path when the installed schema declares them computed-only.
Direct request rendering still rejects them; writable priority, roles and identities still participate in full comparison.

Two regressions fail before correction. Focused99tests/436assertions and full2051tests/12515assertions pass. Four compiler checks and runtime builds pass. The retained submitted request and real replacement API readback match using the exact installed provider schema. Catalog-version mismatch during tracker refresh was corrected; its failure is preserved.

All four plugins advance together to UAT86. Exact archives, installed consumption, submitted-apply reconciliation, replacement completion and final cleanup remain to qualify. UAT85's earlier cleanup still has one deleted-subnet tag entry in both AWS tag APIs, despite exact resource absence.

Full UAT remains incomplete. Preserve Argo, the single-node AWS mutation guard, the failed212977ms/45000ms recovery, supported SLI-control/freshness dependency, six-interface transition, complete matrix, producer qualification/publication and scanner convergence. PR1565 remains draft with auto-merge disabled; normal publication requires explicit UAT acceptance.
