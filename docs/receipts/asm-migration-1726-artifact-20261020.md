# ASM Migration 2.3.2 publication and installed provenance

Campaign #1579, child #1600, receipt issue #1726. Readiness fix #1724 shipped
through green merged PR #1725. Its immutable `asm-migration/v2.3.2` tag resolves
to `d659e5d74e3b424e35b62a6ea85b116029a0631b`. Release workflow
39434785242 succeeded. The release publishes a source archive and has no assets.

Independent Mac and Ubuntu downloads of that tagged archive both have SHA-256
`cd3b3d2fecd2d83d50cc3f5258dcf9169f23cca4c2cd60c3c7a13a3f8425f44e`.
All 41 tracked plugin files match the immutable Git source byte for byte on each
host. Both normal `xcsh plugin upgrade asm-migration@f5-sales-demo-marketplace`
commands exited successfully and selected 2.3.2 in their actual user registries.
All 41 installed files match the independently verified archive on both hosts.

Mac resolves `/opt/homebrew/Caskroom/xcsh/23.9.3/bin/xcsh`; Ubuntu resolves
`/home/<user>/.local/bin/xcsh`. Both report `xcsh/23.9.3`. These observations
establish installed plugin provenance only. They do not establish presentation
acceptance on the latest stable runtime. Version-scoped runtime qualification,
complete guidance and lifecycle observations remain in #1722 and #1723.

The first Ubuntu archive comparison lacked the new merge object before a fetch;
that failed attempt remains private. After fetching, a fresh independent download
and all comparisons passed. Raw downloads, registry evidence and command logs
remain private. Historical 2.3.1 receipts are retained. Account-dependent service
checks remain deferred; after deferral is lifted, use an existing authorized
read-only receipt workflow. Human-reviewed setup remains separate. Issues #1600 and #1579 remain open.
