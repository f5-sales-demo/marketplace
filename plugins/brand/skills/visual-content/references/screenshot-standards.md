# F5 Screenshot Standards Reference

Source: `docs-theme/docs/screenshots.mdx` and
`docs-theme/styles/custom.css`

## Screenshot component

Import from the docs-theme package:

```astro
import Screenshot from
  '@f5xc-salesdemos/docs-theme/components/Screenshot.astro';
```

### Props

| Prop | Type | Required | Description |
| ---- | ---- | -------- | ----------- |
| `alt` | string | yes | Descriptive alt text for accessibility |
| `light` | string | no | Path to light mode screenshot |
| `dark` | string | no | Path to dark mode screenshot |

At least one of `light` or `dark` must be provided.
Both should be provided whenever possible.

### Usage

```astro
<Screenshot
  alt="Bot Defense dashboard showing 3 blocked requests"
  light="/images/bot-defense-light.png"
  dark="/images/bot-defense-dark.png"
/>
```

The component automatically shows the correct variant
based on the user's theme preference.

## CSS treatment

The theme applies these styles to screenshot images
automatically — do not add manual borders or shadows:

- Border: subtle border using `--f5-border-default`
- Border radius: `--f5-radius-md` (0.375rem)
- Shadow: `--f5-shadow-mid`
- Max width: 100% of content area

## Capture guidelines

### Dimensions

- Full-width content: 1200px minimum width
- Partial UI element: capture at native resolution,
  minimum 600px wide
- Retina: capture at 2x for crisp display on high-DPI

### File format

| Content type | Format | Reason |
| ------------ | ------ | ------ |
| UI screenshots | PNG | Crisp text, lossless |
| Diagrams | SVG | Scalable, small file |
| Photos | JPG | Good compression for photos |
| Animated UI | GIF or WebM | Short demos only |

### File naming

Use descriptive kebab-case filenames:

- `bot-defense-dashboard.png`
- `waap-configuration-panel.png`
- `dns-zone-settings-dark.png`

Do not use: `screenshot1.png`, `image.png`,
`Screen Shot 2024-01-15.png`

### File location

Place all images in `docs/images/` within the content
repository. Reference with root-relative paths:

```markdown
![Bot Defense dashboard](/images/bot-defense-dashboard.png)
```

### Content guidelines

- Crop to show only the relevant UI area
- Remove browser chrome unless it is relevant
- Redact sensitive data (customer names, API keys,
  internal URLs, IP addresses)
- Use realistic but fictional data for demos
- Capture both light and dark mode when the UI supports it

## Light and dark mode capture

1. Set the application to light mode, capture
2. Set to dark mode, capture at the same viewport
   size and scroll position
3. Name files with `-light` and `-dark` suffixes:
   `dashboard-light.png`, `dashboard-dark.png`
4. Use the `Screenshot` component with both props
