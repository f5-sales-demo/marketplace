---
name: zoom
description: Join and control Zoom Workplace only through public xorgctl JSON.
---

# Zoom

Use `/zoom <meeting-id-or-invitation-url>`, `/zoom status|leave|stop-share`,
`/zoom audio muted|unmuted`, `/zoom video on|off`, `/zoom share browser|desktop`,
or `/zoom awareness [seconds]`. Numeric IDs are canonicalized. Full invitation
URLs are the expected invitation mechanism and are passed directly to Zoom
unchanged. Numeric joins never consult a keyring: if a passcode is required,
return `passcode_required` and use the full invitation URL. Verify each state
change through AT-SPI/EWMH.
