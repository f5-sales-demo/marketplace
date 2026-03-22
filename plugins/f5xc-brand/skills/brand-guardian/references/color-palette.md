# F5 Color Palette Reference

Source: `docs-theme/styles/custom.css` lines 1-48

Live documentation:
<https://f5xc-salesdemos.github.io/docs-theme/colors/>

## Complete 45-color palette

Each primary color has 4 tint/shade variants. Level 1
is lightest, level 4 is darkest.

### F5 Red (primary brand)

| Level | Hex | CSS variable | Usage |
| ----- | --- | ------------ | ----- |
| Base | `#e4002b` | `--f5-red` | Primary accent, CTAs, F5 logo, hero elements |
| 1 | `#f7b2bf` | `--f5-red-1` | Light tint for backgrounds, hover states |
| 2 | `#f06680` | `--f5-red-2` | Medium tint, accent highlights |
| 3 | `#a70020` | `--f5-red-3` | Dark shade for contrast, active states |
| 4 | `#720016` | `--f5-red-4` | Darkest shade for badges, deep contrast |

### Tangerine (warning/attention)

| Level | Hex | CSS variable | Usage |
| ----- | --- | ------------ | ----- |
| Base | `#f29a36` | `--f5-tangerine` | Warnings, caution callouts, highlights |
| 1 | `#ffe4c4` | `--f5-tangerine-1` | Light background for caution states |
| 2 | `#ffbd61` | `--f5-tangerine-2` | Medium highlight |
| 3 | `#a35700` | `--f5-tangerine-3` | Dark shade |
| 4 | `#7a4100` | `--f5-tangerine-4` | Darkest, badge backgrounds |

### River (trust/navigation)

| Level | Hex | CSS variable | Usage |
| ----- | --- | ------------ | ----- |
| Base | `#0e41aa` | `--f5-river` | Navigation, data viz primary, info elements |
| 1 | `#b7c6e5` | `--f5-river-1` | Light tint for info backgrounds |
| 2 | `#6e8dcc` | `--f5-river-2` | Medium tint, secondary navigation |
| 3 | `#0b3180` | `--f5-river-3` | Dark shade |
| 4 | `#072155` | `--f5-river-4` | Darkest, dark slide backgrounds |

### Raspberry (decorative accent)

| Level | Hex | CSS variable | Usage |
| ----- | --- | ------------ | ----- |
| Base | `#ab2782` | `--f5-raspberry` | Tags, badges, category markers |
| 1 | `#e6bed9` | `--f5-raspberry-1` | Light tint |
| 2 | `#cd7db4` | `--f5-raspberry-2` | Medium tint |
| 3 | `#801d62` | `--f5-raspberry-3` | Dark shade |
| 4 | `#561441` | `--f5-raspberry-4` | Darkest shade |

### Jade (success/positive)

| Level | Hex | CSS variable | Usage |
| ----- | --- | ------------ | ----- |
| Base | `#009639` | `--f5-jade` | Success, confirmation, positive feedback |
| 1 | `#b2dfc4` | `--f5-jade-1` | Light success background |
| 2 | `#66c088` | `--f5-jade-2` | Medium success |
| 3 | `#00712b` | `--f5-jade-3` | Dark shade |
| 4 | `#004b1d` | `--f5-jade-4` | Darkest, badge backgrounds |

### Eggplant (premium accent)

| Level | Hex | CSS variable | Usage |
| ----- | --- | ------------ | ----- |
| Base | `#62228b` | `--f5-eggplant` | Premium features, decorative highlights |
| 1 | `#cdabe3` | `--f5-eggplant-1` | Light tint |
| 2 | `#9c59c9` | `--f5-eggplant-2` | Medium tint |
| 3 | `#822cb8` | `--f5-eggplant-3` | Dark shade |
| 4 | `#41175d` | `--f5-eggplant-4` | Darkest shade |

### Bay (secondary blue)

| Level | Hex | CSS variable | Usage |
| ----- | --- | ------------ | ----- |
| Base | `#0072b0` | `--f5-bay` | Secondary links, info callouts |
| 1 | `#b2d7eb` | `--f5-bay-1` | Light info backgrounds |
| 2 | `#66afd7` | `--f5-bay-2` | Medium tint |
| 3 | `#005c8d` | `--f5-bay-3` | Dark shade |
| 4 | `#003d5f` | `--f5-bay-4` | Darkest shade |

### White family

| Level | Hex | CSS variable | Usage |
| ----- | --- | ------------ | ----- |
| Base | `#fff` | `--f5-white` | Pure white backgrounds |
| 1 | `#faf9f7` | `--f5-white-1` | Off-white, warm background |
| 2 | `#f5f5f5` | `--f5-white-2` | Subtle gray background |
| 3 | `#e6e6e6` | `--f5-white-3` | Borders, dividers |
| 4 | `#ccc` | `--f5-white-4` | Muted gray |

### Black family

| Level | Hex | CSS variable | Usage |
| ----- | --- | ------------ | ----- |
| Base | `#000` | `--f5-black` | Pure black, primary text |
| 1 | `#999` | `--f5-black-1` | Muted text, disabled states |
| 2 | `#666` | `--f5-black-2` | Secondary text |
| 3 | `#343434` | `--f5-black-3` | Dark surface background |
| 4 | `#222` | `--f5-black-4` | Near-black surface |

## Mermaid diagram theme variables

Source: `docs-theme/config.ts` lines 319-337

These are the Mermaid `themeVariables` configured in the
docs-theme. Use these for consistency when creating
Mermaid diagrams.

| Variable | Value | Based on |
| -------- | ----- | -------- |
| `primaryColor` | `#e8ecf4` | River-tinted light fill |
| `primaryTextColor` | `#1a1a2e` | Dark navy text |
| `primaryBorderColor` | `#0e41aa` | River |
| `lineColor` | `#0e41aa` | River |
| `secondaryColor` | `#fff5eb` | Tangerine-tinted light fill |
| `secondaryBorderColor` | `#f29a36` | Tangerine |
| `tertiaryColor` | `#f0e6f6` | Eggplant-tinted light fill |
| `tertiaryBorderColor` | `#62228b` | Eggplant |
| `noteBkgColor` | `#ffe4c4` | Tangerine-1 |
| `noteBorderColor` | `#f29a36` | Tangerine |
| `fontFamily` | `F5, system-ui, sans-serif` | — |

## F5 XC multi-color icon variables

Source: `docs-theme/styles/custom.css` lines 50-68

These CSS custom properties control the multi-color
f5xc service icons. They adapt between light and dark
mode.

| Variable | Light mode | Dark mode | Purpose |
| -------- | ---------- | --------- | ------- |
| `--color-N600` | `#0f1e57` | `#e5eaff` | Navy / dark strokes |
| `--color-brand` | `#e4002b` | `#e4002b` | F5 Red accent (same both modes) |
| `--color-blue-light` | `#e5eaff` | `#0e41aa` | Light blue fills |
| `--color-N200` | `#e6e9f3` | `#1a2a6c` | Light gray fills |

## Starlight theme mapping

Source: `docs-theme/styles/custom.css` lines 70-167

The theme maps F5 colors to Starlight's semantic color
slots. This determines how brand colors appear in the
documentation site framework.

### Dark mode (default)

| Starlight variable | F5 mapping |
| ------------------ | ---------- |
| `--sl-color-accent-low` | `--f5-red-4` |
| `--sl-color-accent` | `--f5-red-2` |
| `--sl-color-accent-high` | `--f5-red-1` |

### Light mode

| Starlight variable | F5 mapping |
| ------------------ | ---------- |
| `--sl-color-accent-low` | `--f5-red-1` |
| `--sl-color-accent` | `--f5-red` |
| `--sl-color-accent-high` | `--f5-red-4` |

### Badge backgrounds

| Badge type | Dark mode | Light mode |
| ---------- | --------- | ---------- |
| Default/Note | `--f5-bay-4` | `--f5-bay-1` |
| Danger | `--f5-red-4` | `--f5-red-1` |
| Success | `--f5-jade-4` | `--f5-jade-1` |
| Caution | `--f5-tangerine-4` | `--f5-tangerine-1` |
| Tip | `--f5-eggplant-4` | `--f5-eggplant-1` |
