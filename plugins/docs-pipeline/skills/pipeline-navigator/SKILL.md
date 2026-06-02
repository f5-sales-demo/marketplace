---
name: pipeline-navigator
description: >-
  Documentation pipeline architecture for f5xc-salesdemos — where to make
  changes across docs-theme, docs-builder, docs-control, and docs-icons.
  Use when deciding which repository to modify, understanding config ownership
  (astro.config.mjs, content.config.ts), debugging the release dispatch chain,
  checking managed files, or when a theme/icon change is not appearing on live
  sites. Also use when the user asks "where should I make this change" or
  mentions docs-theme, docs-builder, or the build pipeline.
user-invocable: false
---

# Documentation Pipeline Navigator

All `f5xc-salesdemos` repositories publish docs to
GitHub Pages using a shared pipeline.

## Repository Roles

| Repository | Role | Owns |
| ---- | ---- | ---- |
| `docs-theme` | npm package — Starlight plugin, Astro config, CSS, fonts, logos, layout components | `astro.config.mjs`, `config.ts`, `content.config.ts`, all Starlight plugins and Astro integrations |
| `docs-builder` | Docker image — build orchestration, npm deps, Puppeteer PDF generation, interactive components | `Dockerfile`, `entrypoint.sh`, `package.json` (npm dependency set only) |
| `docs-control` | Source-of-truth — reusable CI workflows, governance templates, repository settings enforcement | CI workflows, `CLAUDE.md`, PR/issue templates, repository settings |
| `docs-icons` | npm packages — Iconify JSON icon sets, Astro icon components | Icon packaging, npm publishing, dispatch to docs-builder on release |

Content repositories only need a `docs/` directory — the
build container and workflow handle everything else.
CI builds trigger when files in `docs/` change on `main`.

## Where to Make Changes

- **Site appearance, navigation, or Astro config** —
  change `docs-theme` (owns `astro.config.mjs`,
  `content.config.ts`, CSS, fonts, logos, and layout
  components)
- **Build process, Docker image, or npm deps** —
  change `docs-builder` (owns the Dockerfile,
  entrypoint, and dependency set)
- **Interactive components** (placeholder forms, API
  viewers, Mermaid rendering) — change `docs-builder`
- **Icon packages** (Iconify JSON sets, Astro icon
  components) — change `docs-icons` (publishes npm
  packages consumed by `docs-builder`)
- **CI workflow or governance files** —
  change `docs-control` (syncs managed files and
  repository settings to downstream repositories)
- **Page content and images** — change the `docs/`
  directory in the content repository itself
- **Never** add `astro.config.mjs`, `package.json`, or
  build config to a content repository — the pipeline
  provides these
- **Never** create `astro.config.mjs`, `uno.config.ts`,
  or Astro integration config in `docs-builder` — these
  are owned exclusively by `docs-theme`

## Configuration Ownership

Read `references/config-ownership.md` for the full
ownership rules including the single-source-of-truth
mechanism and the pattern for adding new capabilities.

## Release Dispatch Chain

Read `references/release-dispatch-chain.md` for the
5-step automated chain from theme/icon merge through
content site rebuild.

If a theme or icon change does not appear on live sites,
check each step in that chain for failures — do not
manually trigger `github-pages-deploy.yml` as a
workaround.

## Managed Files

Read `references/managed-files.md` for the full list of
files centrally managed by `docs-control` and
automatically synced to all repos. **Do not modify
managed files in downstream repos** — local changes will
be overwritten on the next enforcement run.

To change any managed file, open a PR in
`f5xc-salesdemos/docs-control` instead.

## Other Infrastructure Repos

The organization also contains repos with their own CI
pipelines that are not part of the docs theme/build
dispatch chain but do receive managed files:

| Repo | Role |
| ---- | ---- |
| `terraform-provider-f5xc` | Go Terraform provider for F5 Distributed Cloud |
| `terraform-provider-mcp` | MCP server exposing Terraform provider schemas |
| `api-mcp` | MCP server for the F5 XC API |
