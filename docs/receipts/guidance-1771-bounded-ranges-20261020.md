# Reviewed guidance range qualification guard

Issue: [#1771](https://github.com/f5-sales-demo/marketplace/issues/1771). Campaign: #1579.

## Problem and change

Installed MEDDPICC 7.8.0 baseline reads returned only the first 300 lines of two skills.
The private baseline retains those partial results; it does not establish complete guidance.
Reviewed scenarios can now admit exact line windows of at most 300 lines, bound to a shipped
relative path and SHA-256 digest. The source and coverage are checked at startup, dispatch
and completion. Capture metadata retains the selected window. Existing full-file admission
and the separate executed workflow lane remain in place.

Arbitrary selectors, changed sources, escaping paths, oversized windows, additional arguments,
duplicate rules and mismatched dispatch cannot become accepted range evidence.

## Source validation

- Discovery runtime 23.8.0: focused guard and observer suite, 36 passed, 262 assertions.
- Minimum runtime 23.5.1 and stable runtime 23.9.5: the same focused suite passed.
- Ownership, inventory, tracker and focused checks: 48 passed, 768 assertions.
- Changed-file pre-commit, diff whitespace and privacy enforcement passed on macOS.
- Initial regression and intermediate failures remain private.
- Ubuntu full plugin suite, hermeticity, focused checks, pre-commit and privacy results are
  recorded in the linked pull request before delivery.

## Remaining acceptance

This receipt records source checks only. Repeat the two missing installed MEDDPICC line windows
through the stable runtime after merge, audit exact source coverage, inspect each native capture,
and verify capture closure and session shutdown. Executed skill workflows, publication and
installed version acceptance remain separate. No tracker gate is promoted by this source fix.
