# f5xc-docs-pipeline

Documentation pipeline plugin for `f5xc-salesdemos` —
guides navigation of the multi-repo build architecture,
config ownership, and content authoring.

## Skills

### pipeline-navigator

Where to make changes across docs-theme, docs-builder,
docs-control, and docs-icons. Includes config ownership
rules, release dispatch chain, and managed files list.

**Activates when:** Deciding which repo to modify,
understanding config ownership, debugging the release
dispatch chain, or checking managed files.

**Reference files:**

- `config-ownership.md` — Single-source-of-truth rules
  for astro.config.mjs, content.config.ts, etc.
- `release-dispatch-chain.md` — 5-step automated chain
  from theme/icon merge to content site rebuild
- `managed-files.md` — Full list of centrally managed
  files synced by docs-control

### content-author

Content structure, MDX syntax rules, and local Docker
preview for documentation authors.

**Activates when:** Creating or editing docs content,
working with MDX files, or setting up local preview.

## Commands

### /preview-docs

Starts a local Docker dev server for docs preview.

## Installation

```bash
claude /install f5xc-docs-pipeline@f5xc-salesdemos-marketplace
```
