# Herdr source repair and Mac prequalification

Campaign: [1579](https://github.com/f5-sales-demo/marketplace/issues/1579).
Child: [1599](https://github.com/f5-sales-demo/marketplace/issues/1599).

The locally committed Herdr 1.3.2 payload preserves verified installation evidence
when runtime status returns malformed or non-object JSON. Publication and Ubuntu
qualification remain pending. Installed observations below used 1.3.0 and do not
qualify the changed payload.

## Source repair

The first behavioral regression reproduced a `TypeError` for JSON `null`: twelve
tests passed and one failed. The adapter now validates the top-level object before
reading client/server fields. Null, arrays, booleans, numbers, strings and malformed
JSON return degraded runtime status with `invalid_status`, retaining installation
and managed-context evidence. Existing version, protocol, checksum, receipt and
named-capability guards remain effective. No setup or server replacement occurred.

All nineteen plugin tests passed with 72 assertions. The broader focused suite
passed 95 tests and 1,180 assertions. Manifest and generated-catalog validation,
configured pre-commit checks and staged privacy enforce/audit checks passed.
The privacy scan initially flagged existing fixture home paths in the changed
test file. They now use the scanner's explicit synthetic placeholder consistently;
the failure and intermediate path-mismatch regression remain private.

The isolated hermetic suite passed 354 tests and 2,394 assertions, with no real
cloud CLI dependency. The complete Mac suite reached every plugin and failed
existing Xorg and Zoom Python fixtures. Herdr and KVM passed. The failures include
Mac temporary-path expectations and unsupported host dependencies; their raw
logs remain private. Full-suite green and Ubuntu acceptance are not claimed.

The published minimum-runtime 23.5.1 `IntegrationRegistry` accepted the actual
integration setup definition and separate injected missing-installation and
unsupported-host cases. Neither case spawned a process. This proves the tested
registry boundary; full-loader and installed minimum-runtime acceptance remain
pending.

## Installed baseline

Scoped runtime 23.9.5 on Mac arm64, binary SHA-256:
`0aa0e26857d81bf1fa565ea5bde6c5ead5ae101e96cad91a4adc35d2f7b9136e`.
Installed plugin 1.3.0 reported `setup_required (invalid_response)` with literal
next action `xcsh plugin setup herdr`. Its existing receipt predates the pinned
installation contract. The independently queried connected server reported 0.19.4,
protocol 27, running and endpoint compatibility, with the three required named
capabilities present. That server observation does not satisfy plugin installation
provenance. The existing server, binary and receipt were preserved.

The guarded model workflow admitted exactly five complete reads: the installed
skill and its four Markdown references. Every numbered returned source line
matched its installed file; no denied, extra or Bash tool call occurred. The model
completed one turn and described control authority, ownership and semantic
completion evidence. This qualifies guidance delivery separately from executing
its operational examples; no pane-control example was model-executed.

All 240 appearance buffers passed width and capture-identity checks at
40/76/120/153 columns, both expansion requests, both themes and all three symbol
presets. Independent file-bound inspection reconstructed every expanded numbered
source line with no failures. All 3,240 reconstructed viewport pages across 240
frames passed completeness checks. The capture closed, emitted a session-shutdown
event and returned its task-owned pane to the original shell.

| Private audit | SHA-256 |
| --- | --- |
| workflow-audit.json | `af7738a5e1702854a6c9308b6ce33f1871a6e99f0ce02b4b5361bcbbee6cb20f` |
| pagination-audit.json | `17914280e1c273aaddb20557528bc79436601a25fa7a441f00ba338d23a6fe4c` |
| independent-source-audit.json | `052a7236d6dbb15bfd8fb3f5f3997b13868cf971c583c1ca82015bf0f84f6b3a` |

Private evidence identifier: `herdr1599-guidance-mac-20261020`. Raw captures,
local identities and failed attempts remain private.

## Remaining gates

Tracker reconciliation retains discovery 23.8.0, 22 plugins, 314 surfaces and
2,670 tasks. Herdr and shared fingerprints require current qualification;
Salesforce and historical receipts are preserved. No old installed capture is
promoted to changed-payload acceptance.

Ubuntu SSH repeatedly timed out. Next action: restore the existing route, verify
remote host/user/repository/branch, transfer the issue-owned branch, run complete
Ubuntu checks and create a linked green PR through Ubuntu. After merge, verify
immutable publication and installed contents independently on both hosts, capture
normal lifecycle dispatch and run a restricted safe shipped read-only workflow.
Installation provenance reconciliation requires a separately authorized setup
action; it is not inferred from a running server or included in this campaign.
Campaign and child issue remain open.
