# Deferred data hooks and original Google trace contract

Issue: <https://github.com/f5-sales-demo/marketplace/issues/1559>.
Delivery: draft <https://github.com/f5-sales-demo/marketplace/pull/1698>.

Attempt 407 fixes deferred data-source addresses in the reviewed Terraform
core-hook parser. The failing-first case reproduced a refusal of the `data.`
prefix. The parser now derives data mode from the exact reviewed address and
checks the resource identity without allowing a data source to impersonate a
managed resource. Fourteen focused cases and 68 assertions pass. Candidates
retain false provider-RPC and original-insert qualification flags.

A fresh original execution used the retained Terraform 1.16.6, Google 8.7.0,
unchanged provider lock, authenticated owned ADC snapshot and explicit reviewed
request reason. Its saved plan permitted one builtin local resource and one
deferred Compute zones read. No managed cloud resource or cloud mutation was
permitted. The actual provider returned 130 zone records, and reviewed local
teardown left an empty, stable state. Independent kernel and SDK inspection
verified all eight original executor groups absent, without signals.

The original trace contains 9,592 valid JSON records. Its Google SDK protocol
records bracket the deferred read with matching request identity. Terraform
forwards each line of the legacy HTTP dump in a separate JSON record, including
empty lines and closing markers. The explicit reason appears in its own header
record. A request-marker-only search therefore missed it; that original metric
and receipt remain preserved with a separate corrected disposition.

The corrected inspection retained the complete eight-line request and
3,475-line response blocks inside the original read RPC. This establishes the
observed framing contract, not original create authority. A production reader
still needs original stream and producer admission, bounded assembly, strict
refusal of missing or overlapping blocks, matching reviewed resource/RPC scope
and the actual insert operation and incarnation join.

The first fixture refused during read-only initialization because its provider
declarations omitted a preserved lock dependency. It never planned or applied;
both original groups were independently absent, with no state or cloud mutation.
The successor added the matching dependency declarations in a fresh workspace
and preserved the lock bytes and read-only policy.

Source research also corrects an earlier schema-only conclusion.
Google 8.7.0 [HandleSDKDefaults](https://github.com/hashicorp/terraform-provider-google/blob/v8.7.0/google/transport/config.go)
fills an empty configured request reason from `CLOUDSDK_CORE_REQUEST_REASON`.
The fixture uses an explicit nonempty reviewed value, so that fallback cannot
change its attribution. A request reason remains correlation evidence.

The original private trace receipt has SHA-256
`898e7f272171517c085cc3ebca5d3c6bebf4aa03e5905e92624a478ebd7c76c2`.
The corrected split-block disposition has SHA-256
`de8fc9f575269f2a346fcce063c2e13c1d473ecc8535aea1dbbdd870018dc1f0`.
The independent cleanup receipt has SHA-256
`a3d2d64071489b6c52c24c4f2acfad03bbd6e25da359415dae4f139c15a5cdae`.

The installed full-capture gate remains closed. Original apply/request/audit/
insert attribution, live guest completeness, native/Terraform lifecycle and
networking, verified traffic and recovery, ordinary installed Ubuntu runtime,
required review, merge, publication and published installation remain open.

The relevant shared suites pass 987 tests and 4,348 assertions. All three
TypeScript checks, runtime builds and dependency checks pass. These checks
qualify the changed source and observed read contract; they do not establish
installed-tool or live GCP lifecycle acceptance.
