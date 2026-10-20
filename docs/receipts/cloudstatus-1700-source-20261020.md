# Cloudstatus presentation source qualification

Campaign #1579, child #1592, implementation #1700. Candidate Cloudstatus 1.9.2;
current development runtime 23.9.3, minimum 23.5.1, discovery runtime 23.8.0.

## Reproduced defects and changes

Installed 1.9.0 labeled the source page update as collection time and dropped
previous incident updates. Hermetic tests executed the actual shipped Bash
fences with synthetic `curl` responses and failed before correction. Subsequent
regressions reproduced duplicated latest updates, lost operational component
identity, and multi-source request failures hidden by a later success.

Collectors now separate `observed_at` from `page_updated_at`, retain complete
component and incident/maintenance update evidence once, and preserve usable
partial output with a nonzero status when any requested source fails. Shipped
operators require useful identity/scope/freshness/findings/warnings/completion,
twelve-row previews, exact commands and environment scope, honest returned-page
coverage, and shared layout/lifecycle ownership. No native tool adapter was added.

The exact development dependency is 23.9.3 with a reproducible lock. Minimum
compatibility remains 23.5.1 in a separate temporary copy. The dataset guard now
excludes installed third-party dependencies while continuing to reject prohibited
data in plugin source; a behavioral regression proves both boundaries.

## Evidence and limits

- Actual shipped command regression suite: nine tests pass, including Bash and
  Zsh, malformed/failing responses, partial output, and complete evidence once.
- Current and isolated minimum plugin suites: 27 pass, zero skips or failures.
- Discovery/tracker, ownership, scenario and observer suites: 28 pass, zero failures.
- Raw baseline, failing regressions and retry logs remain private; published
  evidence contains synthetic values and sanitized counts only.

These checks qualify source behavior and shipped guidance. They do not qualify
model-selected execution, all message/advisory/lifecycle matrix captures, normal
transcript scrolling, stable publication, installed provenance or service gates.
The existing guarded workflow observer admits native typed tools and shipped
reads; it deliberately rejects Bash/task workflows. Next action (#1702): add and test an
independently reviewed exact-script/argument/target lane, then execute the actual
installed Cloudstatus status operator and its parent workflow with private
journals. Content-only guidance cannot establish those executed results.

Mac repository-wide logs retain the pre-fix Cloudstatus dataset scan and existing
KVM/Xorg/Zoom host-path failures; overlapping Mac runs are not a clean final receipt.
The first Ubuntu full run failed because its default Python lacked PyYAML. A fresh
run using the same isolated PyYAML 6.0.3 fixture dependency as CI passed every
plugin suite. Hermeticity, changed-scope privacy and catalog checks also passed on
Ubuntu. Earlier failures and the separate successful retry remain private.
Campaign #1579 and child #1592 remain open until every current gate is verified
or legitimately not applicable. Publication and installed/service receipts must
reference the final merged source and independently verified stable artifact.

CI initially lacked Zsh. The regression now always runs Bash and reports the
Zsh test as skipped only on hosts without that executable. Both development
hosts retain actual Bash and Zsh execution evidence; CI does not claim Zsh
acceptance. This repair produces candidate 1.9.2 before stable publication.
