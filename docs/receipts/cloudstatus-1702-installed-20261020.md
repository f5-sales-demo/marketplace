# Cloudstatus artifact and guarded installed workflow receipt

Campaign #1579; Cloudstatus #1592; shared collector guard #1702.
Cloudstatus PR #1703 is merged at
8e29fc09e12822acaf2b7126a085d8de66fee30f. Stable tag `cloudstatus/v1.9.2`
and downloaded archive SHA256:
`52d3b3e49a3728c700c6084fbc7f7b7247c2fc6ba7c917b139aabbe879f0ff44`.
Independent Mac and Ubuntu receipts each compare all 36 source files and all
36 installed files against the tag archive. Both installed registries and
manifests resolve Cloudstatus 1.9.2 with xcsh 23.9.3. Resolved binaries are
`/opt/homebrew/bin/xcsh` and `/home/robin/.local/bin/xcsh`, respectively.
These establish artifact and installation provenance, separately from service
and presentation acceptance. Runtime 23.9.3 remains the latest stable release
observed on 2026-10-20; minimum 23.5.1 and discovery 23.8.0 remain unchanged.

## Actual Ubuntu execution

Observer source 6c64f5d329d55fcd27b53c34dffbc0f9369336a0. The installed
operator read both approved full guidance files and selected the exact shipped
`overall-status` collector once. Its complete fence SHA256 is
`31bc629824e95f66b71ff4bf90b97090dfc1d53829ed22443a81fc5bb60ce8e4`.
Exact scope is `STATUSPAGE_URL=https://www.f5cloudstatus.com`, timeout 30 seconds,
and reviewed description `Collect overall F5 cloud status once`.
No additional tools, retries, delegation or mutations were admitted.
The result succeeded, and the model conclusion distinguished collection time
from source page update time and stated the aggregate-only limitation.
This public status read does not qualify individual components, incidents,
maintenance or other shipped workflows.

An earlier observer rejected the same executable collector because the model
supplied unreviewed description metadata. Both guidance reads completed, but no
collector executed. Its failure journal remains private. The repaired observer
accepts only the exact reviewed description and consumes each collector admission
once, including failure. Repeated, blocked or unadmitted Bash execution events
cannot become native captures. A separate regression repaired wrapped JSON field
inspection without concatenating different fields or crossing frame rules.

## Native appearance evidence and open gates

The published binary's real ToolExecutionComponent and AssistantMessageComponent
produced 96 frames: each result at 40/76/120/153 columns, collapsed/expanded,
dark/light and Unicode/ASCII/Nerd. Every frame received individual identity,
width, outcome and literal-evidence checks. The original inspection recorded 30
failures and remains preserved. Reinspection of those same immutable frames
with the repaired JSON field inspector reports 24 failures: every collapsed Bash
frame hides the actual result behind the command description. All 24 expanded
Bash frames and all 48 model-conclusion frames pass. Complete wrapped JSON evidence
is present in expansion; the earlier six expanded findings were inspector defects.

Runtime prerequisite: <https://github.com/f5-sales-demo/xcsh/issues/5039>.
Next action: deliver runtime-owned bounded Bash result summaries through a tested,
green linked PR and stable artifact; independently verify installation and
recapture on both hosts. Normal transcript scrolling, other Cloudstatus surfaces,
all outcome cases and lifecycle acceptance remain unqualified. Parent delegation
remains blocked pending separately proven nested guard propagation.

The Mac task submission remains queued at position six, with no model or tool
execution events. Next action: allow normal Herdr admission capacity to release,
then inspect the existing submission; do not resubmit or bypass the queue. The
Ubuntu prompt initially reported stalled admission, but later dispatched normally
and completed. It was submitted once. Both raw captures, original inspections,
frame digests and failed admission logs remain private and task-owned.

Current shared focused checks: 34 pass, zero failures. The complete Ubuntu plugin
suite and hermeticity check (354 tests) pass; changed-file hooks and privacy
checks pass. Source tests do not close the presentation findings above. Salesforce
receipts and qualification remain preserved; campaign #1579 remains open.
