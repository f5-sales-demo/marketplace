# F5 Diagram Theming Reference

Source: `docs-theme/config.ts` lines 307-337

Live documentation:
<https://f5xc-salesdemos.github.io/docs-theme/diagrams/instructions/>

## Mermaid theme configuration

The docs-theme initializes Mermaid with these theme
variables. Custom styling via `style` directives in
your diagram will override these defaults.

```javascript
mermaid.initialize({
  theme: 'base',
  themeVariables: {
    primaryColor: '#e8ecf4',
    primaryTextColor: '#1a1a2e',
    primaryBorderColor: '#0e41aa',
    lineColor: '#0e41aa',
    secondaryColor: '#fff5eb',
    secondaryTextColor: '#1a1a2e',
    secondaryBorderColor: '#f29a36',
    tertiaryColor: '#f0e6f6',
    tertiaryTextColor: '#1a1a2e',
    tertiaryBorderColor: '#62228b',
    noteBkgColor: '#ffe4c4',
    noteTextColor: '#1a1a2e',
    noteBorderColor: '#f29a36',
    fontFamily: 'F5, system-ui, sans-serif',
  },
});
```

## Color assignments by diagram element role

These assignments create visually consistent and
semantically meaningful diagrams.

### Node fills and borders

| Role | Fill | Border | Derived from |
| ---- | ---- | ------ | ------------ |
| Primary / infrastructure | `#e8ecf4` | `#0e41aa` | River family |
| Secondary / supporting | `#fff5eb` | `#f29a36` | Tangerine family |
| Tertiary / advanced | `#f0e6f6` | `#62228b` | Eggplant family |
| Security / F5 services | `#ffffff` | `#e4002b` | Red (border only) |
| Success / healthy | `#b2dfc4` | `#009639` | Jade family |
| Warning / caution | `#ffe4c4` | `#f29a36` | Tangerine family |
| Error / blocked / threat | `#f7b2bf` | `#e4002b` | Red family |
| Origin / application | `#b2dfc4` | `#009639` | Jade family |
| External / third-party | `#f5f5f5` | `#999999` | Neutral gray |

### Connection lines

| Type | Color | Style |
| ---- | ----- | ----- |
| Default flow | `#0e41aa` (River) | Solid |
| Success path | `#009639` (Jade) | Solid |
| Warning path | `#f29a36` (Tangerine) | Dashed |
| Blocked / denied | `#e4002b` (Red) | Dashed or dotted |

### Text color

Use `#1a1a2e` (dark navy) for all text in diagrams.
This provides strong contrast against all light fills.

## Icon pack reference

### F5-specific packs

**f5-brand** (665 icons): Monochrome line art at 50x50.
Uses `currentColor` so they adapt to any fill. Best for
product concepts, security features, networking elements.

Common icons: `web-app-firewall`, `bot-defense`,
`application`, `api-security`, `load-balancer`,
`ssl-certificate`, `dns`, `firewall`, `cloud`,
`data-center`, `user`, `threat`, `dashboard`

**f5xc** (30 icons): Multi-color service icons at 40x40.
Uses CSS custom properties for theme-aware coloring. Best
for specific F5 Distributed Cloud service references.

Complete list: `account-protection`, `administration`,
`ai_assistant_logo`, `application-traffic-insight`,
`audit-logs-and-alerts`, `authentication-intelligence`,
`big-ip-apm`, `big_ip_utilities`, `billing`,
`bot-defense`, `client-side-defense`,
`content-delivery-network`, `data-intelligence`,
`ddos-and-transit-services`, `delegated-access`,
`distributed-apps`, `dns-management`, `doc`,
`mobile_app_shield`, `multi-cloud-app-connect`,
`multi-cloud-network-connect`, `nginx-one`,
`observability`, `platform`, `shared-configuration`,
`support`, `user-support`, `voltshare`,
`web-app-and-api-protection`, `web-app-scanning`

### Cloud provider packs

| Pack | Count | Best for |
| ---- | ----- | -------- |
| `hashicorp-flight` | 672 | AWS, GCP, Azure, K8s vendor logos |
| `azure` | 606 | Azure architecture diagrams |
| `aws` | 885 | AWS architecture (not registered in Mermaid) |
| `gcp` | 216 | GCP architecture (not registered in Mermaid) |

### General-purpose packs

| Pack | Count | Style |
| ---- | ----- | ----- |
| `lucide` | ~1,600 | Clean, minimal line icons |
| `tabler` | 6,034 | Consistent line icons |
| `phosphor` | 9,161 | 6 weight variants per icon |
| `carbon` | 2,582 | IBM Carbon design system |
| `mdi` | 7,638 | Material Design comprehensive |
| `simple-icons` | 3,200+ | Brand/technology logos |

## Excalidraw color mapping

Map Excalidraw's color picker to F5 palette values:

| Excalidraw default | Replace with | F5 name |
| ------------------ | ------------ | ------- |
| Blue (#1971c2) | `#0e41aa` | River |
| Red (#e03131) | `#e4002b` | F5 Red |
| Green (#2f9e44) | `#009639` | Jade |
| Orange (#e8590c) | `#f29a36` | Tangerine |
| Violet (#7048e8) | `#62228b` | Eggplant |
| Pink (#c2255c) | `#ab2782` | Raspberry |
| Gray (#868e96) | `#999` | Black-1 |
| Black (#1e1e1e) | `#000` | Black |

Export settings for docs embedding:
- Format: SVG
- Background: transparent
- Theme: light (for docs integration)
