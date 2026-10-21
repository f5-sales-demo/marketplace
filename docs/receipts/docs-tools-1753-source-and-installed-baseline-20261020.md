# Docs-tools source changes and installed baseline

Campaign: #1582 under #1579. Implementation: #1753.

Source `feb4fbb72e6e31b21825a876e8d58a44208acab7`, plugin 1.3.1.
This receipt establishes source guidance and a pre-change installed baseline.
It does not establish executed review or published 1.3.1 acceptance.

The installed Mac plugin 1.3.0 requested the unshipped
`mdx-content-reviewer` skill from `/review-mdx`. Its shipped skill is
`content-reviewer`. The skill also selected changed files ahead of an
explicit caller scope. The agent declared `read`, `find`, `grep` but named
Glob/Grep in its prose. Reports lacked explicit empty/incomplete completion
and complete evidence rules for long findings.

The fix resolves `skill://docs-tools:content-reviewer`, preserves explicit
scope, names the declared tools, and leads with scope, counts and completion.
An empty or incomplete review cannot report clean success. Findings have a
twelve-row preview and remaining evidence once, preserving literal corrections
and zero/false/empty/unknown values. Existing status delegation remains.

Four guidance regressions failed before implementation; all twelve plugin
shell checks passed afterward. Shared shipped-content rendering passed seven
tests and 1,400 assertions in each of the 23.5.1 minimum, 23.8.0 discovery and
23.9.5 stable lanes. This minimum check exercises real published message and
frontmatter components; it is not full installed-loader acceptance.
Tracker discovery remains 23.8.0. Shell lint, changed-file pre-commit and
privacy checks passed after correcting a shell lint finding.

A guarded normal 23.9.5 Mac session read four exact installed 1.3.0 files
(commands, skill and agent) without executing or delegating their instructions.
All four tool results were successful. Each had 48 individually inspected
native ToolExecutionComponent frames: 40/76/120/153 columns, collapsed/expanded,
dark/light and Unicode/ASCII/Nerd. All 192 frames were nonempty and within
width. This is native-buffer evidence, not human font/readability acceptance.
The task-owned session shut down; unrelated panes were preserved.

Private raw evidence remains in `/tmp/docs-tools1753-*`. A broad hermeticity
attempt in the fresh Mac checkout failed on missing plugin dependencies;
that failure is preserved and cannot establish cloud CLI execution or a pass.
A dependency-repaired Ubuntu full-suite and hermeticity run is separate.

Next actions: merge green implementation, verify immutable 1.3.1 artifacts
independently on both hosts, install the exact payload and repeat installed
capture. Execute safe scoped MDX examples for empty, clean, malformed and long
results. Agent delegation acceptance remains blocked while this campaign
session prohibits subagents; do not infer it from rendered instructions.
