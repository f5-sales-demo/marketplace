---
name: zoom
description: Join and control Zoom Workplace only through public xorgctl JSON.
---

# Zoom

Use `zoom_meeting` as the sole controller; it discovers the active Xorg session
and owns all Xorg interaction. Do not preflight with another tool call before a
requested operation and do not retry a failed operation through direct Xorg
calls. Use `/zoom
<meeting-id-or-invitation-url>`, `/zoom status|leave|stop-share`,
`/zoom audio muted|unmuted`, `/zoom video on|off`, `/zoom share browser|desktop`,
`/zoom reaction thumbs-up|clap|heart|laugh|wow|celebrate`, or `/zoom awareness
[seconds]`. Use `/zoom stimulus tones|speech` for a bounded, non-retained
virtual-microphone test. Before a stimulus, the controller opens Zoom's semantic
Audio Settings menu and verifies `xcsh Microphone`, `xorgctl_desktop`, and
Original Sound for Musicians; it fails closed instead of selecting a physical
device. Numeric IDs are canonicalized. Full invitation
URLs are the expected invitation mechanism and are passed directly to Zoom
unchanged. Numeric joins never consult a keyring: if a passcode is required,
return `passcode_required` and use the full invitation URL. Verify each state
change through AT-SPI/EWMH. Do not explore undocumented Xorg aliases.
