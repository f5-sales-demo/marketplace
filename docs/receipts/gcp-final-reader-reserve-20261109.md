# Original final reader reserve

Issue: [marketplace #1559](https://github.com/f5-sales-demo/marketplace/issues/1559).
Attempt: 400.

The Python reader accepted the original final capture reserve, but the outer
executor refused new reads after the operation deadline. A separate compiled
final-reader executor now consumes an admitted parent's fixed reserve. It
requires the same pinned Python interpreter, isolated script arguments and a
sixty-second command limit. Terraform execution keeps its original deadline.

The installed dispatcher binds the original invocation budget before command
release and delivers the matching reserve with final capture. Its source guard
rechecks original input and group metadata. Serialized or cloned reserve objects
cannot grant execution. The first admitted window for an original actor cannot
be renewed by changing either budget. The window registry retains clock values
without retaining credential or guard closures.

Matching partial capture still runs when final metadata is invalid; failures are
aggregated after the remaining input and ownership checks. Existing deployments,
historical receipts and unresolved capture flags remain preserved.

The missing capability failed first, two dispatcher cases failed before their
fixes, and an actor-window renewal regression failed before the window was
sealed. Delayed natural completion retains the parent's exact final deadline.
Final validation passes 968 shared tests with 4,256 assertions, 74
bundle/integration/tracker tests with 644 assertions, all three plugin typechecks,
strict source checks, runtime builds and privacy checks on Bun 1.4.2.

An initial live fixture correctly refused its one-second allowance before
release; no reader or parent command was submitted. Its two original process
groups were independently absent, and failed capture evidence remains retained.
A changed fixture admitted the parent before its eight-second timeout and ran
the shipped one-shot reader with production Python 3.15/psutil 7.2.2 and fixed
executable pins. The final successor also includes the sealed-window guard.
The parent completed naturally, all three original groups were independently
absent, and both the original operation and parent final deadlines were retained.
Receipt SHA-256:
`191b715d2c6f3c0c1062d3ba24cb41b05133e2b8fa159930de4b1825b7c2fcbb`.
Independent closure SHA-256:
`4ea5af4b088a12c75432e46ed72c98ec465394e92938a2b032873a7812746076`.

This is a controlled local failure-boundary check with zero GCP resources and
no process signals. Actual two-hour expiry, original cloud apply attribution,
complete cloud/serial/SSH capture, native/Terraform lifecycle and traffic,
ordinary installed Ubuntu runtime, review, CI, publication and published
installation remain unqualified. The default capture controller remains absent
and GCP Terraform apply still refuses before plan consumption. Immutable
v12.3.1 and frozen historical executors remain unchanged.
