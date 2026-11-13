# GCP provider lifecycle chronology

Issue: #1559. Full acceptance remains incomplete.

The original provider lifecycle parser now refuses reversed timestamps across
provider starts, RPC receive/serve records and exits. Refusal remains permanent.
Timestamp syntax and ordered byte records alone do not grant process authority.

Descriptor-issued RPC sources now retain schema 2 temporal intervals: provider
starting, started and exited times, plus RPC received and served times. These
fields are available only after the actual original output and matching completed
stream are verified. Copied, unowned or incomplete descriptors still refuse.
The interval remains linked to the original executor and full stderr digest.

Failing-first chronology tests exposed the previous acceptance of reversed
timelines. The new checks preserve equal timestamp records and distinct schema
and read processes. Required fixture shapes retain explicit timestamps rather
than weakening the interface or compiler checks.

This establishes source chronology and original descriptor provenance. Matching
the interval to independently observed process windows and real refresh across
expiry remains required for current installed runtime qualification. Historical
expiry captures retain their original binaries, source and cleanup attribution.
Builtin capture, live GCP guest/network/lifecycle/traffic acceptance, ordinary
Ubuntu `bun dev`, review/CI, publication and installation remain open.
