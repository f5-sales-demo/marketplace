# Herdr #1800 setup contract repair

Child of marketplace #1579 and #1599. This source repair targets plugin 1.3.3.

## Problem and behavior

Plugin 1.3.2 shipped an internal setup version of 1.1.4. Setup therefore passed
an obsolete version to installers and rejected receipts carrying the shipped
manifest version. Two behavioral regressions reproduced both failures before
repair (13 passing, 2 failing tests).

Setup and verification now derive their plugin version from the shipped JSON
manifest on Linux, macOS and Windows. Strict receipt provenance checks remain:
old plugin versions, binary versions, protocols, targets, paths, URLs and hashes
are rejected before binary execution. Installer smoke tests also derive the
plugin version from the manifest.

## Independently verified binary release

Stable Herdr v0.19.4 is an annotated tag with object
`31d3dc4f625ad67f21829970315ee3eab0f4ac13`, peeled to source commit
`1a2f1278ba885f16851ed37b1fa2062ebb952650`. All five pinned binary assets were
downloaded on Mac and independently hashed against release metadata and the
per-asset checksum files. Linux x86_64 was independently downloaded and hashed
on Ubuntu. Native downloaded binaries report `herdr 0.19.4` on both hosts.

| Asset | SHA-256 |
| --- | --- |
| linux-x86_64 | 19620e7fc6f37347e1478cc0533b629984f1bee966ac896cb5f434447ed0067c |
| linux-aarch64 | 55415378f850025820cb7ab5728a1b2721246879a9ce7e6431be956a0a38e05c |
| macos-x86_64 | 692659892053794169bcc81deb52a94a778fe20cb38b96b4305b89da244edde2 |
| macos-aarch64 | 34ca05f2187127eae2e6285c0181b727c4ec42eae73d0047c8570fe056db928b |
| windows-x86_64.zip | b2d064a0bb726eada8bec81bed7554a55a230c1e4e785138f641012cdc6ecbfe |

## Local verification

- `bun test plugins/herdr`: 21 pass, zero fail, 89 assertions.
- Herdr plus integration lifecycle and tracker: 92 pass, zero fail.
- Herdr plus lifecycle on minimum runtime 23.5.1 and stable runtime 23.9.5:
  83 pass, zero fail in each lane (690 assertions on Mac, 689 on Ubuntu).
- Canonical discovery remains runtime 23.8.0. Inventory, tracker and ownership:
  12 pass, zero fail; all 22 plugin manifests validate.
- Mac Unix release smoke installs and verifies in a temporary home, then repeats
  without replacing the binary. No working host installation is changed.
- Biome, ShellCheck, shell formatting and changed-scope privacy checks pass.

Raw logs, downloads, release metadata and failed regressions remain private.
Ubuntu Herdr/lifecycle/tracker/ownership/inventory checks pass: 95 tests and
1,195 assertions. Ubuntu minimum/stable lanes, temporary-home release smoke,
pre-commit, catalog, version-bump and privacy checks also pass. Full repository
and hermetic checks both pass on Ubuntu; Windows CI remains a delivery gate.

## Remaining acceptance

This receipt establishes source behavior and independent binary provenance.
Plugin publication and installed qualification require the green #1800 PR to
merge, immutable plugin artifact verification and installed plugin upgrades.
Actual host setup requires separate explicit authorization and a fresh receipt
from shipped setup; historical host receipts must not be rewritten. Verify
status and safe reads after that setup prerequisite is satisfied. No running
Herdr server was replaced or restarted. Historical receipts and unrelated panes
are preserved. #1579 remains open.
