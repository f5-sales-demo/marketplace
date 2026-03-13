---
name: mdx-content-reviewer
description: >-
  Review MDX content files for the f5xc-salesdemos documentation pipeline.
  Checks for bare < characters, unescaped {}, broken image references,
  incomplete frontmatter, invalid imports, and component attribute issues.
  Use this skill when the user asks to review MDX, check docs, validate
  content, lint MDX files, mentions MDX errors or build failures, or wants
  to check documentation quality before committing. Also use when working
  in any f5xc-salesdemos content repository's docs/ directory.
---

# MDX Content Reviewer

Review MDX files in `docs/` for errors that cause Astro/Starlight build
failures. Report findings grouped by severity: **ERROR** (build-breaking),
**WARNING** (likely issues), **INFO** (style suggestions).

## Scoping

If the repository has recent uncommitted or staged changes, scope the
review to changed MDX files only:

```bash
git diff --name-only --diff-filter=ACMR HEAD -- 'docs/**/*.mdx'
```

If no changes exist or the user requests a full review, check all
`docs/**/*.mdx` files.

Use parallel tool calls throughout — read multiple files, run multiple
Grep/Glob searches in a single turn wherever possible.

## Check 1: Frontmatter Validation

Read each MDX file and parse the YAML block between the opening and
closing `---` delimiters.

**Regular pages** (any file except `docs/index.mdx`):

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `title` | yes | string | Page title shown in browser tab and sidebar |
| `sidebar.order` | yes | number | Controls sidebar sort order |
| `sidebar.label` | recommended | string | Short label for sidebar (INFO if missing) |

**Landing page** (`docs/index.mdx`):

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `title` | yes | string | |
| `template` | yes | `splash` | Must be the literal string `splash` |
| `hero.title` | yes | string | |
| `hero.tagline` | yes | string | |
| `hero.image.html` | yes | string | HTML string with an `<img>` tag |
| `sidebar.hidden` | recommended | `true` | Hides splash page from sidebar |

**Severities:**
- Missing `title` → ERROR
- Missing `sidebar.order` on a non-index page → WARNING
- Missing `sidebar.label` → INFO
- Missing `template: splash` on index → WARNING
- Missing `hero.tagline` or `hero.image.html` on index → WARNING

Read the reference file `references/frontmatter-schema.md` for the
complete schema.

## Check 2: MDX Syntax Pitfalls

Scan each file line by line. Track whether you are inside a fenced
code block (lines between ` ``` ` delimiters) or an inline code span
(text between backticks on the same line). Skip lines inside code
fences and inline code spans.

**Outside code blocks, flag:**

1. **Bare `<`** — A `<` character that is NOT:
   - Part of an opening/closing component tag (`<Aside`, `</Aside>`,
     `<Screenshot`, `<Code`, `<Steps>`, `<CardGrid>`, `<Card>`,
     `<Tabs>`, `<TabItem>`, `<LinkCard`, `<Badge>`, `<Icon>`,
     `<FileTree>`, `<Banner>`)
   - Part of a self-closing HTML tag (`<br />`, `<hr />`, `<img`)
   - Part of an HTML entity (`&lt;`, `&gt;`, `&amp;`, `&rarr;`)
   - Inside a Markdown link `[text](url)`
   - Inside an `export const` block (JavaScript)
   - Inside a `{/* comment */}` JSX comment

   Bare `<` → ERROR (causes JSX parse failure)

2. **Unescaped `{` or `}`** — A brace that is NOT:
   - Part of a component attribute (`type="caution"`,
     `code={varName}`)
   - Part of an `export const` statement
   - Part of an `import` statement
   - Part of a JSX comment `{/* ... */}`
   - Part of a JSX expression inside a component tag

   Unescaped braces in prose → ERROR

3. **Curly braces in filenames** — Any `.mdx` file whose name
   contains `{` or `}` → ERROR

Read `references/mdx-pitfalls.md` for detailed examples.

## Check 3: Import Validation

Collect all `import` statements from each file. Validate against the
allowlist:

**Allowed import sources:**

| Source | Named exports |
|--------|---------------|
| `@astrojs/starlight/components` | `Aside`, `Code`, `Steps`, `CardGrid`, `Card`, `Tabs`, `TabItem`, `LinkCard`, `Badge`, `Icon`, `FileTree` |
| `@f5xc-salesdemos/docs-theme/components/Screenshot.astro` | default import (`Screenshot`) |
| `@f5xc-salesdemos/docs-theme/components/LinkCard.astro` | default import (`LinkCard`) |
| `@f5xc-salesdemos/docs-theme/components/Banner.astro` | default import (`Banner`) |
| `@f5xc-salesdemos/docs-theme/components/Icon.astro` | default import (`Icon`) |

**Severities:**
- Import from an unknown source → WARNING
- Named export not in the allowlist for that source → WARNING
- Unused import (imported but never referenced in the file body) → INFO

Read `references/allowed-imports.md` for the full allowlist.

## Check 4: Component Attribute Validation

For each component usage found in the file, validate required
attributes:

| Component | Required attributes | Optional |
|-----------|-------------------|----------|
| `Screenshot` | `alt` + at least one of `light` or `dark` | `light`, `dark` (both accepted) |
| `Aside` | `type` (one of: `caution`, `note`, `tip`, `danger`) | `title` |
| `Code` | `code` + `lang` | `title`, `frame`, `mark`, `ins`, `del` |
| `LinkCard` | `title` + `href` | `description`, `icon` |
| `Card` | `title` | `icon` |
| `Badge` | `text` | `variant` |

**Severities:**
- Missing required attribute → WARNING
- `Screenshot` missing `alt` → WARNING (accessibility)
- `Aside` with invalid `type` value → WARNING
- `Code` with `code={varName}` but no matching `export const` → ERROR

Read `references/component-signatures.md` for the full attribute
reference.

## Check 5: Image Reference Validation

Find all image references in each file:
- Markdown syntax: `![alt](/images/filename.png)`
- Component attributes: `light="/images/filename.png"`,
  `dark="/images/filename.png"`
- Hero image HTML: `<img src="/images/filename.png"`

For each reference, resolve the root-relative path against
`docs/images/`. Use Glob to verify the file exists:

```
Glob pattern: docs/images/<filename>
```

**Severities:**
- Image file not found → WARNING
- Image path not root-relative (missing leading `/`) → INFO

## Check 6: Structure Checks

1. **`docs/index.mdx` must exist** — Use Glob to check for
   `docs/index.mdx`. If missing → ERROR.

2. **Image directories must not contain MDX files** — Glob for
   `docs/images/**/*.mdx`. Any matches → WARNING.

3. **No orphan MDX files outside `docs/`** — Glob for `*.mdx` in
   the repo root. Any matches → INFO.

## Check 7: Export/Code Block Validation

When a `<Code>` component uses a variable reference
(`code={variableName}`), verify that a matching
`export const variableName = ...` exists earlier in the same file.

**Severity:**
- Variable referenced in `<Code code={var}>` without a matching
  `export const var` → ERROR

Also check that `export const` blocks contain valid JavaScript
string literals (template literals or quoted strings). Malformed
exports will cause build failures.

## Output Format

After running all checks, present findings in this format:

```
## MDX Content Review — <repo-name>

Reviewed N file(s). Found X error(s), Y warning(s), Z info(s).

### ERRORS (build-breaking)

- **file.mdx:L12** — Bare `<` outside code block: `< comparison`
- **file.mdx:L1** — Missing required `title` in frontmatter

### WARNINGS (likely issues)

- **file.mdx:L45** — Image not found: `/images/missing.png`
- **file.mdx:L8** — Unknown import source: `some-package`

### INFO (style suggestions)

- **file.mdx:L3** — Missing `sidebar.label` in frontmatter
- **file.mdx:L10** — Unused import: `Badge`

---
No errors found. ✓  (if clean)
```

If all files pass all checks, report:

```
## MDX Content Review — <repo-name>

Reviewed N file(s). No issues found. ✓
```
