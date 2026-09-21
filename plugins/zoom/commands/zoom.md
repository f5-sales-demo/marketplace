---
description: Join or control Zoom Workplace with verified meeting awareness
argument-hint: "<invitation-url|meeting-id|status|awareness|leave|stop-share|audio ...|video ...|share ...>"
allowed_tools:
  - zoom_meeting
---

# Zoom

Parse only `$ARGUMENTS`. For an HTTPS invitation URL, call `zoom_meeting`
exactly once with `action="join"` and `invitation_url` set to the complete URL.
For a numeric meeting ID, call it exactly once with `action="join"` and
`meeting_id`. For `status`, `awareness`, `leave`, `stop-share`, `audio`,
`video`, or `share`, call it exactly once with that action and the remaining
arguments in `command` when present. Return the native result. Never use shell
or exploratory Xorg calls, and never claim a state that is `unknown` or
unverified.
