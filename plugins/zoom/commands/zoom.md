---
description: Join or control Zoom Workplace with verified meeting awareness
argument-hint: "<invitation-url|meeting-id|status|awareness|leave|stop-share|audio ...|video ...|share ...|reaction ...|stimulus ...>"
allowed_tools:
  - zoom_meeting
---

# Zoom

Parse only `$ARGUMENTS`. For an HTTPS invitation URL, call `zoom_meeting`
exactly once with `action="join"` and `invitation_url` set to the complete URL.
For a numeric meeting ID, call it exactly once with `action="join"` and
`meeting_id`. For `status`, `awareness`, `leave`, or `stop-share`, call it
exactly once with only `action`; omit every optional field. For `audio`,
`video`, or `hand`, call it exactly once with that action and a normalized
desired `state` (`muted|unmuted`, `on|off`, or `raised|lowered`). For `share`,
call it exactly once with `action="share"` and a normalized `state` of
`browser` or `desktop`; when the target is omitted, use `browser`. The
`zoom_meeting` tool owns session discovery and all Xorg interaction, so do not
call `status`, `awareness`, or `xorg_desktop` before or after the requested
control. Return the native
result. Never invent placeholder values, retry with a different action, use
shell or exploratory Xorg calls, or claim a state that is `unknown` or
unverified.
For `reaction`, call exactly once with `action="reaction"` and `state` set to
one of `clap|thumbs-up|heart|laugh|wow|celebrate|yes|no|slow-down|speed-up|away`.
For `stimulus`, call exactly once with `action="stimulus"` and `state` set to
`tones` or `speech`; never substitute a physical audio device.
