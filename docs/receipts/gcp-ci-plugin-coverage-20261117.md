# GCP CI coverage and capture fixture repair

Issue: <https://github.com/f5-sales-demo/marketplace/issues/1559>.
Delivery remains draft <https://github.com/f5-sales-demo/marketplace/pull/1698>.

Run 44172827794 at `618bfd8db6dc71d434cad498b8b5764083ea8a23` failed
with 811 passing Terraform cases, three failures and one asynchronous error.
Its raw private log is retained by SHA256
`d0b7f8c31bb0fd3b70b7caa878ca09ee8cddc1fd9909197e44d56690a2466ae5`.
The failures were SSH/trust fixture timeouts and the HA inventory test's default
five-second framework timeout. Their underlying execution delays remain unproven.

The preceding normal step passed but ran no Terraform suite. Its driver selected
only plugins having shell-test wrappers, silently omitting Bun-only plugins.
The driver now selects every plugin with shell or Bun tests. Failed Bun-only
suites propagate a failing exit status, and existing frozen dependency checks
and real-cloud-CLI exclusion remain enforced.

The isolation diagnostic now records known CLI executable names without arguments.
It reports observed stub calls independently of failed suites. A failed suite
alone cannot establish that a cloud CLI was invoked. The production stub timing
remains eight seconds; the attribution fixture uses zero seconds explicitly.

Framework timeouts now permit initial inventory, each existing bounded native
command, and the independent final capture. The SSH fixture allows three commands
and the trust fixture two. HA inventory has an explicit integration-test timeout.
Production command, startup, freshness, final-capture and recovery limits remain
unchanged. The prior CI log's dangling-process termination and later missing-root
error do not qualify natural executor closure or guest evidence.

Failing-first driver and attribution regressions pass. ShellCheck, shell formatting
and three TypeScript test bundles pass. Final Linux execution, complete source
gates and fresh current-head CI remain required before accepting this repair.
The separate observer renewal work, original GCP capture, installed Ubuntu runtime,
lifecycle/network/traffic/cleanup acceptance, review, merge and publication remain
unfinished. Historical evidence, unresolved locks and v12.3.1 remain preserved.
