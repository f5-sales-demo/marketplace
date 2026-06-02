---
description: Review MDX content files for common errors and style compliance
argument-hint: "[path-or-glob]"
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash
---

Review MDX content files for the f5xc-salesdemos documentation pipeline.

**Invoke the `mdx-content-reviewer` skill now** and follow its
instructions exactly.

If the user provided an argument (file path or glob pattern), scope
the review to matching files only. Otherwise, review all
`docs/**/*.mdx` files in the current repository.

Report findings grouped by severity:

- **ERROR**: Will cause a build failure (bare `<`, unescaped `{}`,
  missing `title` frontmatter, undefined Code variables)
- **WARNING**: Likely issues (missing alt text, broken image refs,
  unknown imports, missing `sidebar.order`)
- **INFO**: Style suggestions (missing `sidebar.label`, unused
  imports)

At the end, print a one-line summary:
`Reviewed N file(s). Found X error(s), Y warning(s), Z info(s).`
