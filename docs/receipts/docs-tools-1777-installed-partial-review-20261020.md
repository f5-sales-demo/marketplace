# Docs-tools guarded installed partial review

Campaign #1579, child #1582, evidence delivery #1777. This receipt establishes
Mac installed capture and one scoped interpreted reviewer example. It does not
establish full slash-command resolution, agent delegation or overall acceptance.

## Provenance and admission

Docs-tools 1.3.1 is published at immutable commit tag `docs-tools/v1.3.1`,
source `1b43d164ef958d70407d4bfbb599a5ccba58f35b`. The independently downloaded
archive digest is `ad97b78bc933dd343df214bb6b275afdf555e9d01af1cdbf0d7afdd8feb9887b`.
All 16 tracked plugin files previously matched the installed payload; the seven
files actually read in this run were freshly compared to their exact source.

The resolved qualification executable is `~/.xcsh/qualification/23.9.5/bin/xcsh`,
runtime 23.9.5, Mac binary SHA-256
`0aa0e26857d81bf1fa565ea5bde6c5ead5ae101e96cad91a4adc35d2f7b9136e`.
Default runtime 23.9.3 and discovery runtime 23.8.0 remain separate.

Observer and qualification source match merged
`f09851f89311fefb2e523fdc34e7d8af313353a9` byte for byte. Their respective
SHA-256 digests are `7c77a3402647b3e507b0bbe6418fc98f0e6d32e79e05d77acd2f3990512d15f5`
and `b50bb4b60bc9b6384710e7b9c6002f42e816fd1283b33f96c952a1b56e355689`.
The execution checkout also contained an unrelated MEDDPICC source change;
this scenario loaded only the installed Docs-tools payload and these merged
observer files. It did not use the pending long-guidance change.

Scenario `docs-tools-1.3.1-partial-fixture-review-canonical`, SHA-256
`7dec78dafc5123be4c13c561b596c6036577eb8652cedacab3877cbce815e099`, admitted
exactly seven `read` calls after observer readiness. No extra or blocked call
occurred. All seven execution IDs joined successful results and the final
assistant turn completed. Bash, writes, network, delegation and structure
probes were unavailable. The fixture was private, canonical and digest bound.

## Complete reads and observed result

| Read | Complete numbered lines |
| --- | --- |
| `commands/review-mdx.md` | 36 |
| `skills/content-reviewer/SKILL.md` | 256 |
| `references/frontmatter-schema.md` | 65 |
| `references/mdx-pitfalls.md` | 112 |
| `references/allowed-imports.md` | 62 |
| `references/component-signatures.md` | 129 |
| Private synthetic MDX fixture | 12 |

Reference paths are relative to the content-reviewer skill. Every numbered
result matched its file completely, including the final empty line.

The interpreted review preserved the caller's single-file scope and reported
one reviewed file, zero skipped files, two errors, zero warnings and one info.
It marked completion **Incomplete** because repository-wide structure checks
were unavailable, rather than treating unverified structure as a finding.

- Line 9: bare `<` in prose; literal correction `Latency &lt; 5ms.`.
- Line 11: undefined `missingSnippet`; literal empty-string export
  `export const missingSnippet = "";`, with advice to supply the intended snippet.
- Line 3: recommended `sidebar.label` missing; the suggested block preserved
  `order: 0` and used the synthetic fixture title as the label.

The report included every finding once, its location and literal correction.
The explicit next action was to supply the intended content-repository root
and run the landing-page, image-directory and root-level MDX structure checks.
No file mutation or build occurred. This is model execution evidence distinct
from source regressions and deterministic rendering.

## Native captures and closure

Six actual guidance reads produced 288 native ToolExecutionComponent frames.
The fixture result and final assistant message produced 96 separate frames.
Every case covered 40/76/120/153 columns, collapsed/expanded, dark/light and
Unicode/ASCII/Nerd. Each frame was individually checked for nonempty output
and width; all passed. The final message's 48 appearances were additionally
checked for scope, counts, incomplete state, literal fixes and next action.
At 40 columns, code continues using the runtime's ASCII `+` or Unicode `├`
gutter. Removing that documented framing reconstructs the complete empty-string
export. These checks do not establish human terminal-font readability or full
rendered guidance fidelity, pagination and scroll behavior.

Guidance and result captures emitted separate `capture_closed` events. The
session then emitted `session_shutdown`; the owned pane returned to its shell.
Private evidence remains under `/tmp/docs-tools1753-*`, with private directories
and files. The first attempt rejected a noncanonical macOS `/tmp` fixture path
before readiness; its subsequent unguarded result is retained and contributes
no acceptance. The canonical `/private/tmp` retry is the qualified run here.
An initial Salesforce-specific driver rejected the guidance case format before
inspection; the workflow driver completed the separate current matrix above.

## Remaining actions

Execute empty, clean, malformed and long fixtures on both supported hosts.
Exercise the complete shipped command invocation and skill resolution, rather
than only interpreting read guidance. Verify full rendered guidance, evidence
duplication, pagination, expansion and lifecycle edge cases. Agent invocation
remains unavailable while this campaign prohibits subagents. Ubuntu installed
provenance is a separate historical receipt; it does not establish Ubuntu
workflow execution. Keep child #1582 and parent #1579 open.
