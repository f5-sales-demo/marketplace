---
name: brand-reviewer
description: >-
  Review existing content for F5 brand compliance. Audits colors,
  typography, logo format, icon selection, alt text, contrast
  ratios, and product terminology against F5 brand guidelines.
  Produces a structured report with VIOLATIONS, WARNINGS, and
  SUGGESTIONS. Use when the user says "review brand", "check
  branding", "brand audit", "brand compliance", or invokes
  /review-brand. Also use before committing visual content or
  creating PRs that include brand assets, diagrams, or styled
  documentation.
---

# F5 Brand Reviewer

Review content files for F5 brand compliance. Report findings
grouped by severity: **VIOLATION** (brand non-compliant),
**WARNING** (likely issue), **SUGGESTION** (style improvement).

## Scoping

Determine which files to review:

1. If the user specifies files or directories, review those
2. If the repository has recent uncommitted or staged changes,
   scope to changed files:

```bash
git diff --name-only --diff-filter=ACMR HEAD -- \
  'docs/**/*.mdx' 'docs/**/*.md' '*.svg' '*.css'
```

3. If no changes exist or user requests full review, check all
   content files: `docs/**/*.mdx`, `docs/**/*.md`, and any
   `.svg`, `.css`, or `.mermaid` files

Use parallel tool calls — read multiple files and run multiple
Grep/Glob searches in a single turn wherever possible.

## Check 1: Color compliance

Scan files for hex color values. Flag any hex color that does
not appear in the F5 45-color palette.

**Allowed hex values** (the official palette):

Red family: `#e4002b`, `#f7b2bf`, `#f06680`, `#a70020`, `#720016`
Tangerine: `#f29a36`, `#ffe4c4`, `#ffbd61`, `#a35700`, `#7a4100`
River: `#0e41aa`, `#b7c6e5`, `#6e8dcc`, `#0b3180`, `#072155`
Raspberry: `#ab2782`, `#e6bed9`, `#cd7db4`, `#801d62`, `#561441`
Jade: `#009639`, `#b2dfc4`, `#66c088`, `#00712b`, `#004b1d`
Eggplant: `#62228b`, `#cdabe3`, `#9c59c9`, `#822cb8`, `#41175d`
Bay: `#0072b0`, `#b2d7eb`, `#66afd7`, `#005c8d`, `#003d5f`
White: `#fff`, `#ffffff`, `#faf9f7`, `#f5f5f5`, `#e6e6e6`, `#ccc`, `#cccccc`
Black: `#000`, `#000000`, `#999`, `#999999`, `#666`, `#666666`, `#343434`, `#222`
Mermaid theme: `#e8ecf4`, `#1a1a2e`, `#fff5eb`, `#f0e6f6`
Icon vars: `#0f1e57`, `#e5eaff`, `#e6e9f3`, `#1a2a6c`

**Severities:**
- Hex color not in the palette → VIOLATION
- Hardcoded hex in CSS that should use a CSS variable → WARNING
  (e.g., `color: #e4002b` instead of `var(--f5-red)`)

**Skip**: hex values inside code blocks, inline code spans, and
`export const` blocks.

## Check 2: Typography compliance

Scan CSS and style attributes for font-family declarations.

**Allowed font families**:
- `proximaNova`, `Proxima Nova`
- `neusaNextProWide`, `Neusa Next Pro Wide`
- System fallbacks: `system-ui`, `Segoe UI`, `helvetica`,
  `arial`, `sans-serif`, `Georgia`
- Generic families: `monospace`, `serif`, `sans-serif`

**Severities:**
- Unknown font-family declaration → WARNING
- Heading element (h1-h3) not using heading font → WARNING
- H4-H6 not uppercase → SUGGESTION

## Check 3: Logo compliance

Use Glob to find all SVG files that appear to be logos
(filename contains "logo" or "brand").

**Checks:**
- Logo file is not SVG format → VIOLATION
- SVG missing `viewBox` attribute → WARNING
- Logo file over 10 KB → WARNING
- PNG/JPG logo file found → VIOLATION

## Check 4: Icon compliance

Scan Mermaid diagrams and Astro component imports for icon
pack references.

**Registered packs**: `f5-brand`, `f5xc`, `hashicorp-flight`,
`carbon`, `lucide`, `mdi`, `phosphor`, `tabler`, `azure`,
`aws`, `gcp`, `simple-icons`

**Severities:**
- Reference to unregistered icon pack → WARNING
- Icon name not found in registered pack → SUGGESTION

## Check 5: Accessibility compliance

### Alt text

Scan for image references missing alt text:
- Markdown images: `![](path)` (empty alt) → WARNING
- Screenshot components: missing `alt` prop → WARNING
- HTML img tags: missing `alt` attribute → WARNING

### Screenshot variants

Find Screenshot component usages and check for both
`light` and `dark` props:
- Screenshot with only one variant → SUGGESTION

### Contrast (best effort)

If inline styles or custom CSS specify both a text color
and background color, compute the contrast ratio. Flag
combinations below WCAG AA thresholds:
- Below 4.5:1 for regular text → WARNING
- Below 3:1 for large text → WARNING

## Check 6: Terminology compliance

Scan prose content (outside code blocks) for product
naming issues.

**Rules:**
- "F5 XC" or "F5XC" without prior "F5 Distributed Cloud"
  expansion in the same file → SUGGESTION
- Lowercase product names that should be capitalized:
  "bot defense" → "Bot Defense",
  "web app and API protection" → "Web App and API Protection",
  "client-side defense" → "Client-Side Defense",
  "distributed cloud" → "Distributed Cloud"
  → SUGGESTION
- Marketing superlatives: "best-in-class",
  "industry-leading", "world-class", "cutting-edge"
  → SUGGESTION

## Output format

After running all checks, present findings in this format:

```
## Brand Compliance Review — <repo-name>

Reviewed N file(s). Found X violation(s), Y warning(s),
Z suggestion(s).

### VIOLATIONS (brand non-compliant)

- **file.mdx:L12** — Off-palette color `#3498db` found;
  nearest F5 color is Bay (`#0072b0` / `--f5-bay`)
- **logo.png** — Logo is PNG format; convert to SVG

### WARNINGS (likely issues)

- **file.mdx:L8** — Screenshot missing dark variant
- **styles.css:L45** — Hardcoded `#e4002b`; use
  `var(--f5-red)` instead
- **file.mdx:L3** — Image missing alt text

### SUGGESTIONS (style improvements)

- **file.mdx:L20** — "bot defense" should be
  capitalized: "Bot Defense"
- **file.mdx:L1** — "F5 XC" used without prior
  "F5 Distributed Cloud" expansion

---
No violations found. ✓  (if clean)
```

If all files pass all checks:

```
## Brand Compliance Review — <repo-name>

Reviewed N file(s). No issues found. ✓
```
