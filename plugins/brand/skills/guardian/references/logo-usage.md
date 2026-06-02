# F5 Logo Usage Reference

Source: `docs-theme/assets/` and `docs-theme/docs/logo.mdx`

Live documentation:
<https://f5xc-salesdemos.github.io/docs-theme/logo/>

F5 Brand Center:
<https://brand.f5.com/d/yYzHXTsZ4EGq/logos>

## Available logo assets

Located in `docs-theme/assets/`:

| File | Description | Size |
| ---- | ----------- | ---- |
| `f5-logo.svg` | F5 logo in Cloud Red (`#e4002b`) | ~4.3 KB |
| `f5-distributed-cloud.svg` | F5 Distributed Cloud logo (white with red accent) | ~2.3 KB |
| `github-avatar.png` | GitHub organization avatar | ~15 KB |

## Format requirements

- **SVG only** — never use PNG, JPG, or other raster
  formats for logos. SVG scales cleanly at any size
  without pixelation
- **Include `viewBox`** — every SVG logo must have
  a `viewBox` attribute for proportional scaling
- **Under 10 KB** — keep logo file size small for
  fast page loads
- **No inline styles** — prefer `fill` attributes
  or CSS classes over inline `style` attributes

## Color rules

| Background | Logo color |
| ---------- | ---------- |
| Light (white/off-white) | F5 Red (`#e4002b`) |
| Dark (navy/black) | White (`#ffffff`) |
| Colored background | White (if contrast ratio >= 3:1) |

## Light/dark mode

For documentation sites, provide both light and dark
variants. The theme supports separate logo paths:

```javascript
// Single logo (adapts via CSS)
logo: {
  src: '@f5xc-salesdemos/docs-theme/assets/f5-logo.svg'
}

// Separate light and dark variants
logo: {
  light: './src/assets/logo-light.svg',
  dark: './src/assets/logo-dark.svg',
}
```

The default logo (`f5-distributed-cloud.svg`) is
designed for dark backgrounds and is configured in
`docs-theme/config.ts` line 376.

## Clear space

Maintain adequate clear space around the logo —
at minimum, the height of the "5" in the F5 logo
on all sides. Do not crowd the logo with other
elements, text, or borders.

## Do not

- Stretch, skew, or rotate the logo
- Change the logo colors to anything outside the
  approved palette
- Add effects (shadows, gradients, outlines) to
  the logo
- Place the logo on a busy or low-contrast
  background
- Recreate or redraw the logo — always use the
  official SVG assets
- Use the old F5 Networks logo or any legacy
  variants
