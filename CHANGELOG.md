# Changelog

All notable changes to the f5-sales-demo marketplace will
be documented in this file.

The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
