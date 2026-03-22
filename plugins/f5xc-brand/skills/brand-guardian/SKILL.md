---
name: brand-guardian
description: >-
  F5 corporate brand identity enforcement for all content creation.
  Ensures correct use of F5 colors (45-color palette led by F5 Red
  #e4002b), typography (Neusa Next Pro Wide headlines, Proxima Nova
  body), logos (SVG only, light/dark variants), icons (f5-brand and
  f5xc packs), tone of voice, and WCAG AA accessibility. Use when
  creating or editing documentation, diagrams, presentations, video
  thumbnails, social media posts, Mermaid charts, Excalidraw drawings,
  or any content carrying F5 visual identity. Also use when the user
  asks about F5 colors, fonts, brand guidelines, or visual standards.
---

# F5 Brand Guardian

## Why this matters

F5's visual identity is what makes content instantly recognizable
as F5. Inconsistent colors, wrong fonts, or misused logos erode
brand trust and create a fragmented experience across docs, demos,
and marketing materials. This skill ensures every piece of content
you create uses the correct F5 brand elements.

**Keywords**: branding, corporate identity, visual identity, brand
colors, typography, F5 brand, visual formatting, design system,
style guide, brand standards, F5 Red, Neusa, Proxima Nova

## Source of truth

The brand specs live in two infrastructure repositories. Always
read the relevant source file before applying rules — specs may
have been updated since this skill was written.

| Dimension | Canonical source | Live docs |
| --------- | ---------------- | --------- |
| Colors (45 tokens) | `docs-theme/styles/custom.css` lines 1-48 | [Colors page](https://f5xc-salesdemos.github.io/docs-theme/colors/) |
| Typography | `docs-theme/fonts/font-face.css` + `custom.css` lines 169-211 | [Typography page](https://f5xc-salesdemos.github.io/docs-theme/typography/) |
| Logos | `docs-theme/assets/` | [Logo page](https://f5xc-salesdemos.github.io/docs-theme/logo/) |
| Design tokens | `docs-theme/styles/custom.css` lines 91-128 | — |
| Icons (f5-brand) | `docs-icons/packages/f5-brand/` (665 icons) | [Icons page](https://f5xc-salesdemos.github.io/docs-icons/) |
| Icons (f5xc) | `docs-icons/packages/f5xc/` (30 icons) | [F5 XC icons](https://f5xc-salesdemos.github.io/docs-icons/f5xc/) |
| Mermaid theming | `docs-theme/config.ts` lines 319-337 | [Diagram instructions](https://f5xc-salesdemos.github.io/docs-theme/diagrams/instructions/) |
| Screenshots | — | [Screenshot guide](https://f5xc-salesdemos.github.io/docs-theme/screenshots/) |
| F5 Brand Center | — | [brand.f5.com](https://brand.f5.com) |

## Color rules

F5 uses a 45-color palette built from 9 primary colors, each with
4 tint/shade levels, plus black and white families. Every color
has a CSS custom property name and a hex value.

### Primary colors and their roles

| Color | Hex | CSS variable | Use for |
| ----- | --- | ------------ | ------- |
| F5 Red | `#e4002b` | `--f5-red` | Primary brand accent, CTAs, F5 logo, error states |
| River | `#0e41aa` | `--f5-river` | Trust, navigation, primary data viz, info callouts |
| Bay | `#0072b0` | `--f5-bay` | Secondary blue, links, info badges |
| Jade | `#009639` | `--f5-jade` | Success states, confirmation, positive feedback |
| Tangerine | `#f29a36` | `--f5-tangerine` | Warnings, attention, highlight markers |
| Raspberry | `#ab2782` | `--f5-raspberry` | Accents, tags, category markers |
| Eggplant | `#62228b` | `--f5-eggplant` | Premium accents, feature highlights |
| Black | `#000` | `--f5-black` | Primary text on light backgrounds |
| White | `#fff` | `--f5-white` | Backgrounds, text on dark surfaces |

### Color usage rules

- **In CSS/HTML context**: always use the CSS custom property name
  (`var(--f5-red)`), never hardcode hex values — this enables
  proper dark/light mode switching
- **In non-CSS context** (Mermaid, Excalidraw, PowerPoint, video):
  use hex values from the official palette only
- **Never invent colors** outside the 45-color palette
- Use tint levels (`-1`, `-2`) for lighter variants and shade
  levels (`-3`, `-4`) for darker variants
- F5 Red is reserved for primary actions and the F5 logo — do not
  use it for decorative backgrounds or large fills

For the complete 45-color lookup table with all hex values and
tint/shade levels, consult `references/color-palette.md`.

## Typography rules

F5 uses two font families with distinct roles:

| Font | Role | Weights |
| ---- | ---- | ------- |
| **Neusa Next Pro Wide** | Headlines (H1-H3), subheads, pull quotes, CTAs, labels, buttons | 300, 400, 400i, 500, 700, 700i |
| **Proxima Nova** | Body copy, utility text, UI elements, section headers (H4-H6) | 400, 500, 600, 700 |

### Heading hierarchy

| Level | Font | Weight | Case | Line height |
| ----- | ---- | ------ | ---- | ----------- |
| H1 | Neusa Next Pro Wide | 700 (Bold) | Sentence case | 1.1x |
| H2 | Neusa Next Pro Wide | 700 (Bold) | Sentence case | 1.1x |
| H3 | Neusa Next Pro Wide | 500 (Medium) | Sentence case | 1.1x |
| H4-H6 | Proxima Nova | 700 (Bold) | UPPERCASE | 0.05em letter-spacing |

### Usage rules

- Body text minimum size is 16px
- Headlines always use sentence case (capitalize first word only),
  never title case or all-caps — except H4-H6 which are uppercase
  by design
- CTAs and sign-offs use Neusa Next Pro Wide Bold with a
  right-facing caret in F5 Red
- Buttons use Neusa Next Pro Wide at 16px, weight 600-700, with
  12px vertical padding
- For non-web contexts where Neusa/Proxima are unavailable, fall
  back to Arial Black (headlines) and Arial (body)

For the complete weight table, CSS variables, and font-face
declarations, consult `references/typography-rules.md`.

## Logo rules

- **SVG format only** — never use PNG or JPG for logos. SVG scales
  cleanly at all sizes
- Include the `viewBox` attribute for proportional scaling
- Keep logo files under 10KB
- The F5 logo uses F5 Red (`#e4002b`) on light backgrounds and
  white on dark backgrounds
- Provide light and dark mode variants for any logo placement
- Available logos are in `docs-theme/assets/`:
  - `f5-logo.svg` — F5 logo in Cloud Red
  - `f5-distributed-cloud.svg` — F5 Distributed Cloud logo
- Never recreate logos from scratch — reference existing assets

For configuration patterns and clear space guidelines, consult
`references/logo-usage.md`.

## Icon selection

Choose icon packs based on what you are representing:

1. **F5 product concepts** — use `f5-brand` (665 monochrome line
   icons, uses `currentColor` so they adapt to any theme)
2. **F5 Distributed Cloud services** — use `f5xc` (30 multi-color
   service icons with CSS custom property colors)
3. **Cloud providers** — use `hashicorp-flight` (AWS, GCP, Azure,
   K8s vendor icons), `aws`, `azure`, or `gcp`
4. **General UI** — use `lucide` (clean, consistent), `tabler`, or
   `phosphor`
5. **Technology logos** — use `simple-icons`
6. **Detailed UI** — use `carbon` or `mdi` for comprehensive sets

In Mermaid diagrams, reference icons as `pack-name:icon-name`
(e.g., `f5-brand:web-app-firewall`, `f5xc:bot-defense`).

In Astro components, import from the relevant package:
```astro
import Icon from '@f5xc-salesdemos/icons-f5-brand/Icon.astro';
```

## Tone and voice

F5's brand voice has these characteristics:

- **Confident but not arrogant** — state capabilities honestly
  without overpromising. Say "F5 XC detects and mitigates" not
  "F5 XC is the best at detecting"
- **Technical but accessible** — explain concepts clearly without
  unnecessary jargon. When a technical term is needed, define it
  on first use
- **Active voice, present tense** — prefer "F5 XC monitors
  traffic" over "traffic is monitored by F5 XC"
- **Product naming** — use "F5 Distributed Cloud" on first
  reference, "F5 XC" is acceptable on subsequent references.
  Product names are proper nouns: capitalize "Bot Defense",
  "Web App and API Protection", "Client-Side Defense", etc.
- **Abbreviations** — define on first use. Write "Web Application
  and API Protection (WAAP)" before using "WAAP" alone
- **Avoid marketing superlatives** — do not use "best-in-class",
  "industry-leading", "world-class", or "cutting-edge"

## Accessibility

WCAG AA compliance is required for all F5 content:

- **Text contrast** — minimum 4.5:1 ratio for regular text
  (under 18px), 3:1 for large text (18px+ or 14px+ bold)
- **Alt text** — all images require descriptive alt text
- **Color independence** — never use color as the sole means
  of conveying information (add labels, patterns, or icons)
- **Screenshots** — use the `Screenshot` component with both
  `light` and `dark` props when possible
- **Links** — link text must be descriptive ("View the color
  palette"), never "click here"

For pre-computed contrast pairs from the F5 palette and a
full checklist, consult `references/accessibility.md`.

## Examples

### Creating a docs page

When writing an MDX page in a content repo's `docs/` directory:

- Headings follow the H1-H3 Neusa / H4-H6 Proxima hierarchy
  automatically via the theme CSS — no manual styling needed
- Use F5 brand colors for any custom styled elements via CSS
  variables: `var(--f5-river)` for info callouts,
  `var(--f5-jade)` for success states
- Reference F5 product icons with the `Icon` component from
  `@f5xc-salesdemos/icons-f5-brand`
- Capture screenshots in both light and dark mode

### Choosing colors for a Mermaid diagram

For a security architecture diagram:

- **Infrastructure nodes** — River (`#0e41aa`) fill with white text
- **Security services** — F5 Red (`#e4002b`) border
- **Success paths** — Jade (`#009639`) links
- **Warning/alert paths** — Tangerine (`#f29a36`) links
- **Connection lines** — River (`#0e41aa`)
- **Icons** — use `f5xc:` pack for F5 XC service icons,
  `f5-brand:` for general security concepts

### Writing product copy

**Good:** "F5 Distributed Cloud Bot Defense uses JavaScript and API
signals to distinguish automated traffic from human users. Bot
Defense inspects every request in real time."

**Bad:** "F5's industry-leading bot solution is the best way to
stop all bots. Click here to learn more."

The good version uses proper product naming, active voice, specific
technical claims, and avoids superlatives.
