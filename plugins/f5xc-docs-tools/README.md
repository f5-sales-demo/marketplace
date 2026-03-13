# f5xc-docs-tools

MDX content validation and review tools for f5xc-salesdemos
documentation repositories.

## Skills

### mdx-content-reviewer

Automatically reviews MDX files for common errors that cause
Astro/Starlight build failures:

1. **Frontmatter validation** — checks for required fields
   (`title`, `sidebar.order`, hero fields on splash pages)
2. **MDX syntax pitfalls** — bare `<` characters, unescaped
   `{}` braces, curly braces in filenames
3. **Import validation** — allowlist of valid import sources
   and named exports
4. **Component attributes** — required props for Screenshot,
   Aside, Code, LinkCard, and others
5. **Image references** — verifies referenced images exist
   in `docs/images/`
6. **Structure checks** — `docs/index.mdx` exists, image
   dirs are clean
7. **Export/Code block validation** — variables used in
   `<Code code={var}>` have matching `export const`

## Commands

### /review-mdx

Run a full MDX content review on the current repository:

```
/review-mdx
/review-mdx docs/overview.mdx
/review-mdx docs/**/*.mdx
```

Findings are grouped by severity: ERROR, WARNING, INFO.
