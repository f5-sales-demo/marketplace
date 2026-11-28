# GCP q39 provider birth identity

Issue: #1559. Attempt: 308. Full issue acceptance remains incomplete.

A versioned private controller adds live SDK and kernel sampling to the
credential-free provider validation fixture. Every accepted child identity
joins its numeric PID, original executor group, boot and process birth across
the retained kernel row and two stable SDK reads. The observer enforces a
five-second sample freshness limit, the existing local operation deadline and
a bounded round count. It retains races with normal child exit as partial
records. Held or exited processes do not start another observation.

Five failing-first Python identity and timing tests passed. Actual mirrored
initialization and validation then passed two tests with 24 assertions. Seven
sampling rounds retained original births for both reviewed provider launch IDs.
An independent reader reconstructed those joins from the raw kernel captures,
then verified both original providers absent using two fresh SDK/kernel reads
per provider. Separate fresh checks verified absence of six original gate,
controller and reviewer subjects. No cloud planning or infrastructure
submission occurred.

The initial hash-binding path error and the resulting refusal before provider
launch are preserved. The corrected execution used newly bound, changed inputs.
Frozen collectors, previous executor receipts and original locks were retained.
The private CLI harness passes its standalone Ruff E/F checks; the broader
default lint diagnostics remain recorded. No source lint configuration changed.

These are offline process and attribution results. Production deadlines,
trusted live credential production, exact Platform and provider integration,
the campaign bridge and guard remain open. Current GCP account and project
access were separately reverified in attempt 307; that time-sensitive evidence
does not itself admit production credentials.

Installation, ordinary configured-model runtime, live guest and lifecycle
behavior, networking, content-verified traffic, recovery, cleanup, CI, review
and publication retain their existing gates. Historical capture and complete
reader-closure flags remain false, and immutable published artifacts are
preserved.
