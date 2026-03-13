# Allowed Import Sources

MDX files in f5xc-salesdemos content repositories may only import from
the sources listed below. Any other import source should be flagged.

## Starlight Built-in Components

**Source:** `@astrojs/starlight/components`

Named exports (destructured import):

| Export | Purpose |
|--------|---------|
| `Aside` | Callout box (note, tip, caution, danger) |
| `Code` | Syntax-highlighted code block with variable injection |
| `Steps` | Numbered step-by-step instructions |
| `CardGrid` | Grid layout container for Card components |
| `Card` | Individual card within a CardGrid |
| `Tabs` | Tab container |
| `TabItem` | Individual tab panel |
| `LinkCard` | Card that links to another page (Starlight built-in) |
| `Badge` | Inline badge/label |
| `Icon` | Starlight icon component |
| `FileTree` | File/directory tree visualization |

**Example:**
```mdx
import { Aside, Code, Steps } from "@astrojs/starlight/components";
```

## f5xc-salesdemos Theme Components

**Source pattern:** `@f5xc-salesdemos/docs-theme/components/<Name>.astro`

Each theme component is imported as a default import from its own
`.astro` file:

| Component file | Import name | Purpose |
|---------------|-------------|---------|
| `Screenshot.astro` | `Screenshot` | Dark/light mode responsive screenshot |
| `LinkCard.astro` | `LinkCard` | Enhanced link card with icon support |
| `Banner.astro` | `Banner` | Page-width banner component |
| `Icon.astro` | `Icon` | Theme icon component |

**Example:**
```mdx
import Screenshot from "@f5xc-salesdemos/docs-theme/components/Screenshot.astro";
import LinkCard from "@f5xc-salesdemos/docs-theme/components/LinkCard.astro";
```

## Invalid Import Patterns

These patterns indicate an error:

- Importing from `node_modules` directly
- Importing from relative paths (`./`, `../`)
- Importing from packages not listed above
- Using `require()` instead of `import`
- Importing `.ts`, `.js`, or `.css` files (the build pipeline handles these)
