# GCP q39 external provider execution

Issue: #1559. Attempt: 306. Full issue acceptance remains incomplete.

A credential-free, provider-only fixture initialized the reviewed filesystem
mirror with backend access disabled, then ran actual Terraform validation.
Terraform 1.16.6, Google 8.7.0 and xcsh 15.13.0 executables were bound to their
reviewed hashes. Initialization and validation each exited zero; validation
reported a valid configuration. Remote planning, apply and credential-bearing
invocations were refused.

The complete private trace records both original provider executable paths,
matching launch and exit IDs, and schema retrieval. It contains no provider
configuration call. HashiCorp documents
[validation](https://developer.hashicorp.com/terraform/cli/commands/validate)
as a local configuration check without validating remote services. This fixture
did not create a GCP plan or submit infrastructure changes.

The original acceptance checker refused the 2.4 MB trace against its 1 MB
limit. That failure and the complete raw capture are retained. A separately
qualified reader accepts at most 4 MB, verifies original private file metadata,
complete UTF-8 bytes, the reviewed digest and both attributed launch-exit joins.
Missing, changed, malformed, foreign, duplicate or truncated evidence is refused.
Provider execution was not replayed to repair the checker.

The retained gate and controller receipts show natural closure with complete,
untruncated command output. Fresh independent SDK and kernel checks verified
absence of six recorded gate, controller and reviewer subjects. Provider IDs
come from the trace; their SDK birth identities were not separately witnessed.
The retained controller's 60-second local limit does not qualify production
deadlines.

These results qualify offline provider execution and retained evidence only.
Live credential production, exact Platform workspace and provider integration,
production child identity and deadline qualification, the campaign bridge and
guard remain open. Installation, live guest and lifecycle behavior, networking,
content-verified traffic, recovery, cleanup, review and publication retain their
existing gates. Historical capture and complete reader-closure flags remain
false, and original locks and immutable artifacts are preserved.
