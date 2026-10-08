# Plugin additivity remediation

**Status: in progress.** Source fixes are released and installed; required final result gates remain open.

Host fixes merged in [xcsh #4827](https://github.com/f5-sales-demo/xcsh/pull/4827) , and immutable
[23.0.3](https://github.com/f5-sales-demo/xcsh/releases/tag/v23.0.3) passed the full release pipeline. Both daily hosts run 23.0.3. All 17 affected plugin fixes
merged in [marketplace #1514](https://github.com/f5-sales-demo/marketplace/pull/1514) and are published. Ubuntu has all 17 installed; Mac has the 16 supported
plugins. KVM runtime belongs on Ubuntu. ASM 2.1.1 is installed on both as the control. No native setup ran.

Validation: 10,100 host tests passed, 562 skipped, zero failed. TypeScript, documentation quality, 29 documentation tests, full frozen plugin suites, and
published-runtime validation of 27 agents passed. The audit TypeBox import errors did not recur after supported dependency preparation. Combined source probing
ran 102 cases across 17 runtime extensions with no host prompt, inventory, selected-tool changes, or hard blocks.

Every installed cache file matched its released Git tag: 35 host/plugin receipts, zero mismatches. Plugins publish tags/releases without uploaded archives;
these receipts prove commit/file equality, not immutable release-archive equality. The Mac archive and installed Ubuntu binary match immutable xcsh release
digests.

Ubuntu completed three consecutive installed replays of untrusted input, public research, follow-up research, AWS identity, and unrelated work. Mac completed
three untrusted, follow-up, AWS identity, and unrelated gates, but public research succeeded twice then returned zero sources. Further replay also returned zero
sources. Three subsequent consecutive research and follow-up replays passed with usable sources; earlier failures remain in the evidence. A valid empty search
is success at the tool boundary, but fails the required evidence gate. Direct source reads do not replace that gate.

The original Mac refusal remains unattributed. Its exact fixture now passes with unchanged model route and complete tool inventories. Observed requests used a
32,000-token output ceiling and automatic tool choice. Historical `length` with zero usage does not prove token exhaustion or a plugin-caused refusal.

Real child-agent checks completed find/read, verified public research, and permitted nested delegation, with no child write/task capability where excluded and
parent capabilities preserved. Installed mixed inspection/research and authenticated Azure/GCloud/Salesforce/GitHub reads passed. Missing Firecrawl service
affected only its scoped operation; calculation continued. Ubuntu KVM readiness returned `setup_required` ; remediation is outside live UAT.

Offline catalog synchronization merged in [xcsh #4830](https://github.com/f5-sales-demo/xcsh/pull/4830) . Final acceptance remains in
[marketplace #1515](https://github.com/f5-sales-demo/marketplace/pull/1515) . Do not close remediation while historical refusal attribution, unavailable
plugin-specific live gates, next-release offline catalog installation, or immutable plugin-archive verification remain unresolved.

Original audits remain unchanged. Raw traces and authenticated payloads remain private. The [JSON report](plugin-additivity-remediation.json) maps F01–F14 to
implementation, release, installation, and result evidence.

Installed daily-profile configuration find/read and named Firecrawl nested delegation passed with parent capabilities preserved. No native setup or infrastructure mutation ran.
