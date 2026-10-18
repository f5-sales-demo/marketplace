# Marketplace presentation tracking receipt

Observed 2026-10-18. Catalog source: `917143c428206f5876debf727e666d999fb81b80`.
This receipt qualifies tracking inventory and validator behavior. It does not qualify
plugin presentation changes or installed/service output acceptance.

The generated inventory contains 23 unique plugins, 326 exposed surfaces and
2,773 task rows: four shared prerequisites, eight gates per surface and seven
delivery gates per plugin. Salesforce 2.3.11 exposes six registered tools.
Content commands, skills, agents and hooks are included alongside native runtime
registrations and lifecycle/advisory surfaces.

Mac and Ubuntu installed runtime version probes both returned `xcsh/23.6.0`.
Their installed registries contain all 23 plugins, including Salesforce 2.3.11.
The canonical tracker records each observed plugin version. These are sanitized
version observations; installed output and service acceptance remain pending.

The inventory uses the exact published xcsh 23.5.1 dependency in the repository
lockfile. Synthetic executable-present and executable-absent discovery runs
capture registrations without executing tool or lifecycle actions. No credentials,
customer records, infrastructure operations, messages or meeting joins are used.

Verification commands:

```sh
bun test tests/presentation-tracker.test.ts
bun test scripts/presentation-inventory.test.ts
bun test scripts/agent-validation-runtime/presentation.test.ts
node scripts/generate-marketplace-catalog.mjs --check
bash scripts/validate-plugins.sh
```

The focused validator has seven passing tests. Actual registration validation
passes on Mac and Ubuntu with exact plugin/surface/task coverage. The existing
presentation suite passes 24 tests on Mac with 21,848 assertions. The common
matrix specifies 48 layout combinations per exposed surface; this receipt does
not claim installed visual inspection for those combinations.

Negative checks reject duplicate/missing IDs, receipt-free or incomplete VERIFIED
evidence, unsupported NOT APPLICABLE claims and blockers without a next action.
Roundtrip/regeneration checks preserve edited evidence and receipts. Source drift
reopens affected acceptance; removed IDs require explicit retirement.

Ubuntu compatibility and broad checks use repository-pinned Bun 1.4.2 and
node-gyp 13.0.2 in a task-owned temporary toolchain. The initial ambient Bun 1.4.3
compatibility failure and missing Python YAML dependency were environment findings;
the qualified rerun reports `All plugin suites passed.` The lockfile compatibility
check reports `All plugin Bun lockfiles are compatible with CI Bun 1.4.2.`
The test environment supplies YAML from its temporary Python environment because
the runner sanitizes executable paths. No plugin implementation was changed.

The qualified Ubuntu hermeticity check reports
`No plugin test depends on a real cloud CLI.` PII enforcement reports clean
for the staged tracking change. Local Markdown lint and Biome checks pass.
