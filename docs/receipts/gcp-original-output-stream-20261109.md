# Original executor output capture

Issue: [marketplace #1559](https://github.com/f5-sales-demo/marketplace/issues/1559).
Attempt: 409.

The executor previously exposed private output paths without a reader bound to
its actual writer handles and original child descriptors. It now admits a live
output capability inside its existing startup deadline, before releasing the
original gate. The reader retains separate channel offsets, 64 KiB chunks and
a maximum of 64 MiB per channel. It checks exact file and parent identities,
original process, group, session and boot identity, and inherited descriptors.
Previously consumed bytes are rehashed before further output is published.
Caller mutation of returned bytes cannot change the retained digest.

Concurrent reads, changed paths, links, permissions, parents, descriptors,
retained prefixes and output limits refuse capture. Completion requires every
byte consumed and independently verified original group closure. A live group
or unconsumed output cannot supply completion. Existing original operation and
separate final-capture budgets remain in force. Failures preserve private output
and unresolved executor claims; no process signals are sent.

Seven tests failed before implementation. Two additional real-process cases
exercise live partial appends and original-child descriptor redirection. The
focused executor and provider-reader run passed 39 tests and 205 assertions.
The final shared run passed 1,008 tests and 4,475 assertions. All three native
TypeScript checks, runtime builds and dependency checks passed. An initial type
error in the asynchronous identity narrowing and an incorrect test expectation
for aggregated persistence failures were repaired; their failures remain retained.
Synthetic reader fixtures explicitly refuse output access and cannot substitute
for the original descriptor capability. Shipped Python sources remain unchanged.

A fresh authenticated Terraform 1.16.6 / Google 8.7 fixture consumed actual output
through the new capability into both source parsers during its single original
apply. It retained 9,592 valid JSON trace records and one exact reviewed read
RPC/HTTP transaction. The reviewed plan allowed one local builtin create and
one deferred Google zones read, with zero managed cloud creates or mutations.
Retained file hashes matched the consumed channel hashes. Its source receipt is
`5f6973584f512f2c07131c8eb0738c4789fa5f64f391bf6ed8baea3113dd58f9`.

Reviewed local teardown and separate empty-destroy planning left stable empty
state. Independent kernel and psutil checks verified all eight original and two
cleanup process groups absent. The independent cleanup receipt is
`412688a16c4309278763acfa324df21d8dcc2f36249d301995a3ab11974fbca5`.
The predecessor's original cleanup was independently rechecked before execution.
Its raw evidence and the legacy marker-only request-reason metric are preserved.

This qualifies source descriptor admission and read-contract composition.
The output capability and parser completions retain false apply-RPC and original
insert qualification flags. Original Google provider identity, reviewed managed
resource action, actual create request, audit and numeric incarnation still need
their complete join. The default installed capture controller remains absent;
ordinary GCP Terraform apply refuses before consuming its reviewed plan.
Full guest, native/Terraform lifecycle and networking, traffic, recovery,
ordinary installed Ubuntu runtime, review, CI, merge, qualified publication,
download and published installation acceptance remain required.
