# GCP guest session construction qualification

Attempt 219 qualifies a separate private session constructor after
[q29's closed diagnostic](gcp-q29-disposable-diagnostic-20261025.md). The retained
q29 failure happened before an SSH child was created. Its two independent
ownership checks shared the 15-second construction deadline; the first complete
21-object check took 9.546 seconds. This evidence does not diagnose SSH
authentication.

The successor gives complete construction a 60-second operation budget while
retaining the frozen 15-second SSH prompt budget. Both ownership checks,
original-bound serial host trust and verified routing remain required. A parent
deadline takes precedence. Late returned sessions and durable receipt failures
close any constructed session. Construction receipts grant no guest capture or
operational acceptance.

Thirty current regressions pass with zero failures, errors or skips. Nine cover
the construction and closure boundary. Seven exercise the actual frozen routed
and PTY classes with explicit local child fixtures, including ownership changes,
stale routing, missing host trust, prompt timeout and retained authentication or
host-key error output. Seven run the frozen cleanup recovery contract against the
lint-clean successor. Seven verify the original carrier receipt contract.
The earlier fixture setup and terminal-newline assertion failures remain private.
The qualified failing-first comparison reproduces the old deadline at the second
ownership check before child creation.

Pinned Bun 1.4.2 rebuilt the fresh source dependency graph successfully after an
unqualified system Bun 1.4.4 installation produced a different package layout.
No dependency checker or runtime policy was changed. The release-fetch regression
now constructs its synthetic user-info URL through the URL API, preserving the
credential refusal case without an email-shaped source literal. Its tests pass;
the original fixture and installed snapshot remain preserved.

The [acceptance matrix](gcp-issue-1559-acceptance.md) still requires a fresh
installed snapshot, reviewed deployment, attributed bootstrap journals and
listing-bound container evidence. Both GCP guest mappings, operational health,
networking, content traffic, lifecycle, recovery, CI, publication and published
installation remain open. Local PTY fixtures establish no live SSH access. The
user removed the numerical campaign cap; fresh scope, changed inputs, one reviewed
submission and independent cleanup remain required.
