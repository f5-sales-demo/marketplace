# CE UAT61 interface object identity rejection

Installed UAT60 public AWS Terraform apply incorrectly admitted two MAC/device/node/role rows sharing a generated interface object name. A whitespace-only name was also admitted in source execution. Both new source regressions failed before repair.

Direct route activation now requires distinct nonblank generated interface names in addition to exact node, role, MAC, device and verified-up evidence. Rejection precedes configuration revision, planning and activation submission. All four plugin versions advance together to UAT61.

Source validation passes 24 focused tests / 68 assertions, 1912 four-plugin tests / 11529 assertions, and all four compiler checks and runtime builds. Installed UAT61 and live behavior remain separate qualification gates. Retain the failing UAT60 installed receipt. Collection time does not establish original publisher freshness.

Readiness remains false: 288 required rows / 300 blockers. Recovery 212977 ms against 45000 ms remains failed. Vendor control/freshness, six-interface transition, full live matrix, producer publication/qualification, independent cleanup and explicit final UAT acceptance remain open. PR1565 stays draft and auto-merge disabled; no UAT delivery or normal publication.
