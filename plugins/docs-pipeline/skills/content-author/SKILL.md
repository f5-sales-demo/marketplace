---
name: content-author
description: >-
  Content authoring guide for f5xc-salesdemos docs repos — file structure,
  MDX syntax rules, frontmatter requirements, image references, and local
  Docker preview. Use when creating or editing docs/ content, working with
  MDX files, setting up local preview, or when the user asks about content
  structure, MDX syntax, or how to preview docs locally.
user-invocable: false
---

# Content Authoring

## Structure

- Place `.md` or `.mdx` files in the `docs/` directory
- `docs/index.mdx` is required — include YAML frontmatter
  with at least a `title:` field
- Static assets (images, diagrams) go in subdirectories
  like `docs/images/` — folders with no `.md`/`.mdx`
  files are auto-mounted as public assets
- Reference assets with root-relative paths:
  `![alt](/images/diagram.png)`

## MDX Rules

- Bare `<` is treated as a JSX tag — use `&lt;` or wrap
  in backtick inline code
- `{` and `}` are JSX expressions — use `\{` and `\}`
  or wrap in backtick inline code
- Never use curly braces in `.mdx` filenames

## Local Preview

Run the live dev server (restart to pick up changes):

```bash
docker run --rm -it \
  -v "$(pwd)/docs:/content/docs" \
  -p 4321:4321 \
  -e MODE=dev \
  ghcr.io/f5xc-salesdemos/docs-builder:latest
```

Open `http://localhost:4321`. File changes on the host
require restarting the container.

For a full production build:

```bash
docker run --rm \
  -v "$(pwd)/docs:/content/docs:ro" \
  -v "$(pwd)/output:/output" \
  -e GITHUB_REPOSITORY="<owner>/<repo>" \
  ghcr.io/f5xc-salesdemos/docs-builder:latest
```

Serve with `npx serve output/ -l 8080` and open
`http://localhost:8080/<repo>/`.

Full content authoring guide:
<https://f5xc-salesdemos.github.io/docs-builder/content-authors/>
