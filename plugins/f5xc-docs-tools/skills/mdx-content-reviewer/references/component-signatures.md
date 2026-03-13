# Component Attribute Signatures

Required and optional attributes for components used in
f5xc-salesdemos MDX content.

## Screenshot

Renders a responsive image that switches between light and dark
variants based on the user's color scheme preference.

| Attribute | Required | Type | Notes |
| ----------- | ---------- | ------ | ------- |
| `alt` | yes | string | Accessibility text describing the image |
| `light` | conditional | string | Path to light-mode image. At least one of `light` or `dark` is required |
| `dark` | conditional | string | Path to dark-mode image |

**Valid examples:**
```mdx
<Screenshot light="/images/dashboard.png" alt="CSD dashboard overview" />
<Screenshot light="/images/config-light.png" dark="/images/config-dark.png" alt="Configuration panel" />
```

**Invalid examples:**
```mdx
<Screenshot light="/images/dashboard.png" />          <!-- missing alt -->
<Screenshot alt="Dashboard" />                         <!-- missing light and dark -->
```

## Aside

Renders a styled callout box.

| Attribute | Required | Type | Notes |
| ----------- | ---------- | ------ | ------- |
| `type` | yes | `"note"` \| `"tip"` \| `"caution"` \| `"danger"` | Controls color and icon |
| `title` | no | string | Override the default title |

**Valid examples:**
```mdx
<Aside type="caution">Warning text here.</Aside>
<Aside type="tip" title="Pro tip">Helpful text.</Aside>
```

## Code

Renders a syntax-highlighted code block. Supports variable injection
via `export const`.

| Attribute | Required | Type | Notes |
| ----------- | ---------- | ------ | ------- |
| `code` | yes | string or `{variable}` | The code content. If using a variable, it must be defined as `export const` in the same file |
| `lang` | yes | string | Language identifier (e.g., `js`, `bash`, `json`) |
| `title` | no | string | Filename/title shown above the code block |
| `frame` | no | `"code"` \| `"terminal"` \| `"none"` | Frame style |
| `mark` | no | string or array | Lines to highlight |
| `ins` | no | string or array | Lines to show as inserted |
| `del` | no | string or array | Lines to show as deleted |

**Valid examples:**
```mdx
export const myScript = `console.log("hello");`;

<Code code={myScript} lang="js" title="example.js" />
<Code code="echo hello" lang="bash" />
```

**Invalid — variable not defined:**
```mdx
<Code code={undefinedVar} lang="js" />
```

## LinkCard (theme version)

Enhanced link card supporting icons from the f5xc-salesdemos icon sets.

| Attribute | Required | Type | Notes |
| ----------- | ---------- | ------ | ------- |
| `title` | yes | string | Card heading |
| `href` | yes | string | Destination URL |
| `description` | no | string | Card body text |
| `icon` | no | string | Iconify icon identifier (e.g., `f5xc:web-app-and-api-protection`) |

## Card

Content card for use inside `<CardGrid>`.

| Attribute | Required | Type | Notes |
| ----------- | ---------- | ------ | ------- |
| `title` | yes | string | Card heading |
| `icon` | no | string | Icon identifier |

## Badge

Inline label/badge.

| Attribute | Required | Type | Notes |
| ----------- | ---------- | ------ | ------- |
| `text` | yes | string | Badge label |
| `variant` | no | `"note"` \| `"tip"` \| `"caution"` \| `"danger"` \| `"default"` \| `"success"` | Color variant |

## Steps

Wraps ordered list items to render as numbered steps. No attributes.
Content goes between `<Steps>` and `</Steps>` tags wrapping a
standard Markdown ordered list.

## Tabs / TabItem

Tab container. `TabItem` requires a `label` attribute.

| Component | Attribute | Required | Type |
| ----------- | ----------- | ---------- | ------ |
| `Tabs` | (none) | — | — |
| `TabItem` | `label` | yes | string |

## CardGrid

Grid container for `Card` components. No required attributes.

## FileTree

Renders a file/directory tree from a Markdown unordered list.
No attributes.
