# Changelog

All notable changes to the f5-sales-demo marketplace will
be documented in this file.

The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

- **`meddpicc`** v2.5.0 — the workbook generator. `engine/generate.ts` turns the spec plus a
  deal into a real `.xlsx`: `generate <deal.json> --out <file>`, or `--plan` to print where
  every input cell landed without writing anything.

  It resolves in two passes, because a formula's text depends on where other cells ended up.
  The first decides addresses, the second substitutes `{{ref:…}}`, `{{col:…}}`, `{{row:…}}`
  and `{{this:…}}` for them — so nothing in the spec names a coordinate and inserting a field
  cannot break a formula on another sheet. Dates are written as Excel serials rather than
  text, without which `closeDate - TODAY()` is a `#VALUE!` error.

  `planWorkbook` also returns `inputCells`: every cell holding a human's value, with the
  `jsonPath` it came from. That is the contract the round-trip reader will consume, so both
  directions are defined by one map.

  **Verified against real Excel, not just against our own writer.** `scripts/uat-generate-excel.sh`
  generates a workbook, opens it, reads the Scorecard back and compares it with what
  `engine score` computes by a completely different route: 21/32, 65.6%, Yellow from both, no
  error values on any sheet, no repair prompt. Mutation-checked — pointing one formula at the
  neighbouring column keeps `check-spec` green and the file valid, and the UAT catches it
  (Excel says 14, the engine says 21). It runs on request via `MEDDPICC_EXCEL_UAT=1`, since
  opening Excel takes over the foreground.

  Three defects the review found, all reproduced before being fixed. **A partly-qualified deal
  displayed as 100%**: `COUNT` ignores blank cells, so an unscored element shrank the
  denominator instead of counting as zero — one element at 4 and seven unscored showed 4/4
  beside a Red rating, where the engine said 12.5%. Score cells now write 0 when the deal has
  no score, matching `computeScore`, and the maximum counts the always-populated element
  column. `generate` now **validates the spec and the deal before writing**, so a mistyped
  `jsonPath` fails loudly instead of becoming an empty cell that reads as "not filled in yet".
  And `dateToSerial` **rejects impossible dates** rather than rolling them forward: it was
  turning `2026-02-31` into `2026-03-03`, a close date three days late that nothing downstream
  would question.


- **Plugin tests no longer depend on a real cloud CLI** (`aws` v1.2.2, `azure` v1.2.2,
  `gcloud` v1.2.2, `github` v1.2.2, `gitlab` v1.2.3, `salesforce` v1.3.3) — 32 tests across
  six plugins spawned `aws`, `az`, `gcloud`, `gh` or `sf`, because every tool factory built
  its executor from `ctx.cwd`. Whether they passed depended on which binaries the machine
  had and how fast they answered, which is how the CI job broke twice. All 27 factories now
  accept an injected executor, the validation suites use a stub, and the cases that
  genuinely drive a CLI are gated on its presence with an explicit timeout.

- `scripts/check-tests-are-hermetic.sh` proves it and keeps it that way: it replaces every
  cloud CLI with a sleeping stub, so a test that still spawns one trips bun's timeout and
  names itself. Wired into the Validate Plugins workflow.

Every plugin test suite now runs in CI, and the failures that surfaced are fixed.

- **Portable setup-wizard tests** (`aws` v1.2.1, `azure` v1.2.1, `gcloud` v1.2.1,
  `github` v1.2.1, `gitlab` v1.2.2, `salesforce` v1.3.2) — `runSetupWizard` resolved the
  install command from `process.platform` and shelled out to `which`, so the tests asserted
  `brew` and passed only on macOS. Each wizard now accepts an injected `detectPlatform`, and
  each suite covers macOS, Linux and a host with no package manager — the last of which was
  a live branch nobody asserted.

- **Tests no longer drive real cloud CLIs** (`salesforce` v1.3.2, `azure` v1.2.1) — a
  `sf_setup` validation test ran four genuine `sf config set target-org … --global`
  commands, writing to the developer's own `~/.sf/config.json`, and `az_exec` spawned `az`
  to check argument validation. Both tools take an injected executor now. The
  Salesforce extension-load suite genuinely needs the CLI and is skipped, visibly, when it
  is absent.

- **Stale plugin names** (`aws` v1.2.1, `azure` v1.2.1, `gcloud` v1.2.1,
  `salesforce-legacy` v1.0.1) — the suites asserted the pre-rename names
  (`aws-status`, `salesforce`) that nothing else in the repo still used, and azure's
  tool-factory list predated the rename that gave each file its verb.

- **Credential scanners no longer search `node_modules`** (12 plugins) — with dependencies
  installed, the scan reported five lines of `bun-types`' own npmrc documentation as
  hardcoded credentials. Six plugins already excluded it; the rest do now.

- **`salesforce-legacy` hook test** v1.0.1 — it symlinked `/usr/bin/bash`, which does not
  exist on macOS, so the scrubbed `PATH` held no usable shell and the hook never ran.

- **`meddpicc`** v2.4.1 — credential-scanner exclusion only.

- No plugin is exempt from the gate any more: `run-plugin-tests.sh` drops its `KNOWN_RED`
  list, since every named plugin is green.

- **`meddpicc`** bumped to v2.4.0 — foundations for a formula-driven workbook generated
  from the schema. Adds `engine/xlsx.ts`, an OOXML writer that emits a complete `.xlsx`
  from scratch with a fixed, named style palette, and `engine/workbook-spec.json`, a
  declarative description of the workbook that names a `jsonPath` for every input cell and
  writes formulas as symbolic references (`{{ref:acv}}`, `{{col:elements.score}}`) rather
  than addresses. `check-spec` validates the two against the deal schema: every input path
  resolves, all eight scored elements are captured exactly once, no two cells claim one
  value, every formula reference names something that exists, and side-by-side tables do
  not overlap. No output changes yet — `fill` is still what produces the report.

- **`meddpicc`** bumped to v2.3.0 — the deal review now fills the shipped F5 Deal
  Review Sheet template instead of a layout of its own: corrected `cell-mapping.json`
  (every scalar coordinate previously named the label cell, not the value cell),
  `fill` replaces `render`, and `check-mappings` now rejects a target that holds the
  template's own text. Adds `metadata.accountTeam`.

- **`meddpicc`** bumped to v2.2.1

- **`azure`** bumped to v1.2.0 — `az_exec` now accepts valid JMESPath `--query`
  (dropped the char filter that rejected `||`, backticks, and pipes); read-only guard,
  `az_help`, error taxonomy with `errorType`, and signal-aware exec. CLI-Plugin
  Capability Contract conformant.

- **`aws`** bumped to v1.2.0 — native tool layer: `aws_exec` read-only guard, `aws_help`,
  typed reads (`sts`/`s3`/`ec2`) with formatters, 6-class error taxonomy, JMESPath query
  docs, and a benchmark + autoresearch harness.

- **`gcloud`** bumped to v1.2.0 — native tool layer built from status-only: `gcloud_exec`
  read-only guard, `gcloud_help`, typed reads (config/projects/compute/storage) with
  formatters, error taxonomy, `--filter`/`--format` query docs, and a benchmark +
  autoresearch harness.

- **`gitlab`** bumped to v1.2.0 — `glab_exec` read-only guard + `glab_help`, error taxonomy
  with a central `errorType` wrapper, `--output json` query docs, signal-aware exec +
  control-char hygiene, adversarial guard hardening (pflag cluster and value-flag
  method-forgery fixes), and per-tool tests.

- **`github`** bumped to v1.2.0 — `gh_exec` read-only guard plus confirmed-mutation safety
  (`gh_pr_checkout`/`gh_pr_push` behind `ctx.ui.confirm` with a headless fail-safe),
  guard hardening (boolean-cluster verb-shift and value-flag method-forgery), and
  control-char hygiene enforced across every gh/git spawn.

- **`salesforce`** bumped to v1.3.0 — `sf_exec` read-only guard (colon-grammar normalize,
  `apex run` and api-body blocks) + `sf_help`, 6-class error taxonomy, adversarial guard
  hardening (pflag cluster and value-flag method-forgery fixes), and a `sf_pipeline_report`
  test.

- **f5xc-github-ops** bumped to v2.3.1 — rename `local status` to
  `local http_status` in the sourced `gh-poll.sh` and `retry.sh`
  libs so the agent's polling and backoff helpers no longer fail
  with "read-only variable: status" when the calling shell is Zsh

- **f5xc-firecrawl** added v1.1.0 — self-hosted Firecrawl web scraping plugin with
  7 commands (scrape, batch-scrape, crawl, map, search, extract, llmstxt), a
  `web-scraper` skill, and a `firecrawl-operator` agent; no API keys required,
  runs against the local Firecrawl instance on port 3002

- **f5xc-devcontainer** bumped to v1.1.4

- **f5xc-github-ops** bumped to v2.1.3

- **f5xc-github-ops** bumped to v2.1.2

- **f5xc-github-ops** bumped to v2.1.1

- **f5xc-sales-engineer** bumped to v1.0.4

- **f5xc-devcontainer** bumped to v1.1.3

- **f5xc-console** renamed to **f5xc-platform** v2.0.0 — now covers both web console UI automation and REST API management with separate agents for each domain

- **f5xc-console** bumped to v1.0.5

- **f5xc-console** bumped to v1.0.4

- **f5xc-console** bumped to v1.0.3

- **f5xc-console** bumped to v1.0.2

- **f5xc-console** bumped to v1.0.1

- **f5xc-meddpicc** bumped to v1.0.2

- **f5xc-meddpicc** bumped to v1.0.1

- **f5xc-sales-engineer** bumped to v1.0.3

- **f5xc-sales-engineer** bumped to v1.0.2

- **f5xc-sales-engineer** bumped to v1.0.1

- **f5xc-repo-governance** renamed to **f5xc-github-ops** v2.0.0 —
  functional name reflecting GitHub operations automation purpose

- **f5xc-repo-governance** bumped to v1.3.3

- **f5xc-repo-governance** bumped to v1.3.2

- **f5xc-repo-governance** bumped to v1.3.1

## [1.0.0] - 2025-06-01

### Added

- **f5xc-docs-tools** plugin (v1.0.0) — MDX content
  validation skill with seven checks and `/review-mdx`
  command
- **f5xc-sales-engineer** plugin (v1.0.0) — Sales Engineer
  persona framework with four skills (sales-engineer,
  demo-executor, presenter, subject-matter-expert) and two
  agents (demo-housekeeping, demo-researcher)
- Marketplace manifest at `.xcsh-plugin/marketplace.json`
- Documentation site with plugin catalog, getting started
  guide, reference, and contributing guide
- Plugin validation CI workflow
