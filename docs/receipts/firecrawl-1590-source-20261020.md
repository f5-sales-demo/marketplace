# Firecrawl status and workflow source qualification

Campaign #1579; acceptance issue #1590; source child issue #1705. Source commit
6c2a18698e84d38809b04a1ed10e97ecceb72dea; candidate Firecrawl 1.4.1.
Discovery runtime 23.8.0 remains unchanged; minimum compatibility is 23.5.1.

The status command, hook and setup verification share a bounded read-only Python
collector. It checks the configured API identity and records optional health and
version evidence separately. It rejects credential-bearing endpoints and redirects,
limits response size and duration, redacts known credential keys, and preserves
zero, false, empty strings and unknown values. Root identity success does not
establish backend or scraping readiness. Polling examples now fail explicitly when
completion is absent and report the last status.

Behavioral regressions cover unrelated HTTP services, malformed and unavailable
responses, nested secrets, redirects, oversized and deep JSON, scalar health,
stalled responses, spaced plugin paths, Bash/Zsh syntax and harmless polling
stubs for completion, failure and exhaustion. No mutating API example was run.

Mac focused checks passed: four integration tests with eleven assertions;
Firecrawl shell suite twenty pass, zero skip or failure, including eleven Python
fixture tests; actual minimum-runtime entrypoint and shipped-guidance rendering
one pass with 1,228 assertions. Guidance checks exercise four widths, collapsed
and expanded output, two themes and three symbol presets. Discovery-runtime
checks, minimum runner isolation/failure propagation, ownership, catalog, tracker,
hermeticity, Ruff, shell and required changed-file pre-commit checks passed.

The Mac full marketplace suite failed in unchanged Xorg and Zoom fixtures.
Private logs retain those failures, including macOS temporary-path normalization
and platform prerequisites. The complete Ubuntu marketplace suite passed at transferred source commit
38bc6494b; it used CI's isolated PyYAML 6.0.3 prerequisite. All plugin
suites passed and runtime dependency manifests, locks and installed packages
were current. Mac failures remain separate evidence.

These are source and guidance checks. They do not establish model tool selection,
executed installed workflow, raster inspection, progress lifecycle, immutable
publication or service acceptance. Both initial installed default endpoints refused
connections. Next service action: select an existing reachable Firecrawl service
using FIRECRAWL_API_URL, verify identity and then run approved safe scenarios.
No service startup is authorized by this receipt.

Installed result qualification requires a stable published runtime containing
xcsh #5039, Firecrawl 1.4.1 publication and independent artifact verification, then
fresh Mac and Ubuntu captures through normal runtime dispatch. xcsh PR #5040
merged; stale Terraform corpus inputs still prevent green publication builds.
Campaign #1579 and acceptance issue #1590 remain open.
