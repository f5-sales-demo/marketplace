# CE UAT79 provider upgrade translation

AWS and Azure Terraform software/OS upgrade configuration now uses the published provider action schema: `site` plus `software_version` or `os_version`. The action authorization digest binds those provider values. Verified REST request comparison remains separate and retains `name`, `namespace`, `version` and `force`.

Both translation regressions failed before repair. Focused upgrade/retirement validation passes 18 tests with 126 assertions; the full four-plugin suite passes 2038 tests with 12446 assertions. Four compilers and runtime builds, presentation coverage (478 assertions), generated assets/public mappings/readiness (8 tests/44 assertions), and manifests pass.

Public provider tag v15.12.1 resolves to commit `2671e34d85a46fd390df80bb2fe97089c47b0c28`. Its source and installed action schemas agree. Real Terraform validates and plans both actions, verifies the exact invocation values/digest and produces ordinary no-change plans for AWS on 1.16.5 and Azure on its pinned 1.16.1. Provider invocation against a loopback test API verifies the REST mapping;
this is synthetic API evidence, not a live CE upgrade.

All four plugins advance to UAT79. UAT78 failed installed validation before stage retirement; that fixture and diagnostics remain preserved. Exact UAT78 CI is green, but that does not reverse its installed failure. Fresh archive-installed upgrade and terminal-retirement checks remain pending for UAT79.

The complete live matrix, supported SLI control/freshness, six-interface transition, failed 212977 ms versus 45000 ms recovery criterion, producer publication/qualification, independent live cleanup, fleet convergence and explicit UAT acceptance remain open. PR1565 stays draft with auto-merge disabled; no normal release is authorized before acceptance.
