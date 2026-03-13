# Frontmatter Schema

YAML frontmatter is required in every MDX file. The schema differs
between regular content pages and the landing/splash page.

## Regular Content Pages

All files except `docs/index.mdx`.

```yaml
---
title: "Page Title"        # REQUIRED — string
sidebar:
  order: 3                 # REQUIRED — number (controls sort order)
  label: "Short Label"     # RECOMMENDED — string (sidebar display name)
---
```

### Field Details

| Field | Required | Type | Severity if Missing |
| ------- | ---------- | ------ | ------------------- |
| `title` | yes | string | ERROR — page will not render |
| `sidebar.order` | yes | number | WARNING — page may sort unpredictably |
| `sidebar.label` | recommended | string | INFO — defaults to title, which may be too long |

## Landing/Splash Page

The file `docs/index.mdx` uses the `splash` template.

```yaml
---
title: "Site Title"
template: splash
hero:
  title: "Hero Heading"
  tagline: "Short description of the documentation site."
  image:
    html: '<img src="/repo-name/images/hero.svg" alt="Hero image" />'
sidebar:
  hidden: true
---
```

### Field Details

| Field | Required | Type | Severity if Missing |
| ------- | ---------- | ------ | ------------------- |
| `title` | yes | string | ERROR |
| `template` | yes | `splash` (literal) | WARNING — page renders as regular content |
| `hero.title` | yes | string | WARNING — hero section appears empty |
| `hero.tagline` | yes | string | WARNING — hero section incomplete |
| `hero.image.html` | yes | string (HTML) | WARNING — no hero image |
| `sidebar.hidden` | recommended | `true` | INFO — splash page appears in sidebar |

## Validation Notes

- Frontmatter must be the very first content in the file (no blank
  lines before the opening `---`)
- YAML parsing errors (malformed syntax) should be reported as ERROR
- The `title` field is the only universal ERROR-level requirement
  because Astro/Starlight will fail the build without it
- The `sidebar.order` field is technically optional for Starlight but
  is required by f5xc-salesdemos convention for consistent navigation
