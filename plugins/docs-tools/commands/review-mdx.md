---
description: Review MDX content files for common errors and style compliance
argument-hint: "[path-or-glob]"
---

# Review MDX content

Review MDX content files for the f5-sales-demo documentation pipeline.

**Invoke `skill://docs-tools:content-reviewer` now** and follow its
instructions exactly.

If the user provided an argument (file path or glob pattern), scope
the review to matching files only. Otherwise, review all
`docs/**/*.mdx` files in the current repository.

Pass that scope explicitly to the skill. Do not replace it with changed-file
selection. If no files match, report zero files reviewed and the unmatched
scope; do not imply a successful content review.

Report findings grouped by severity:

- **ERROR**: Will cause a build failure (bare `<`, unescaped `{}`,
  missing `title` frontmatter, undefined Code variables)
- **WARNING**: Likely issues (missing alt text, broken image refs,
  unknown imports, missing `sidebar.order`)
- **INFO**: Style suggestions (missing `sidebar.label`, unused
  imports)

At the end, print a one-line summary:
`Reviewed N file(s). Found X error(s), Y warning(s), Z info(s).`

State the scope and completion before the findings. Show at most twelve
findings initially, then include all remaining findings once as complete
evidence with file, line, severity and literal correction.
