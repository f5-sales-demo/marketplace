# CE UAT54 restoration refresh checkpoint

An interruption after ordinary restoration refresh replaced the runner journal prevented direct-route resume.
Three regression cases reproduced the failure: lost refresh response, state-ID read failure and phase-write failure.

The owning retirement stage now records a source-bound restoration-refresh phase before replacing the journal.
Resume verifies exact configuration, complete distinct route addresses, AWS resource types, exact state IDs and
fresh original cloud targets. It repeats ordinary planning and the existing no-change/state-ID checks before
relinquishment. It does not replay restoration submission. Seven rejection cases retain changed configuration,
missing/duplicate/foreign state, wrong resource types and unavailable state/cloud evidence as failures.

## Validation

- Linux Bun 1.4.2: 51 focused tests and 168 assertions; 1819 broad tests and 11197 assertions.
- macOS Bun 1.4.3: 1819 broad tests and 11198 assertions.
- Tracker update/check: 478 assertions each; assets/mappings/readiness: 8 tests and 44 assertions.
- Manifests, Markdown inventory, staged PII and diff checks pass.
- Four compiler checks and runtime builds pass; Biome checks 455 files without errors.
- Coordinated versions: platform 7.0.0-uat.54, AWS 3.0.0-uat.54, Azure 5.0.0-uat.54, Terraform 3.0.0-uat.54.

## Remaining qualification

Archive installation, public route restoration, cloud teardown and live route/network preservation are
separate gates. Preparation before durable source/plan persistence and early relinquishment preparation
remain incomplete. UAT53 source passed local Linux and installed baseline checks; its pushed head has no
reported CI checks, so no exact-head CI pass is claimed.

Preserve supported SLI control/original freshness dependencies, the six-interface transition, complete live
matrix, qualified producer publication before repinning, independent cleanup and scanner convergence.
Recovery remains failed at 212977 ms versus 45000 ms. Readiness remains false: 288 rows and 300 blockers.
PR1565 stays draft; normal publication and final UAT acceptance remain pending.

## Read-only installed checkpoint and base repair

Exact UAT54 archives load through isolated installed xcsh 23.8.0 and 23.9.3: 38 tools and 288 schema mappings.
Public teardown reaches the owning session and rejects missing binding before session opening. File traces
show zero CE checkout opens. This synthetic pending-origin baseline does not qualify installed route recovery.

Fresh platform capabilities and Azure discovery pass. Azure reports 63 regions, 48 eligible and accepted
Marketplace image terms. AWS discovery fails on ExpiredToken; all four existing Ubuntu profiles fail STS.
No cloud mutation occurred. The failed AWS attempt and private traces are retained.

Missing CI runs were traced to conflicts with current main. Changelog entries and both tracker evidence
histories were preserved. All four CE plugin trees remain identical to the archived source. Incoming KVM
checks initially used an older dependency pool; its locked xcsh 23.9.5 isolation passes 38 tests / 241 assertions.
Exact merged-head CI remains a separate gate.
