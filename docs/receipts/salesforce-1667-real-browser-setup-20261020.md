# Salesforce real browser setup acceptance

Issue: <https://github.com/f5-sales-demo/marketplace/issues/1667>.
Campaign: <https://github.com/f5-sales-demo/marketplace/issues/1591>.
Continuation: <https://github.com/f5-sales-demo/marketplace/issues/1624>.
Observed: 2026-10-20 UTC on the corporate MDM MacBook.

## Artifact and installed provenance

The acceptance used the actual published macOS xcsh 23.9.3 binary and the normally installed, enabled Salesforce 2.3.15 plugin. It did not use synthetic readiness, a replacement Salesforce executable, or an overridden setup runner.

| Component | Qualified provenance |
| --- | --- |
| Runtime | 23.9.3 |
| macOS binary SHA256 | `2471d03be69b66adcc213a607151afc951830cc3cb9949bc206ca975f5fa173d` |
| Salesforce plugin | 2.3.15 |
| Plugin source SHA | `93c35761e4c0594d37a074dd5b29a84594cccc4d` |
| Plugin immutable tag | `salesforce/v2.3.15` |
| Previously qualified plugin archive SHA256 | `ab6018692b962aa80fe3157f4f8a95fe33b24a8898067dcf81fe22504b040e7d` |

Historical publication and installed-file qualification remain in the [previous receipt](salesforce-1659-installed-qualification-20261019.md). This round changes evidence documentation only.

## Real authentication outcomes

The existing connection was already ready. The supported `xcsh plugin setup salesforce --force` path opened the normal human review without logging out. The review declared the existing Salesforce CLI, the intended HTTPS login URL, browser login with default-org selection and alias `SFDC`, and bounded org-display verification.

The human confirmed the review in the task-owned terminal and completed browser authorization. Salesforce reported successful authorization, normal setup reported `salesforce: ready`, and the process exited with code 0. The declared browser step has a 300000 ms timeout; verification has a 30000 ms timeout. The observed run completed through those normal bounds.

An independent, read-only `sf org display --json` returned exit code 0, status 0 and Connected. Private identity comparisons confirmed the same org, username and instance URL as the baseline. A subsequent normal `xcsh plugin setup salesforce` reported `salesforce: ready (setup is not required)` and exited with code 0, without repeating review or login.

This qualifies real browser authentication and ready verification through normal setup. The initial state was authenticated; unauthenticated-state and cancellation behavior retain their separately qualified synthetic receipts. This run does not establish a new desktop-font, animation or model-selection observation.

## Credential preservation and privacy

Before the attempt, all 11 existing Salesforce state files were copied privately and checksummed. After authentication, every backup still matched its original checksum and no original file was missing. Two current files changed during normal authentication; the connection continued to identify the same org and user. No forced logout or authentication repair was performed.

Raw terminal output, org-display output, identity comparisons and credential backups remain in private files on the managed MacBook. This receipt contains no login URL, org identifiers, username, access token, refresh token, browser authorization URL or raw capture.

## Canonical completion

Only `salesforce.lifecycle.setup.live` and `salesforce.lifecycle.setup.acceptance` gain this evidence. Their historical receipts and evidence remain intact. Current Salesforce registrations have 116 VERIFIED rows, 11 justified NOT APPLICABLE rows, no BLOCKED rows and no TODO rows. Retired historical surfaces remain in the canonical appendix and do not count as current registrations.
