# GCP full-log capture source qualification

Issue #1559 and draft PR #1698 remain incomplete. This receipt qualifies source
command dispatch and an offline native terminal; it establishes no live GCP
command availability, bootstrap coverage, registration, health or traffic.

The original guest dispatcher now exposes separate complete-log requests.
Journal requests omit the historical 200-entry limit and require fresh
original-node help for every selected option. Container log requests require
fresh command help declaring the complete-log selection: `--tail=-1` for CRI
or `--tail=all` for Docker. Each container ID must still belong to that original
node's fresh, unambiguous listing. Unsupported or stale help refuses before
writing a capture command.

Evidence retains the selected log extent and original help hash alongside
the original VM, token, ownership and listing joins. The extent describes the
request; it does not prove bootstrap history or server-side log retention.
Historical limited requests remain explicitly marked `tail-only`. A transport
truncation remains incomplete regardless of the number of retained lines.
The command deadline, PTY output bound, freshness, startup deadline and final
reserve remain unchanged. No capture promotes `guestAcceptanceComplete`.

Verification retained privately:

- Attempt 1084: six intended failing-first cases, with 15 existing cases passing.
- Attempts 1086 and 1095: 62 Python session, command-control and worker cases pass.
- Attempt 1093: 61 Bun cases and 657 assertions across five files pass. The real
  pinned Python/FIFO/PTY final worker captures all 250 native fixture records
  after operation expiry, binds the actual help hash and verifies natural
  closure within its original final reserve.
- Attempts 1087, 1089, 1094 and 1096: Pylint, strict mypy, Ruff and Terraform
  typecheck pass. The Ruff parameter-shape finding was repaired at its source.

The next gate is complete installed collector orchestration and concrete
factory composition, followed by supported marketplace installation, ordinary
Ubuntu `bun dev`, a freshly reviewed live scope and independent typed cleanup.
Fresh original GCP evidence must verify supported full-log behavior, attributed
bootstrap coverage and relevant inspection/container logs. Missing or truncated
evidence remains incomplete. Publication holds and historical assets remain
preserved.
