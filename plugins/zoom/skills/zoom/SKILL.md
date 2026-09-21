---
name: zoom
description: Join and control Zoom Workplace only through public xorgctl JSON.
---

# Zoom

Use `/zoom <meeting-id-or-invite-url>`, `/zoom status|leave|stop-share`, `/zoom audio muted|unmuted`, `/zoom video on|off`, `/zoom share browser|desktop`, or `/zoom awareness [seconds]`. Numeric IDs are canonicalized. Use a local keyring passcode only; return `passcode_required` if absent. Never log invitation URLs and verify each state change through AT-SPI/EWMH.
