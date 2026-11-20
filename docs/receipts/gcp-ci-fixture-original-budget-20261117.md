# Original-budget apply fixture CI repair

Issue: <https://github.com/f5-sales-demo/marketplace/issues/1559>.
Delivery remains draft PR <https://github.com/f5-sales-demo/marketplace/pull/1698>.

The CLI-isolation pass on source 20c963a9 failed six Terraform cases.
Its diagnostic reports any failed plugin suite as non-hermetic; it does
not independently prove that a cloud CLI was called.

The synthetic apply parent had a separate 30- or 60-second timer.
A failing-first callback delayed for 31 seconds found the original process
absent while its controller retained the original two-hour budget.
The fixture now uses that same original kernel-clock deadline and its
explicit completion marker. Production command, startup, freshness,
observation and final-capture limits are unchanged.

A separate checkout of the committed PR head passes the delayed-parent
regression and strict typecheck. All sixteen campaign-key, host-trust and
initial-inventory cases pass under the same eight-second recording CLI
stubs, with zero stub calls. Native process identity and original deadlines
remain checked.

The full failed CI log and original fixture are preserved privately.
Fresh current-head CI remains required. This fixture check establishes no
GCP guest, installed runtime, networking, lifecycle or traffic acceptance.
All remaining issue 1559 gates and publication holds remain open.
