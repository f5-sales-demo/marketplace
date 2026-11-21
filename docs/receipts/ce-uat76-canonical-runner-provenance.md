# CE UAT76 canonical runner provenance

Installed UAT75 validated the multi-platform AWS lock, produced an ordinary no-change root plan and retired both real Terraform runners. Parent cleanup then rejected their receipts because it compared raw manifest bytes with the owning runner's canonical manifest digest. Sensitive parent journals remained intact; the failure is retained.

Parent cleanup now uses the same canonical manifest identity as the owning runner. Its separate inventory still records raw file digests and rejects changed files during removal or resume. Owner, stage, backend, evidence and final-plan checks remain required. Regressions use canonical runner receipts and fail before the repair.

All four plugins advance to UAT76. Exact installed public teardown and resume use real Terraform with synthetic cloud/F5 responses. These receipts do not establish live cleanup, vendor interface control/freshness, the complete CE matrix, recovery within 45 seconds, producer qualification or UAT acceptance. Upgrade action-stage retirement remains unqualified.
