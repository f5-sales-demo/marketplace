# Sales-engineer 1.2.2 artifact and installed status

Campaign #1579, child #1583, focused qualification #1797.

## Publication and installation

Source repair PR #1767 is merged. Stable release `sales-engineer/v1.2.2`
is neither draft nor prerelease. Its immutable tag resolves directly to
`ae4d181b6feb2a67f899b9783773f93aa4a452da`.
Mac and Ubuntu independently downloaded the tag archive and compared every
one of the 17 shipped files with that source. Both archive SHA256 values are
`e9647cab66db9270925765908ca921103645ee2affaea1dbaeadd4d9daeb2b3f`.
Normal user-scope plugin upgrades installed 1.2.2 on each host; all 17 installed
files match the independently verified archive.

Qualification executable version is 23.9.5. Mac binary SHA256 is
`0aa0e26857d81bf1fa565ea5bde6c5ead5ae101e96cad91a4adc35d2f7b9136e`;
Ubuntu is `be6ea45f40f20d36fcad3b1b9aac4763e75720a137f3a974b3779082ae2d0ac2`.
Resolved defaults remain 23.9.3; discovery remains 23.8.0.

## Exact installed collector

Each host extracted the exact Safe Local Status Collector from its installed
`commands/sales-engineer-status.md`, then executed it in Bash and Zsh against
two harmless private fixture states. The scope includes an apostrophe and spaces.
Collector SHA256 is
`c60234d35fbee3aaa17d994a4b861cb4b7d062ff7e79ee12e80215a63420763d`;
command-file SHA256 is
`7f440cea1daf68ee9c648cca1ba0169403f9c3475f54e88d64a68527d9a90c62`.
Both shells return identical parsed results per case on each host.

| Fixture | Collection complete | Required files | Available files | Warnings |
| --- | --- | --- | --- | --- |
| Empty scope | false | 3 | 0 | 3 |
| Nonempty regular prerequisites | true | 3 | 3 | 0 |

Both cases preserve unknown `demoReady`, zero operational checks, false
preparation and teardown, and false content validation for every reference.
Completion establishes metadata availability only. Every result retains scope,
personas, workflows and literal next action. Fixture and installed bytes remain
unchanged. No credential content, accounts, services or operational preparation
are accessed.

## Validation and boundaries

Installed status regressions pass on both hosts: three tests covering shell scope,
missing/empty/nonfile/indirect prerequisites and guarded metadata inspection.
An attempted full installed suite passes nine tests and fails its marketplace
entry test because the installed cache lacks the repository catalog at the
suite's assumed relative path. This source-checkout test is preserved as a
private failure; it is not treated as an installed product defect or hidden by
fabricating a catalog. The complete source-checkout suite passes separately.

Minimum 23.5.1 and stable 23.9.5 shared content checks passed for the source
repair under #1764; current content checks and tracker/lint/privacy accompany
this delivery. No native command dispatch, model selection, native result
capture, executed demo, live service or presentation acceptance is established
by these direct collector results. Those gates retain exact next actions.

Private evidence roots are
`sales-engineer1797-independent-{mac,ubuntu}-20261021`. They retain release
metadata, archives, per-file hashes, installation paths, raw collector output,
fixture scope and both successful and failed test output. Historical receipts
remain preserved; campaign #1579 and child #1583 stay open.
