# Original authentication and provider process capture

Issue: [marketplace #1559](https://github.com/f5-sales-demo/marketplace/issues/1559).
Attempt: 398.

The capture callback lacked its original authenticated principal and audience.
Context version 2 now freezes those hashes with the admitted ADC snapshot hash.
The installed factory supplies the values from its actual authentication result;
the cloud/serial reader consumes that identity directly. Missing or foreign
snapshots refuse admission. Historical receipts and legacy cleanup are preserved.

The source-owned provider process monitor inspects the original Terraform group
through independent kernel and psutil identity reads. It retains every matching
candidate, immutable executable/file-parent identities and partial failure
receipts. It rejects replacement, foreign groups, cloned candidates and changed
inputs. It never selects the latest or first provider as an apply-phase shortcut.

A one-shot reader verifies admitted source/runtime inputs before loading its
package. It preserves an executor-created session, uses the original operation
budget or its separate five-minute final reserve, and can inspect original group
absence after natural executor exit. Candidate results explicitly retain
`applyPhaseQualified: false`; process liveness is not apply attribution.

Two authentication regressions failed first. Ten Python cases use real bounded
local processes and cooperative stdin EOF, with test pins for the entrypoint.
Session, final-reserve and group-closure regressions failed before their fixes.
The CLI entrypoint was authored before its additional lifecycle tests; its early
syntax, style and failed runs remain retained. No actual Google provider or GCP
guest is qualified by those fixtures. Development pytest 8.4.2 is separate from
the production Python 3.15/psutil 7.2.2 runtime, which remains unchanged.

The Python regressions run through the Bun test gate. Final verification passes
860 shared tests with 4,500 assertions, source Biome, native Terraform typecheck,
strict Python Ruff/mypy, three runtime builds and dependency checks. No process
signals or cloud submissions were used.

Next acceptance is a fresh actual original Google provider/reader qualification
and controller integration with exact saved-plan/VM insert, ownership/token/NIC,
serial trust and real Site CLI capture. The default controller remains absent
and GCP Terraform apply remains refused. All live lifecycle/networking, traffic,
cleanup, ordinary installed runtime, review, CI, publication and installation
gates remain open.
