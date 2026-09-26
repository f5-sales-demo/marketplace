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

Use generic Xorg window list plus maximize or fullscreen afterward if desired.
The user configuration, including any `XORGCTL` block, remains authoritative.

For published-artifact acceptance, run `scripts/ghostty-uat.py` with a JSON
scenario containing an exact `argv`, ordered `steps` (`wait_for` then `send`),
and `required` transcript gates. The harness allocates a real PTY and writes a
sanitized `transcript.txt` plus structured `result.json` into a mode-0700
evidence directory; both files are mode 0600. A nonzero child exit, timeout, or
missing gate fails the run.

Render `fixtures/terminal-capabilities.py` inside the task-owned Ghostty window
for direct visual checks of the configured Nerd Font, emoji fallback, Unicode
box drawing, truecolor, OSC 8 links, SGR mouse mode, and Kitty graphics. Retain
original-resolution screenshots and close only windows and Herdr resources whose
ownership was established for the UAT.
