# Firecrawl 1.4.2 publication and installation

Campaign [#1579](https://github.com/f5-sales-demo/marketplace/issues/1579),
acceptance [#1590](https://github.com/f5-sales-demo/marketplace/issues/1590),
artifact receipt [#1711](https://github.com/f5-sales-demo/marketplace/issues/1711).

## Immutable source and archive

Merged implementation PR #1706 delivered source
`0d3838f625a284787afc9d0ca29a08566fc04241`.
The immutable `firecrawl/v1.4.2` tag resolves to that commit. The published
release records the same target. An independently downloaded GitHub source
archive has SHA-256
`bd03392bd5fa3bd38ff1216b88a5e71569c5b1d24ac0e42ca844e22a8bc543eb`.
All 27 tracked Firecrawl files match the tag byte for byte; archive coverage
has no missing or additional plugin files. Per-file digests remain private.

## Installed artifacts

Normal `xcsh plugin upgrade firecrawl@f5-sales-demo-marketplace` succeeded on
Mac and Ubuntu, selecting 1.4.2 in each actual user plugin registry. All 27
installed tracked files match the downloaded archive and immutable source.
Registry selection was strictly validated before resolving the plugin path.

Both resolved runtimes report `xcsh/23.9.3`. Mac resolves the published
Homebrew Cask binary; Ubuntu resolves `~/.local/bin/xcsh`. Existing credentials
and service configuration were preserved. No setup or service operation ran.

## Remaining acceptance

Publication and installation do not establish rendered or executed acceptance.
Result rendering requires the stable runtime containing xcsh #5039, followed
by fresh normal-dispatch captures on both hosts. Runtime repair #5044 must
pass CI before that stable release can proceed.

The user deferred Firecrawl and other account-dependent gates. Initial default
Firecrawl endpoints refused connections on both hosts; no account request,
service startup or new endpoint probe was attempted here. The exact next
service action after the user resumes that gate is to select an existing
authorized reachable service with `FIRECRAWL_API_URL`, verify its identity and
health separately, then execute the approved safe read-only scenarios.

Historical source receipts and failed captures remain preserved. Complete
layout, lifecycle, live appearance and safe shipped-workflow gates remain open.
Neither #1590 nor #1579 is closed by this receipt.

## Receipt validation

After merging current main and the Devcontainer retirement, canonical tracker,
inventory and renderer ownership checks passed: 12 tests, 506 assertions.
Changed-scope privacy enforcement and audit, terminology lint and whitespace
checks passed. All 87 Devcontainer retirement records remain preserved.
