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
device. `video on` likewise selects and verifies exactly `xcsh Camera`; it
never falls back to a physical camera. Matching joins and video-on verify the
Zoom HD checkbox and enable it when off. Zoom still adapts network resolution. `/zoom status` reports isolated
terminal-camera readiness and provenance. Numeric IDs are canonicalized. Full invitation
URLs are the expected invitation mechanism and are passed directly to Zoom
unchanged. Numeric joins never consult a keyring: if a passcode is required,
return `passcode_required` and use the full invitation URL. Verify each state
change through AT-SPI/EWMH. Do not explore undocumented Xorg aliases.


Terminal-camera setup uses native 1280×720 YUV420p at 15 FPS, normal chroma
conversion, and a dedicated Ghostty font-9 profile with one pixel added to box
strokes. Existing Xorg desktops retain their geometry; the owned camera window
covers the captured 1280×720 region. The setup receipt verifies display, window,
producer arguments, frame rate, and managed profile/unit hashes. Keep the
original Herdr session and unrelated terminals running. Setup reconciles only
an exactly matching legacy camera override; conflicting overrides fail closed.
