# Herdr 1.3.3 immutable and installed qualification

Campaign #1579, plugin child #1599, receipt delivery #1809.

Implementation [PR #1801](https://github.com/f5-sales-demo/marketplace/pull/1801)
is MERGED with green plugin, lint, linked-issue and three-host installer checks.
Immutable tag `herdr/v1.3.3` resolves to its merge source
`32232c6b74c5f2ce1025fab42a6b82b7088e01db`.

Mac and Ubuntu independently downloaded the stable published source archive.
Both SHA-256 values are
`8863a68dacd2170c9e533c1d6a29db2cdb004c7f58839b84e5610ad05874d927`.
All 19 shipped plugin files match Git source at the immutable tag on each host.
The release is neither draft nor prerelease. Source and artifact checks remain
separate from installed and service acceptance.

The normal user-scope `plugin upgrade herdr@f5-sales-demo-marketplace --json`
upgraded each plugin cache to 1.3.3. All 19 actual installed files subsequently
matched their independently downloaded artifact digests. No setup command ran;
the working Herdr server was neither replaced nor restarted.

Each host used its independently verified explicit stable 23.9.5 executable:

| Host | Runtime binary SHA-256 |
| --- | --- |
| Mac arm64 | `0aa0e26857d81bf1fa565ea5bde6c5ead5ae101e96cad91a4adc35d2f7b9136e` |
| Ubuntu x64 | `be6ea45f40f20d36fcad3b1b9aac4763e75720a137f3a974b3779082ae2d0ac2` |

Normal `plugin status herdr --json` exited zero on both hosts and preserved
integration `herdr`, state `setup_required`, reason `invalid_response` and exact
next action `xcsh plugin setup herdr`. This is an observed integration result;
it does not establish readiness or identify a more specific underlying cause.
Historical setup receipts were not rewritten. Default executables were not
changed; discovery remains 23.8.0 and minimum compatibility remains 23.5.1.

The [source receipt](herdr-1800-setup-contract-20261021.md) records behavioral
regressions, current/minimum compatibility lanes and independent stable Herdr
binary provenance. Those fixture checks do not replace installed TUI dispatch,
complete rendered guidance, guarded model execution or supported-host service
acceptance. The missing normal TUI status route remains dependent on
[xcsh #5055](https://github.com/f5-sales-demo/xcsh/issues/5055).

Next actions: qualify normal installed TUI status after the runtime prerequisite
is delivered and independently verified; execute safe shipped guidance after
model admission. Actual host setup needs separate authorization and a fresh
shipped receipt before healthy service acceptance. Windows installer CI proves
fixture behavior; independent Windows installation remains a separate gate.
No account access, display change, deployment, service startup or external
communication occurred. Other panes, queued work and historical receipts remain
preserved. Only immutable publication and installed file provenance advance;
child #1599 and campaign #1579 stay open.

Private evidence roots are `herdr1800-published-mac-20261021` and
`herdr1800-published-ubuntu-20261021`, containing independent archives, API
metadata, source comparisons, installed digests and literal status outputs.
