# GCP q35 disposition and TLS reader qualification

Issue: <https://github.com/f5-sales-demo/marketplace/issues/1559>.
Delivery remains draft PR <https://github.com/f5-sales-demo/marketplace/pull/1698>.

q35 is closed without an infrastructure submission. The original launcher failed
during prerequisite inventory, before execution, capture or submission. Its native
Platform reader retained an `SSLEOFError`, zero HTTP requests and no HTTP status.
The exact cause of the handshake EOF remains unknown.

Independent checks verified the original inspection-only journal, planned shared
store, unchanged saved plan and configuration, and absence of applied state.
All 42 original process identities and descendant groups were absent. All 21
original readers retained their identities and natural closure. The writer lock
file remains preserved and its kernel lock was unheld. Fresh independent cloud
and Platform reads verified all 21 scoped resources absent. No destroy was needed.

The changed read transport uses an explicit TLS 1.3 profile previously verified
on the Mac and Ubuntu. Its version 2 request, reply and receipt mappings require
verified certificates and hostnames, the actual negotiated protocol, disabled
TLS key logging, the qualified source bindings and complete original child
identity and process-group closure. Each request permits one GET and no retry.
Legacy version 1 evidence remains attributed to its original executor.

The retained failing-first consumer run had 50 tests and one failure. The current
run passes all 50 tests, including the unchanged original TLS regressions.
Eleven current Python sources compiled; formatting, correctness and exact scanner
byte coverage passed. Gitleaks reported zero secrets. Both private PII modes
flagged one authorized SSH routing literal in a private helper. That finding was
reviewed individually without suppression; it is excluded from public content.
All six qualified client sources and 38,383 predecessor files were verified
unchanged.

Five fresh scoped GCP lists and four fresh Platform reads completed successfully.
The Platform reads negotiated TLS 1.3 and returned HTTP 404 with verified
NOT_FOUND bodies. All nine fresh children retained their original identities,
natural process-group closure and zero termination signals.

| Evidence | SHA-256 |
| --- | --- |
| Qualified native TLS client | `46c659bb1a5195675389aad993fa926a45a27bebeeeab97aac520dbe6b7f1206` |
| Qualified version 2 consumer | `80d4a04ed094f394862a5a53744f492161cd7900333559c16e7609a33edbeb91` |
| Consumer qualification | `920c2dc327ace15a51a776642b4017f51378cbcaf47204f103cdf7de387cc539` |
| Independent 21-resource absence receipt | `32a7f778f0870d1f212993721a4d62a057cd6e04080a7970e151655f84b88dbe` |
| Final independent q35 disposition | `99e36866a8bf2f3f31efd9ac98ba44119a45923a9d5b8ccef4840ff4a39f892f` |
| Attempt 250 qualification receipt | `c6f6ebdfccc18f20dabaf20488d20579ead056b3c561d3c12c8f43cb77104e82` |

Raw authentication, plans, state and captures remain private. No sudo, privilege
escalation, MDM change or signal to the stopped historical reader was used.
The q35 admission and launcher remain consumed and cannot be replayed.

The next step is a fresh q36 namespace, campaign-only keys, configuration and
reviewed plan using the qualified TLS input. GCP-specific bootstrap-journal and
runtime-listing mappings still require original-node guest evidence. Issue 1559
also retains its lifecycle, networking, content-verified traffic, recovery,
review, publication and published user-scope runtime gates.
