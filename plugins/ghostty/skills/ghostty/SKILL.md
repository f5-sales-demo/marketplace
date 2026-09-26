---
name: ghostty
description: Launch a configured Ghostty terminal in an Xorg session for Herdr work.
---

# Ghostty on Xorg

This plugin performs setup only. It never launches Ghostty and has no Ghostty-specific runtime tool.

Launch through the generic Xorg application interface in the chosen session:

```sh
ghostty -e herdr
```

Use generic Xorg window list plus maximize or fullscreen afterward if desired. The user configuration, including any `XORGCTL` block, remains authoritative.
