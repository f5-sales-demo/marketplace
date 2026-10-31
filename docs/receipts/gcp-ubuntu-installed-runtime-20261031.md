# GCP Ubuntu installed-runtime qualification

Issue: <https://github.com/f5-sales-demo/marketplace/issues/1559>. Draft PR:
<https://github.com/f5-sales-demo/marketplace/pull/1698>.

Attempt 312 qualifies the current staging snapshots on the Ubuntu workstation. The user explicitly
routed development runtime acceptance to Ubuntu because the managed MacBook cannot sign software.
Historical Mac receipts and immutable v12.3.1 assets remain preserved.

## Source and installation

The clean candidate is `a0a7ef5e062671d9df9b665aa2dce116cb249137`. The distinct local catalog
`issue-1559-attempt312-ubuntu-staging` freezes 489 tracked files. An isolated xcsh worktree uses
`33d1e443da267361b1be4af8936941b82a57198c` and Bun 1.4.2. The documented dependency bootstrap,
source-matched Linux native preparation and ordinary `bun dev -- --help` passed. The tracked runtime
tree remained clean.

Supported user-scope marketplace installation automatically installed Platform with GCloud and left
optional Terraform absent. Explicit Terraform installation then passed. All 489 installed files
matched their frozen hashes. GCloud 1.7.25, Platform 6.3.9 and Terraform 2.4.4 passed status,
disable/enable and upgrade command checks. Interactive GCloud setup reported ready without
additional setup. Doctor found the plugins directory and retained package-manifest and node_modules
warnings; those warnings are not reported as resolved.

The first status check omitted `XCSH_TENANT` and correctly reported Platform unauthenticated and
GCloud dependency unavailable. Its evidence remains preserved. A distinct successor supplied the
tenant derived from the existing Ubuntu context URL; both integrations then reported ready. Original
settings and context hashes were verified throughout. No Mac credentials were transferred.

## Ordinary configured-model runtime

The existing Ubuntu model credentials passed a minimal authentication prompt. Two ordinary RPC
sessions verified `gpt-6.1-sol`, installed GCP skill availability and actual registered wrapped-tool
execution:

- `gcp_ce_upgrade` preserved the native default.
- `gcp_ce_failover` preserved explicitly requested Terraform.

Both returned schema-two `gcp_operation_not_qualified` refusals with `mutationAttempted=false`. This
verifies execution and engine-specific unavailable behavior; it does not qualify those lifecycle
mutations.

An ordinary 120-by-40 SSH terminal session ran `bun dev` without `--plugin-dir` or a replacement
plugin/fetch interface. It rendered ready setup, skill-driven discovery, the registered upgrade
result and all five required tool/refusal markers. An independent ANSI screen reconstruction
retained the complete visible refusal. The session exited naturally through `/exit`. This is bounded
rendering acceptance, not full visual acceptance.

A separate configured-model session used an isolated unauthenticated GCloud configuration and
executed exactly one registered discovery call for the explicit project and region. It returned
`validation_or_read_failed` with `mutationAttempted=false`. An independent supported GCloud read
returned zero accounts. The success-only probe classifier rejected that intentional tool failure; a
separate retained-evidence review verified the expected refusal without replaying the prompt or
claiming a more specific authentication diagnosis.

## Retention, cleanup and remaining gates

Seven refusal-classifier tests passed. Before supported removal, all 489 plugin files were retained
and verified again. `plugin uninstall` removed only the three isolated staging plugins; final
listing was empty. An independent Linux kernel inventory verified all 32 original recorded process
identities, groups and sessions absent after natural shutdown. No process signals, sudo, MDM changes
or cloud infrastructure submissions were used. Historical capture flags and unresolved locks remain
unchanged.

Private source, execution, tool, terminal, rendering, byte-parity and cleanup evidence is retained
with hashes. No credentials or raw transcripts are published.

Issue 1559 remains incomplete. Production credential lifetime and long-apply refresh qualification,
exact Platform/provider workspace integration, production final capture and executor admission
remain open. Missing GCP mappings, live native/Terraform lifecycle and traffic campaigns,
independent cleanup, review/CI, publication and published installed acceptance must still pass. PR
1698 remains draft.
