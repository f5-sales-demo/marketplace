---
name: sales-engineer
description: >-
  Sales Engineer role index — routes user intent to the correct persona skill
  (demo-executor, presenter, or subject-matter-expert). Use when the user's
  request relates to demos, presentations, or product questions but does not
  clearly match a single persona trigger phrase.
user-invocable: false
---

# Sales Engineer — Role Index

This skill is the dispatcher for the Sales Engineer persona framework.
It determines which task-specific persona to activate based on user intent.

## Initialization

Read `DEMO_PRODUCT_EXPERTISE.md` from the repository root to identify the
product name and context for this repository.

## Roles

| Task | Skill | When to use |
| ---- | ----- | ----------- |
| **Demo operations** | `f5xc-sales-engineer:demo-ops` | Prepare the demo environment before a meeting or tear down after a meeting |
| **API-driven demo** | `f5xc-sales-engineer:demo-executor` | Execute live demo phases, handle Q&A, and run post-session debrief |
| **Walkthrough presentation** | `f5xc-sales-engineer:presenter` | Walk a customer through the pre-configured demo environment using as-built documentation pages |
| **Q&A / subject matter expert** | `f5xc-sales-engineer:subject-matter-expert` | Answer questions about product capabilities, compliance alignment, threat coverage, and platform operations |

## Routing Logic

1. Read `DEMO_PRODUCT_EXPERTISE.md` to understand the product context
2. Evaluate the user's request against the trigger phrases in
   `.claude/CLAUDE.md`
3. Invoke the matching skill
4. If no clear match, ask the user to clarify their intent

## Shared Context

### Knowledge Base

The `docs/` directory is the shared knowledge base for all personas.

### Documentation Architecture

Each repository has two distinct documentation types:

- **As-Built Reference** (`docs/*.mdx`) — static, screenshot-illustrated
  pages documenting the pre-configured demo environment

- **API Automation Exercise** (`docs/demo/`) — AI-executable
  provisioning instructions with ready-to-run cURL commands and
  evidence-based PASS/FAIL validation

### Documentation Maintenance

- Continuously improve docs as new platform knowledge is gained
- Follow the governance workflow in `CLAUDE.md`:
  Issue → Branch → PR → CI → Merge → Monitor → Cleanup
- Branch naming: `docs/<issue>-desc`, `feature/<issue>-desc`,
  `fix/<issue>-desc`
- Conventional commits: `docs:`, `feat:`, `fix:`

### Build & Development

No local `package.json` — all build deps live in the Docker image.

**Dev server** (live reload requires container restart):

```bash
docker run --rm -it \
  -v "$(pwd)/docs:/content/docs" \
  -p 4321:4321 \
  -e MODE=dev \
  ghcr.io/f5xc-salesdemos/docs-builder:latest
```

**Production build:**

```bash
docker run --rm \
  -v "$(pwd)/docs:/content/docs:ro" \
  -v "$(pwd)/output:/output" \
  -e GITHUB_REPOSITORY="f5xc-salesdemos/$(basename $(pwd))" \
  ghcr.io/f5xc-salesdemos/docs-builder:latest
```

### Content Authoring

**Content-only repo** — only the `docs/` directory matters. No
`astro.config.mjs`, no `package.json`.

**MDX Rules:**

- Bare `<` must be `&lt;`
- `{` and `}` must be `\{`/`\}` or backtick-wrapped
- Never use curly braces in `.mdx` filenames

### Shared Pipeline

| Repo | Role |
| ---- | ---- |
| `docs-theme` | Starlight plugin, layout, CSS, fonts |
| `docs-builder` | Docker image, build orchestration, npm deps |
| `docs-control` | CI workflows, governance, managed files |
| `docs-icons` | Iconify JSON icon sets, Astro icon components |
