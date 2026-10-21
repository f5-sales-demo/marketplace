# Zoom opaque evidence regression and publication boundary

Campaign: [#1603](https://github.com/f5-sales-demo/marketplace/issues/1603),
[#1579](https://github.com/f5-sales-demo/marketplace/issues/1579).
Focused fix: [#1759](https://github.com/f5-sales-demo/marketplace/issues/1759).

## Published 1.3.1 evidence

PR #1752 merged as `372bd0bee1b3acd650a6ee486c2482cd5d7373e6`.
The immutable `zoom/v1.3.1` archive was independently downloaded on Mac and
Ubuntu. Both copies have SHA-256
`2ef06d4542fb99a1e065a65cedd1d5ed1445294e2d47267caf136d94ffff4c22`.
All twelve shipped files matched the tag source and installed plugin on both
hosts. These checks establish publication and installation only.

Stable 23.9.5's published ToolExecutionComponent rendered six synthetic result
cases in 288 frames. Successful, failed and long-result checks passed. Eighteen
checker failures occurred for wrapped opaque strings: manual inspection found
literal text present, but also confirmed real duplicated fallback evidence for
empty and malformed observations. The original captures and failed checker
results remain private. No overall presentation acceptance is claimed.

## Source 1.3.2 regression

The corrected regression against 1.3.1 fails because the real component renders
the same opaque corrective guidance twice. An earlier test invocation used the
wrong working directory; that invocation is not behavioral evidence.

The adapter now supplies scope, an unavailable/malformed summary and an explicit
unverified-readiness warning. It leaves raw opaque evidence and completeness
fallback to the runtime. It does not claim provided evidence for invalid or
mixed-content results. Valid domain summaries and execution remain unchanged.

Eight focused tests / 3,840 assertions pass independently on minimum 23.5.1,
discovery 23.8.0 and stable 23.9.5. Five opaque/mixed cases exercise 240 frames per
lane at 40/76/120/153 columns, collapsed/expanded, dark/light and
Unicode/ASCII/Nerd. Assertions check width and exactly one occurrence of the
short literal corrective guidance in every expanded frame. Existing tests cover
failed, malformed lifecycle responses, valid partial results and evidence.
The minimum lane initially lacked its declared QMD 2.8.3 dependency. Supplying
that matching package in the private test environment resolved the import;
the failed attempt is retained. These are source/component compatibility checks,
not full installed loader or model execution acceptance.

## Remaining actions

- Merge a green linked 1.3.2 PR, independently verify its immutable tag, downloaded
  archive, digest and every shipped file on both hosts, then install it.
- Re-run current installed synthetic captures and inspect each frame, including
  wrapped long corrective guidance and complete evidence without duplication.
- Capture normal installed lifecycle and shipped guidance separately from actual
  safe workflow execution on each supported host.
- Account-dependent service acceptance remains deferred by user instruction.
  No authentication, meeting join, service startup or media mutation was performed.

Historical receipts, invalidation records and raw failures are retained.
Source tests and 1.3.1 publication do not establish overall plugin completion.
