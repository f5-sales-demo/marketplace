# F5 Typography Reference

Source: `docs-theme/fonts/font-face.css` and
`docs-theme/styles/custom.css` lines 169-211

Live documentation:
<https://f5xc-salesdemos.github.io/docs-theme/typography/>

## Font families

### Neusa Next Pro Wide

**Role**: Headlines, subheads, pull quotes, CTAs, labels,
buttons, numeric statistics

**CSS variable**: `--sl-font-heading`

**Available weights**:

| Weight | Name | File |
| ------ | ---- | ---- |
| 300 | Light | `neusaNextProWide-300.woff2` |
| 400 | Regular | `neusaNextProWide-400.woff2` |
| 400i | Regular Italic | `neusaNextProWide-400i.woff2` |
| 500 | Medium | `neusaNextProWide-500.woff2` |
| 700 | Bold | `neusaNextProWide-700.woff2` |
| 700i | Bold Italic | `neusaNextProWide-700i.woff2` |

**Fallback stack**: `system-ui, "Segoe UI", helvetica,
arial, sans-serif`

### Proxima Nova

**Role**: Body copy, utility text, section headers (H4-H6),
UI elements, data tables

**CSS variable**: `--sl-font`

**Available weights**:

| Weight | Name | File |
| ------ | ---- | ---- |
| 400 | Regular | `proximaNova-400.woff2` |
| 500 | Medium | `proximaNova-500.woff2` |
| 600 | Semi-Bold | `proximaNova-600.woff2` |
| 700 | Bold | `proximaNova-700.woff2` |

**Fallback stack**: `system-ui, "Segoe UI", helvetica,
arial, sans-serif`

**Note**: Proxima Nova is separately licensed and is not
included in the F5 Brand Center download. It is bundled
in the docs-theme package.

## Heading hierarchy

Source: `docs-theme/styles/custom.css` lines 185-211

| Element | Font family | Weight | Case | Line height | CSS size variable |
| ------- | ----------- | ------ | ---- | ----------- | ----------------- |
| H1 | Neusa Next Pro Wide | 700 | Sentence | 1.1x | `--sl-text-5xl` (2.625rem) |
| H2 | Neusa Next Pro Wide | 700 | Sentence | 1.1x | `--sl-text-3xl` (1.8125rem) |
| H3 | Neusa Next Pro Wide | 500 | Sentence | 1.1x | `--sl-text-2xl` (1.5rem) |
| H4 | Proxima Nova | 700 | UPPERCASE | default | `--sl-text-lg` |
| H5 | Proxima Nova | 700 | UPPERCASE | default | — |
| H6 | Proxima Nova | 700 | UPPERCASE | default | — |

### CSS implementation

```css
/* All headings use the heading font */
h1, h2, h3, h4, h5, h6 {
  font-family: var(--sl-font-heading);
}

/* H1-H2 are bold */
h1, h2 { font-weight: 700; }

/* H3 is medium weight */
h3 { font-weight: 500; }

/* H4-H6 switch to body font, uppercase */
h4, h5, h6 {
  font-family: var(--sl-font);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* Line height for all headings */
:root { --sl-line-height-headings: 1.1; }
```

## Body text

- Minimum size: 16px (1rem)
- Font: Proxima Nova Regular (400)
- Line height: 1.5x (default browser/Starlight value)
- Color: inherited from Starlight theme (adapts to
  light/dark mode)

## Interactive elements

### Buttons

| Property | Value |
| -------- | ----- |
| Font | Neusa Next Pro Wide |
| Size | 16px |
| Weight | 600-700 |
| Vertical padding | 12px |
| Case | Sentence case |

### CTAs and sign-offs

Use Neusa Next Pro Wide Bold with a right-facing
caret in F5 Red:

```
Learn more ›
```

### Links

- Color: River blue (`--f5-river` / `#0e41aa`) in
  light mode
- Underline on hover
- Descriptive link text (never "click here")

## Non-web fallback fonts

When Neusa Next Pro Wide and Proxima Nova are not
available (PowerPoint, system environments):

| Brand font | Fallback |
| ---------- | -------- |
| Neusa Next Pro Wide | Arial Black, Impact |
| Proxima Nova | Arial, Helvetica |

Use `font-display: swap` in CSS to ensure text
renders immediately with fallback fonts while
custom fonts load.
