---
name: zoom
description: Join and control Zoom Workplace only through public xorgctl JSON.
---

# Zoom

Use `/zoom <meeting-id>`, `/zoom status|leave|stop-share`, `/zoom audio muted|unmuted`, `/zoom video on|off`, `/zoom share browser|desktop`, or `/zoom awareness [seconds]`. Numeric IDs are canonicalized. Numeric joins never consult a keyring: if a passcode is needed, return `passcode_required` and provide the invitation only on stdin to the local Zoom controller. Never log invitation URLs and verify each state change through AT-SPI/EWMH.
