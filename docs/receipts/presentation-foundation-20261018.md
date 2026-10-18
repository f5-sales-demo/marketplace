# Shared presentation foundation receipt

This receipt qualifies renderer ownership, installed artifact integrity and the
repaired module-verification path. It preserves the remaining visual and runtime
migration gates in the [canonical tracker](../marketplace-presentation-todo.md).

Implementation source: `1127f5d61998700865cd9de1914de8ddfa6b841b`.
Salesforce source: `917143c428206f5876debf727e666d999fb81b80`, immutable tag
`salesforce/v2.3.11`. Runtime prerequisite:
[xcsh #5000](https://github.com/f5-sales-demo/xcsh/issues/5000). Foundation delivery:
[marketplace #1612](https://github.com/f5-sales-demo/marketplace/issues/1612).

## Renderer ownership

Current canonical coverage remains 23 plugins, 326 surfaces and 2,773 task rows.
The registration guard permits only the existing six Salesforce legacy renderer
overrides. It rejects new imperative tool renderers outside that baseline.
Production-source checks reject runtime-internal imports, direct/indirect imports
of Salesforce presentation and wholesale copies of its private renderer with
comments or whitespace changed. Actual registered entrypoints are checked even
when their paths resemble tests.

Focused checks pass 11 tests with 530 assertions on Mac and Ubuntu. The existing
published-runtime presentation suite passes 24 tests with 21,848 assertions on
Mac. The qualified Ubuntu runner reports `All plugin suites passed.` Required CI
and delivery results are linked from the implementation PR.

The ownership contract separates runtime frame/table/command/progress behavior
from domain scope, units, currencies and evidence. `shared.renderer` qualifies
this ownership and prerequisite tracking. It does not qualify runtime #5000,
Salesforce adapter adoption or native terminal visual acceptance.

## Salesforce artifact and host qualification

The original private receipt `salesforce-1577-ubuntu-install` records the exact
tag/source, 101 installed files and zero errors. It contains no visual findings.
A fresh immutable-source archive comparison verifies all 101 Salesforce files
on both hosts with zero mismatches.

Archive SHA-256:
`2a1edd78982adb31af034ebead92bac953b1ab409dd8c16c4044f0ccdc0162d5`.
The archive was fetched by immutable source SHA after verifying the tag target.
Every Salesforce source file in that archive was compared byte for byte with
the exact installed cache selected by each host's installed-plugin registry.

| Host | Installed plugin | Observed native CLI | Files matched | Salesforce service scope |
| --- | --- | --- | --- | --- |
| Corporate MDM MacBook | 2.3.11 | xcsh 23.6.8 | 101/101 | Authorized supported host |
| Ubuntu | 2.3.11 | xcsh 23.6.0 | 101/101 | Unavailable by access policy |
| NUC | Not checked in this milestone | Not checked | Not checked | Unavailable by access policy |

Ubuntu's installed module registers all six tools and reviews setup with zero
install steps. Its observed readiness state was `setup_required`; this does not
establish service access. Live service checks for this campaign use the MacBook
only. Ubuntu/NUC service unavailability is qualified explicitly and is not counted
as a successful service test or treated as a request to repair authentication.

The original native visual identifiers were unavailable. A fresh automated
[native baseline](salesforce-native-baseline-20261018.md) now qualifies the
contract separately from these source and installation-integrity records.

## Module verification

The repaired verifier injects the requested published runtime's presentation API.
It reports `installed-plugin-module` evidence, installed plugin/runtime package
versions, host and `setupExecuted=false`. Tests qualify successful read-only
acceptance and a non-ready blocked receipt without printing tool response data.
A non-ready dependency leaves the read-only tool unattempted and recommends an
authorized host.

Published runtime used for the module checks: xcsh 23.5.1. This is a compatibility
check against the exact published package and installed Salesforce 2.3.11 module,
separate from the observed native binary versions above. Mac readiness and
read-only org display pass. No setup execution, infrastructure change, external
message or meeting join occurs.

Reproduce source checks:

```sh
bun test tests/presentation-ownership.test.ts
bun test tests/installed-salesforce-verifier.test.ts
bun test scripts/presentation-inventory.test.ts
```

Fresh native renderer and supported-MacBook service captures are recorded in
the linked native baseline receipt. Shared-runtime adoption and model-selection
qualification remain pending under their separate IDs. Raw runtime diagnostics and any
organization responses remain private; this receipt contains outcomes and
provenance only.
