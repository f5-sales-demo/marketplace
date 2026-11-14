# CE UAT60 owning direct route activation

Public AWS Terraform apply now transitions exact imported original routes to the selected CE SLI.
The stage binds its durable source to the completed import, original rollback snapshot, cloud owner and
provider state IDs. It permits only selected route updates, with explicit prior/proposed targets and
complete verified-up MAC/device/node/role observations before planning and saved-plan submission.
Down, unknown, partial, duplicate, foreign or ambiguous evidence rejects.

Revision, source, plan, submission-marker, apply-response and refresh-response interruption recover from
durable checkpoints. Submitted changes require two identical provider-state reads and independent full
cloud route/interface observations before reconciliation. The refresh boundary precedes journal replacement;
completed resume never replays activation. Final refresh requires no changes and exact route identity.

Preflight normalizes only complete selected CE targets backed by exact activation source/checkpoint/receipt
and fresh complete cloud observations. Other route-table configuration stays subject to immutable comparison.
Public resume skips original import once activation owns the revised configuration. Original restoration and
state relinquishment remain the teardown contract; no HA mutation guard is widened.

## Verification boundary

Initial missing-module and ambiguous dual-target regressions failed before repair. Focused validation passes
140 tests / 494 assertions. Complete four-plugin suites pass1910tests /11523assertions. All four compiler
checks and runtime builds pass. Candidate versions advance together to60. Installed and live activation
remain separate acceptance gates; source success does not qualify either.

The observer's collection time does not establish original publisher freshness. Vendor SLI-only control,
original publication freshness, six-interface up/down/up, complete live matrix, producer publication/assets,
independent cleanup and final UAT acceptance remain open. Recovery212977ms versus45000ms remains failed.
Readinessfalse288rows/300blockers. PR1565 stays draft and auto-merge-off; no UAT delivery or normal publication.
