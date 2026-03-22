# F5 Accessibility Reference

## WCAG AA requirements

All F5 content must meet WCAG 2.1 Level AA. The key
requirements for brand-related content are:

### Text contrast (1.4.3)

- **Regular text** (under 18px or under 14px bold):
  minimum 4.5:1 contrast ratio
- **Large text** (18px+ or 14px+ bold): minimum 3:1
  contrast ratio
- **UI components and graphical objects** (1.4.11):
  minimum 3:1 against adjacent colors

### Non-text contrast (1.4.11)

- Icons, borders, and UI controls must have at least
  3:1 contrast against their background
- Chart elements, diagram borders, and data
  visualization markers must be distinguishable

### Color independence (1.4.1)

- Never use color as the sole means of conveying
  information
- Add text labels, patterns, or icons alongside
  color coding
- In diagrams, use both color and shape/label to
  distinguish elements

## Pre-computed F5 color contrast pairs

These combinations from the F5 palette pass WCAG AA
for the specified text size. Use these as safe defaults.

### White text on colored backgrounds

| Background | Hex | Ratio | Regular text | Large text |
| ---------- | --- | ----- | ------------ | ---------- |
| F5 Red | `#e4002b` | 4.6:1 | Pass | Pass |
| River | `#0e41aa` | 6.4:1 | Pass | Pass |
| Bay | `#0072b0` | 4.6:1 | Pass | Pass |
| Jade | `#009639` | 4.0:1 | Fail | Pass |
| Raspberry | `#ab2782` | 5.3:1 | Pass | Pass |
| Eggplant | `#62228b` | 7.2:1 | Pass | Pass |
| River-3 | `#0b3180` | 8.4:1 | Pass | Pass |
| River-4 | `#072155` | 11.7:1 | Pass | Pass |
| Black | `#000` | 21:1 | Pass | Pass |
| Black-4 | `#222` | 16.8:1 | Pass | Pass |

### Dark text on colored backgrounds

| Background | Text | Ratio | Regular text | Large text |
| ---------- | ---- | ----- | ------------ | ---------- |
| White | Black (`#000`) | 21:1 | Pass | Pass |
| White-1 | Black (`#000`) | 19.5:1 | Pass | Pass |
| Red-1 | Black (`#000`) | 13.2:1 | Pass | Pass |
| River-1 | Black (`#000`) | 12.4:1 | Pass | Pass |
| Tangerine-1 | Black (`#000`) | 15.7:1 | Pass | Pass |
| Jade-1 | Black (`#000`) | 14.5:1 | Pass | Pass |

### Common failing combinations

These combinations do NOT meet WCAG AA for regular
text. Avoid them:

| Combination | Ratio | Problem |
| ----------- | ----- | ------- |
| White text on Tangerine | 2.6:1 | Too low contrast |
| White text on Jade | 4.0:1 | Borderline, fails regular |
| Black-1 (`#999`) on White | 2.8:1 | Gray too light |
| Red text on River background | 2.4:1 | Both dark, insufficient |

## Image accessibility

### Alt text

- Every `img` element and `Screenshot` component
  requires descriptive `alt` text
- Describe what the image shows, not just what it is:
  "Dashboard showing three blocked bot requests" not
  "Screenshot of dashboard"
- For decorative images only, use `alt=""`

### Screenshot component

Use the `Screenshot` component with both mode variants:

```astro
<Screenshot
  alt="Bot Defense dashboard showing blocked requests"
  light="/images/dashboard-light.png"
  dark="/images/dashboard-dark.png"
/>
```

If only one variant is available, provide at least the
one that matches the default theme (dark).

### Diagrams

- Include descriptive text before or after the diagram
  explaining what it shows
- Mermaid diagrams rendered as SVG are accessible to
  screen readers via the Mermaid `accTitle` and
  `accDescr` directives
- Use text labels on diagram nodes, not just colors

## Keyboard and focus

- All interactive elements must be keyboard accessible
- Focus indicators use the F5 focus ring tokens:
  - Action focus: River color (`--f5-focus-action`)
  - Critical focus: Red color (`--f5-focus-critical`)
