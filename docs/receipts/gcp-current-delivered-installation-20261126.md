# Current delivered GCP installation and runtime qualification

Issue: <https://github.com/f5-sales-demo/marketplace/issues/1559>.
Delivery: draft PR <https://github.com/f5-sales-demo/marketplace/pull/1698>.
Marketplace source: `e5c050be63d5df61a759cfeb75b1247d24234e01`.
This receipt qualifies installation and bounded runtime behavior. Full GCP
feature acceptance, review, publication and published installation remain open.

## Supported snapshot installation

Attempt a3634 installed GCloud 1.7.97 from a distinct staging catalog through
the supported marketplace CLI into an isolated user scope. Platform 6.3.41
was installed automatically. Terraform remained optional and was explicitly
installed at 2.4.198. Exact installed bytes, source-matched native readiness,
integration status and doctor passed. Existing user settings were preserved.

Attempt a3656 verified disable/enable and supported removal of all three
plugins. The final registry and plugin list were empty. Attempt a3657 used
authentic snapshots `7558ae8d4b71908a55a618527eef53a689cd7d26` and
`e5c050be63d5df61a759cfeb75b1247d24234e01` in a separate scope to verify
Terraform 2.4.196 to 2.4.198 upgrade preview and execution. Dependency
installation, current installed bytes, status/doctor, disable/enable,
removal and preservation of existing settings passed. Installed bytes and
private logs remain retained. These checks do not replace forced setup or
published installation acceptance.

## Ordinary installed Ubuntu runtime

Ordinary `bun dev` used xcsh 25.0.0 source
`d49dd10d154895f21e15c16686c91b0a5d698cad`, Bun 1.4.5 and its
source-matched Linux native addon. The configured model was `gpt-6.1-sol`.

| Executable | SHA-256 |
| --- | --- |
| Bun | `f05d28a3862f4b84395c7fa32480b835dd47482e80b7e7a49a115227f0c06083` |
| Linux native addon | `a706dd05d89617cba3089327a3daddf83dff014552becf57694b0a8e187a2e59` |

Attempt a3651 independently verified two canonical
`/skill:gcloud:gcp-ce` expansions and ten unique completed tool calls.
Cumulative assistant checkpoints were excluded from execution counts.
The registered `gcloud_config_list` executed and rendered. Explicit Terraform
`gcp_ce_failover` and engine-omitted `gcp_ce_upgrade` returned
`gcp_operation_not_qualified`, retaining Terraform and native respectively.
Wrong-engine `gcp_ce_apply` returned `owning_engine_mismatch` before cloud
reads or mutation. The unavailable operations remain unfinished.

Supported `/exit` returned code 0. Attempt a3654 independently verified natural
closure of the original launcher and terminal after their parent reaped its
exited child. Historical windows and sessions remained preserved. The final
private transcript SHA-256 is
`6aae90dfa4722a3b2140457bcb816d81bf56ca83d7fff46b26b799999002eea9`.

Earlier input failures remain retained. An automatic wrapper timeout in a3638
terminated its child; a3639 records that constraint violation. Subsequent input
used exact clipboard paste with restored selections and one reviewed submission.
This continuation cannot be characterized as using zero process signals.

## Prerequisites and retention

Native CI prerequisite [xcsh PR #5241](https://github.com/f5-sales-demo/xcsh/pull/5241)
merged normally at `4da3cf05d6fb2dd723581aa4b16fe02e8df336a8`, after
all applicable checks, including actual ARM native compilation, passed.
Workflow prerequisite [xcsh PR #5243](https://github.com/f5-sales-demo/xcsh/pull/5243)
subsequently completed fresh CI at
`ccd1b0e5f50c09e6451cf1a6e98c56df0811fbaa`. Its original watcher exited
successfully, and a3668 verified normal merge at
`156ba557b8a038ff39c02cc75692a0cd26295f3b` after every applicable check,
including ARM native compilation, passed. Draft PR #1698's original plugin
suite remains running; that partial result does not qualify its merge.

Fresh Ubuntu Google preflight passed, but independent native SDK verification
returned `human_authentication_required`. Configured integration readiness is
not project-access proof. Human sign-in and fresh independent project access
are required before the next cloud campaign.

The a3659 checkpoint and a3660 independent verification retained 462 snapshot
files and verified both original Mac-only source mirrors. Running CI evidence
is explicitly partial. Historical executors, locks, failed captures and immutable
v12.3.1 assets remain preserved. Large retained artifacts have separate hashes.

The [original expiry and setup receipt](gcp-original-provider-expiry-setup-20261126.md)
retains successful same-provider renewal across expiry and forced setup.
xcsh #5231 interruption, ownership, durability and installed/published consumer
gates remain open. Managed insertion, complete original guest capture, both
engines and topologies, networking and lifecycle, content-verified traffic,
original recovery clocks, independent cleanup and restoration remain required.
Required review, current-head CI, merge, qualified publication, verified downloads
and published installation remain open. No new GCP campaign was submitted.
