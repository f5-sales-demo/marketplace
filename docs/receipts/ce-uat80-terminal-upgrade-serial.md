# CE UAT80 terminal upgrade serial provenance

UAT79 corrected AWS/Azure provider upgrade schemas and passed six archive-installed public software/OS cases on xcsh 23.8.0, 23.9.3 and 23.9.5. Validation and action planning used the real published provider; apply completion and CE observations were synthetic.

Installed terminal teardown then retired both upgrade stages, F5 and root runners, but public repeat failed because parent cleanup removed `terraform-ce-upgrade-serial.json`. Independent local inventory confirmed four minimal retired runner directories and absence of sensitive parent artifacts. The failed repeat and fixture remain preserved; UAT79 terminal acceptance is failed.

Parent cleanup now retains the serial admission ledger whenever immutable upgrade sources exist. A regression reproduces the missing-ledger failure before repair, verifies upgrade retirement after parent cleanup and rejects active serial evidence on resume. This retains admission verification throughout terminal recovery. All four plugins advance to UAT80.

Source validation, exact archives and installed terminal recovery require separate receipts. The complete live matrix, SLI control/freshness, six-interface transition, failed 212977 ms versus 45000 ms recovery criterion, producer publication/qualification, independent live cleanup, fleet convergence and explicit UAT acceptance remain open. PR1565 stays draft with auto-merge disabled.
