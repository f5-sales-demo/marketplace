# Salesforce native presentation baseline

Capture implementation source: `d199cf4be2f48814a9caf8edc4035902c4451ce6`.
Installed Salesforce: 2.3.11, immutable source
`917143c428206f5876debf727e666d999fb81b80`. Native binary: xcsh 23.6.8 on the
corporate MDM MacBook. Both plugin and binary targets were resolved from the
actual installation before capture. Ubuntu/NUC service access is unavailable
for this campaign; live Salesforce operations run on the MacBook only.

## Automated evidence

| Check | Outcome |
| --- | --- |
| Actual native runtime and registered tools | All six installed Salesforce tools registered through the native injected API |
| Fixture renderer matrix | 780 captures, zero failed checks |
| Fixture viewport pages | 4,375 Herdr page captures, zero missing native capture markers |
| Live supported-host matrix | 360 native renderer captures, zero failed checks; all six tools returned successful results |
| Exact commands | Captured native frame commands reconstructed in Bash and Zsh against an argv recorder |
| Literal data | Zero, false, empty strings, literal shell-sensitive text and CJK retained |
| Monetary formatting | Zero and grouped two-decimal values retained in fixture results |
| Theme/preset switching | Both themes and Unicode/ASCII/Nerd exercised in the running native process |
| Fixture pipeline progress | 38 observed refresh requests; zero after completion |
| Live pipeline progress | 374 observed refresh requests; zero after completion |

The requested renderer widths are 40/76/120/153 columns, collapsed and expanded.
The actual native terminal viewport is 150 columns, so that width was independently
captured too. Requested 153-column renderer buffers are preserved in full;
Herdr viewport observations explicitly record the available width rather than
claiming a wider physical viewport. Each frame was inspected serially for
bounds, required values, tool outcome, credential leakage and exact command
copying. The native capture uses the installed binary's exported
`ToolExecutionComponent`; it imports no substitute runtime or private renderer.

The fixture run executes installed tools against deterministic synthetic CLI
responses. The live run executes those same installed tools against the
configured authorized Salesforce service. These are separate evidence tiers.
The controller triggers the registered tool lifecycle handlers and captures
actual UI refreshes; it does not make model calls or qualify model tool-selection
behavior. Original source tests and installation receipts remain separate.

Private receipts:

- `private:salesforce-2.3.11-native-20261018/inspection-summary`
- `private:salesforce-2.3.11-native-20261018/page-summary`
- `private:salesforce-2.3.11-native-live-20261018/inspection-summary`
- `private:salesforce-2.3.11-native-live-20261018/manifest`

Raw ANSI, native frame records, page captures, detailed findings and rendered
frame images stay in owner-only private files. Public records contain outcomes
and provenance only. Organization details and financial values are not included
here. Captured credential patterns cause failure before frame persistence.

## Visibility and remaining gates

Ghostty, Terminal and iTerm computer-use access was rejected by automatic
approval review with the stated reason "for safety reasons." Capture continued
through the explicitly authorized Herdr CLI and the actual native renderer.
Frame images are renderings of native ANSI buffers, not desktop screenshots.
Desktop compositor/font raster fidelity is therefore not established by these
images. Native text/geometry, actual Herdr visibility, command copying and
refresh behavior are independently recorded.

This fresh baseline replaces the missing historical visual records for contract
qualification; the original immutable 2.3.11 installation receipt is preserved.
Shared-runtime adoption remains pending under
[xcsh #5000](https://github.com/f5-sales-demo/xcsh/issues/5000). Migration must
preserve this baseline and rerun the native capture workflow.

## Reproduce

Run from a managed Herdr pane on the authorized MacBook, using a fresh private
capture directory:

```sh
python3 scripts/start-salesforce-capture.py /absolute/private/capture --mode fixture
# Read the created pane ID from the JSON startup result.
python3 scripts/drive-salesforce-capture.py /absolute/private/capture --pane PANE_ID
python3 scripts/capture-herdr-pages.py /absolute/private/capture --pane PANE_ID
```

Use a separate private directory and `--mode live` for the live supported-host
pass. Inspect retained frames without rerunning services using `--inspect-only`.
Do not replay live checks on unsupported hosts. Retire only the owned capture
pane after preserving its receipts; the completed milestone retired both panes
and restored the previously focused workspace.
