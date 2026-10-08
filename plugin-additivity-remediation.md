# Plugin additivity remediation

**Status: in progress.** Source changes are validated; released installed acceptance remains open.

Host fixes merged in [xcsh #4827](https://github.com/f5-sales-demo/xcsh/pull/4827). Release [23.0.3 release](https://github.com/f5-sales-demo/xcsh/pull/4828) has merged; tag exists and native artifacts are pending. Combined plugin changes are in
[marketplace #1514](https://github.com/f5-sales-demo/marketplace/pull/1514); publication waits for the
verified host release. Acceptance is tracked in [#1513](https://github.com/f5-sales-demo/marketplace/issues/1513).

Validation: 10,100 host tests passed, 562 skipped, zero failed; 100 focused search/error tests passed.
TypeScript, documentation quality, 29 documentation tests, full frozen plugin suites and published xcsh agent
validation passed. The audit TypeBox import errors did not recur after supported dependency preparation.

| Finding | Change                                                                                                                                                                                                                                                                               | Acceptance                                     |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| F01     | Location guidance permits inspection and independent research; trace validation drops request-wide forbidden-tool checks. Collector/render integrity remains.                                                                                                                        | Source passed; release/install pending         |
| F02     | Remove keyword-triggered KVM before_agent_start guidance; retain native controller ownership/plan safeguards.                                                                                                                                                                        | Source passed; release/install pending         |
| F03     | Remove Azure keyword routing and mandatory inventory prohibitions; retain informational account hints and native CE contracts.                                                                                                                                                       | Source passed; release/install pending         |
| F04     | Remove AWS keyword routing; retain informational account hints and task-scoped CE contract/discovery safeguards.                                                                                                                                                                     | Source passed; release/install pending         |
| F05     | Scope Firecrawl selection to explicit requests/chosen scraping; direct execution default; scoped service failure and optional named child.                                                                                                                                           | Source passed; release/install pending         |
| F06     | Require identified container and observed runtime/tool inventory; host identity and unrelated tool choice remain available.                                                                                                                                                          | Source passed; release/install pending         |
| F07     | Direct Platform operations and configuration inspection; optional delegation with explicit positive child permissions.                                                                                                                                                               | Source passed; release/install pending         |
| F08     | Direct native/guarded CLI work and independent follow-ups; optional agents.                                                                                                                                                                                                          | Source passed; release/install pending         |
| F09     | Remove Platform install/setup dependencies from AWS/Azure; retain cross-plane capability/context prerequisites.                                                                                                                                                                      | Source passed; release/install pending         |
| F10     | Replace ignored deny lists with explicit positive permissions for Platform and OSINT agents.                                                                                                                                                                                         | Source passed; release/install pending         |
| F11     | Canonical xcsh tool names, qualified agent identities, named spawning references; frozen published 23.0.2 parser/registry validation.                                                                                                                                                | Source passed; release/install pending         |
| F12     | Remove ignored command allowlists; document scoped prompt expansion and native/agent permission boundaries.                                                                                                                                                                          | Source passed; release/install pending         |
| F13     | No reproduced attributable refusal cause. Three original-fixture Mac replays pass on unchanged 23.0.2. Equal 98-tool no-skills/rules replay passes. Recorded request max_tokens=32000 and tool_choice=auto; historical length event with zero usage does not prove token exhaustion. | Unattributed; installed release replay pending |
| F14     | Blank/spaces profile normalizes to omission, controls and unsafe nonblank names reject; returned errors propagate through host hooks/events.                                                                                                                                         | Source passed; release/install pending         |

The exact original Mac untrusted-input fixture completed three consecutive runs on unchanged xcsh 23.0.2. All
retained 98 tools; a no-skills/rules replay also retained 98 tools and passed. Observed requests used 32,000
maximum output tokens and automatic tool choice. Historical `length` with zero usage is not evidence of a
token limit or an attributable plugin refusal.

Mac baseline public research still failed its source-result gate. The host parser fix recognizes Anthropic
server search error objects rather than iterating them as results. Baseline follow-up research succeeded.
Source-fixed AWS initially reached the service and returned `InvalidClientTokenId`. After the user refreshed
the token, the default identity gate passed. Released installed repeat acceptance remains pending. Azure
identity succeeded with Platform absent from the temporary runtime.

A real configuration child found/read a synthetic fixture and returned evidence with no write capability; the
parent then calculated 437 with its inventory preserved. The first nested test used direct reading and is
excluded from nested acceptance. A subsequent explicit nested replay invoked the permitted Firecrawl operator
child and returned observed fixture evidence successfully.

Original audit files remain unchanged. Released artifacts, installed receipts, repeat result gates, ASM
control and final closure are outstanding. Raw traces and authenticated payloads are excluded.

Companion: [plugin-additivity-remediation.json](plugin-additivity-remediation.json).

Combined source probe: 102 cases across 17 runtime extensions preserved host prompt, inventory, and selected tool with no hard blocks. Explicit nested delegation passed through the permitted Firecrawl operator child.

After the user refreshed the token, the source-fixed AWS default identity read passed on both Mac and Ubuntu. A real OSINT researcher child returned two verified public sources with no task or write tool available; parent capabilities remained intact.
