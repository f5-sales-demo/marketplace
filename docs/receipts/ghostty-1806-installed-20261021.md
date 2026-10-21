# Ghostty 1.2.1 immutable and installed qualification

Campaign: [1579](https://github.com/f5-sales-demo/marketplace/issues/1579).
Plugin child: [1604](https://github.com/f5-sales-demo/marketplace/issues/1604).
Qualification: [1806](https://github.com/f5-sales-demo/marketplace/issues/1806).
Implementation: [1751](https://github.com/f5-sales-demo/marketplace/pull/1751).

Ghostty 1.2.1's published source archive and installed plugin files match on Mac
arm64 and Ubuntu x64. Normal CLI status on both hosts reports setup required
because the setup receipt is invalid. This establishes publication and installed
file provenance; terminal/service and presentation acceptance remain open.

## Immutable publication and installation

The tag API on each host independently resolves `ghostty/v1.2.1` to commit
`42872417ac80e9da490399b87063e49aeb0c1d3c`. The release identifies the same tag;
its downloadable payload is the published source archive, with no attached
release assets. Each host downloaded that archive directly and compared all 11
plugin files byte for byte with Git source at the immutable tag.

Archive SHA-256:
`c770a2b7173680e2d21a8ef1db291632ed3f269d935d1d4fbec6c13df516c11b`.
Both independent artifact audits have SHA-256:
`be8e02583987fcae69efcf40a41bb85e01242dec267fa215ae70fef571df25bc`.

Implementation PR 1751 was independently confirmed MERGED, with merge commit
matching the tag. Its plugin, shell, lint and linked-issue checks passed with no
failed or pending checks. Source/CI remains distinct from installed acceptance.

The Mac already had the exact 1.2.1 user-scope plugin: all 11 installed files
matched the downloaded artifact. Ubuntu initially held an older version; that
failed verification is retained privately. The normal scoped CLI
`plugin upgrade ghostty@f5-sales-demo-marketplace --json` upgraded the plugin
cache to 1.2.1. No setup command ran. All 11 Ubuntu installed files subsequently
matched the independently downloaded source.

Installed extension resolution is `extensions/integration.ts`. Both scoped
qualification executables returned `xcsh/23.9.5` and matched the independently
verified stable release binary digests:

| Host | Runtime binary SHA-256 |
| --- | --- |
| Mac arm64 | `0aa0e26857d81bf1fa565ea5bde6c5ead5ae101e96cad91a4adc35d2f7b9136e` |
| Ubuntu x64 | `be6ea45f40f20d36fcad3b1b9aac4763e75720a137f3a974b3779082ae2d0ac2` |

Default executable resolution was inspected separately; both defaults still
reported 23.9.3. Qualification used explicit 23.9.5 paths. Discovery remains
23.8.0, with the separate minimum lane at 23.5.1.

## Read-only status and contract checks

Both scoped binaries executed normal `plugin status ghostty` and
`plugin status ghostty --json`. Human output was exactly:

```text
ghostty: setup_required (receipt_invalid)
  next: xcsh plugin setup ghostty
```

JSON preserves integration `ghostty`, name `Ghostty terminal`, plugin `ghostty`,
state `setup_required`, reason `receipt_invalid` and the exact next action.
Volatile timestamps and local paths remain private. The suggested setup command
was recorded without executing it. Mac is outside Ghostty's Linux-only service
qualification; its prerequisite snapshot does not prove supported-host readiness
or an explicit unsupported-host screen.

The existing five probe regressions were replayed against each actual installed
entrypoint with synthetic subprocess results: five tests and 18 assertions
passed per host. They retain missing-Python and unrelated-error distinctions,
malformed/non-JSON evidence, literal corrective guidance, zero/false/empty-string
values and failed-process readiness refusal. These are installed payload contract
checks with injected results, not normal TUI dispatch or live service acceptance.

Each installed entrypoint also registered into the published 23.5.1
IntegrationRegistry without subprocesses. Four assertions checked registration,
Xorg/Herdr dependencies, install-plan kind and verification argv. This qualifies
the minimum registration/setup-plan boundary; full installed minimum-runtime
loader and service acceptance remain open. Source fixture suites also ran in
separate minimum/stable dependency lanes: each lane passed 67 tests per host
(619 assertions on Mac and 618 on Ubuntu). These fixture checks do not establish
full installed minimum-runtime loader acceptance.

Focused source lifecycle/qualification/ownership/tracker/inventory checks passed
100 tests on each host (1,326 Mac assertions; 1,325 Ubuntu assertions). All 28
Ghostty Python setup tests passed on each host. Ubuntu's full plugin suite passed;
its hermetic lane passed 354 tests and 2,394 assertions without real cloud CLIs.
Final tracker/inventory checks passed 10 tests and 495 assertions on each host.
Catalog and changed-file lint/privacy checks passed before receipt delivery.
Original failures are preserved privately.

## Remaining gates and safe boundaries

The current stable TUI has no normal `/plugin status` route. Runtime
[5055](https://github.com/f5-sales-demo/xcsh/issues/5055) records the independently
reproduced KVM fallback. Ghostty's normal status matrix remains BLOCKED until the
route has required runtime planning/TDD/audit, a green PR, stable publication,
independent artifact verification and installed replay. No synthetic component
or manually invoked handler is accepted as that missing dispatch.

Next actions: qualify 48 normal installed status frames after 5055; run a guarded
safe shipped-skill review after model admission; independently establish supported
Ubuntu setup/readiness only when separately authorized, then required terminal
capability and physical readability acceptance. Receipt repair, package install,
terminal launch, display change and service startup were not performed here.
The existing invalid receipt must not be rewritten merely to make status ready.

Private evidence identifiers are `ghostty-installed-independent-mac-20261021`
and `ghostty-installed-independent-ubuntu-20261021`. Raw archives, file audits,
installed paths, status output and failed prior-version verification stay private.
Historical source receipts and tracker invalidation records remain preserved.
Only immutable-artifact and confirmed implementation-merge gates advance;
host, full compatibility, service, workflow and cleanup gates remain explicitly
open. Issues 1604 and campaign 1579 remain open.
