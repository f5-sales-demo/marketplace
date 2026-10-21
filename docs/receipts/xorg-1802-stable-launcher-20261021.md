# Xorg #1802 durable launcher repair

Child of #1579 and #1602; source candidate Xorg 1.3.2. Behavioral source
commit: `f6d312d589b95ec484563e9a999b683b4da47617`.

## Reproduced defect and resulting behavior

The installed launcher referenced its removable marketplace cache. Removing a
copied cache broke harmless `--version`; a second regression showed staged-copy
failures did not protect activation (31 passing, two failing setup tests).

Setup now copies the controller, its complete Python library and shipped JSON
manifest into a private, content-addressed runtime payload. It checks the staged
controller with the selected managed interpreter before atomically activating
its exact-argv launcher. Identical installs reuse the payload and launcher;
failed copy or activation retains the previous executable. Existing payloads
must match their digest. Prior payloads remain available to running workers.
Controller and extension versions derive from the shipped manifest.

## Source verification

Mac setup tests: 35 pass; complete Python suite: 49 pass. Fixtures prove cache
removal, copy failure, activation failure, repeated installation, permissions,
and exact arguments including empty strings, quotes, spaces, Unicode and literal
shell metacharacters. All executions use temporary homes; no host setup,
service changes, desktop changes or package installation occurs.

Minimum runtime 23.5.1 and stable runtime 23.9.5 are separate qualification
lanes; canonical discovery remains 23.8.0. Development dependency is 23.9.5.
Both minimum and stable lanes pass 68 presentation/lifecycle tests and 630
assertions. The minimum lane preserves the historical code-section command
shape; the harness reconstructs the actual displayed text in Bash and Zsh.
Mac combined presentation/lifecycle/ownership/tracker/inventory passes 80 tests
and 1,136 assertions. All 22 manifests validate; Ruff, Biome and changed-scope
privacy pass. Ubuntu complete Python suite passes 49 tests; combined checks
pass 80 tests and 1,135 assertions. Both Ubuntu runtime lanes pass 68 tests
and 629 assertions. Full repository and hermetic plugin suites pass on Ubuntu,
as do catalog, version-bump, pre-commit, secret and privacy checks. Raw logs
and the initial minimum-lane harness failure remain private.

## Remaining acceptance

This source receipt does not establish publication, installed qualification or
service acceptance. Merge the green linked PR, independently verify immutable
Xorg 1.3.2 tag/artifact, install the plugin on both hosts and recapture safe
surfaces. Supported Ubuntu controller setup requires separate authorization;
do not rewrite historical receipts or start/restart any services here.
Account-dependent campaign gates remain deferred. #1579 stays open.
