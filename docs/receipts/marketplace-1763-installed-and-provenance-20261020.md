# Current installed publication and provenance evidence

Campaign #1579; children #1582, #1584, #1599 and #1602. Receipt delivery #1763.

## Immutable publication and installation

Each immutable commit tag and downloaded release archive was checked independently
against every tracked plugin file. Each user installation matches those files on
both Mac and Ubuntu. Runtime qualification uses 23.9.5; discovery remains 23.8.0.
Each host's default CLI remains 23.9.3 and is recorded separately.

| Plugin | Version | Published source | Archive SHA-256 | Files per host |
| --- | --- | --- | --- | --- |
| Docs-tools | 1.3.1 | `1b43d164ef958d70407d4bfbb599a5ccba58f35b` | `ad97b78bc933dd343df214bb6b275afdf555e9d01af1cdbf0d7afdd8feb9887b` | 16 |
| Docs-pipeline | 1.2.1 | `f8069a770c024be43091ebab16495881cbea1c88` | `0e8f61663cee8c76fb171b8b40376fca6e5a1462f368932806be56d7c2d6117d` | 16 |
| Herdr | 1.3.2 | `971ef823d93dddfe70870675a8d2d8d91e7a1f5f` | `0c14dd4e07835727ee95d5874046739ac43867c8f1419be82f1b45569b446136` | 19 |
| Xorg | 1.3.1 | `0839044bf042d151cd5c680b26d3047a5acf819e` | `22f7b603de77d88f3ee721d0358dd57c0f396bab631d61dee88bf4c5ebe71d60` | 30 |

The qualified Mac executable SHA-256 is
`0aa0e26857d81bf1fa565ea5bde6c5ead5ae101e96cad91a4adc35d2f7b9136e`.
The qualified Ubuntu executable SHA-256 is
`be6ea45f40f20d36fcad3b1b9aac4763e75720a137f3a974b3779082ae2d0ac2`.
Artifact and installed file matches do not establish service or workflow acceptance.

## Installed guidance observations

The Mac Docs-tools 1.3.1 normal guarded runtime admitted exactly four complete
reads: both commands, the content-reviewer skill and the reviewer agent. All
returned numbered source lines match the installed files exactly. No extra or
blocked call occurred, and no review or delegation ran. All 192 native frames
passed individual identity, width and outcome checks at 40/76/120/153 columns,
collapsed/expanded, dark/light and Unicode/ASCII/Nerd. These checks do not prove
complete rendered-source fidelity or pagination. The capture closed and the
session emitted shutdown before its task-owned pane returned to the shell.

The earlier Mac Docs-pipeline 1.2.1 guarded run admitted five successful guidance
reads and passed 240 native frame identity, width and outcome checks. No preview,
build, release or delegation ran. It closed its capture and session. Literal
fidelity checks were empty; full semantic acceptance remains pending.

The earlier Mac Herdr 1.3.2 run admitted five guidance reads and passed 240 native
frame identity, width and outcome checks. It does not qualify pane-control
execution, installation provenance or the running server.

## Concrete blockers and next actions

- Docs-tools: add a reviewed private fixture-read scenario to the shared guarded
  runner, then execute the shipped scoped reviewer on empty, clean, malformed and
  long local MDX fixtures. Verify resulting messages and complete rendered guidance
  on both hosts. Agent delegation remains unavailable under the current session's
  prohibition on subagents. Keep child #1582 open.
- Docs-pipeline: after #1756 merges green, execute the exact shipped Safe Local
  Status Collector with an explicitly reviewed physical working directory. Then
  inspect current results, source fidelity and Ubuntu guidance. The content-only
  plugin has no registered integration; `xcsh plugin status docs-pipeline --json`
  throws `No enabled integration is registered for docs-pipeline`. This does not
  qualify a ready lifecycle surface. Resolve the manifest/public lifecycle
  representation separately before that gate is accepted.
- Herdr: installed status still returns `setup_required (invalid_response)`.
  The setup receipt describes plugin 1.1.2, server 0.18.0/protocol 26; the adapter's
  internal plugin constant is 1.1.4 and its server pin is 0.19.2. The existing
  connected server is 0.19.4/protocol 27. Reconcile receipt, adapter and supported
  server contract in a focused setup change, then rerun status and scoped safe
  examples. Do not downgrade, restart, rewrite a receipt or infer readiness from
  the running server. Setup application remains outside this campaign.
- Xorg: installed status still returns `degraded (capabilities_probe_failed)`.
  The installed controller launcher embeds the removed plugin cache path for
  Xorg 1.3.0. Direct capabilities fails because that script no longer exists.
  Reconcile the launcher with the published 1.3.1 controller in a focused setup
  change; then rerun Ubuntu capabilities and supported-host captures. The Mac
  controller routes to Ubuntu, so it does not prove native Mac unsupported-host
  behavior. Do not apply setup, start services or alter the desktop here.

## Evidence retention and scope

Private roots are `docs-tools1753-independent-*-published-20261020`,
`docs-tools1753-published-guidance-mac-20261020`,
`docs-pipeline1757-independent-*-published-20261020`,
`docs-pipeline1757-published-guidance-mac-20261020`,
`herdr1599-independent-*-20261020` and `xorg1602-independent-*-20261020`.
Failed downloads, former captures and raw controller/setup outputs remain private.
No credentials, customer data or raw state are published. Historical receipts,
Salesforce qualification and Devcontainer retirement remain preserved. Firecrawl
and other account-dependent service gates remain deferred. Campaign #1579 stays
open until every current gate is verified or legitimately not applicable.
