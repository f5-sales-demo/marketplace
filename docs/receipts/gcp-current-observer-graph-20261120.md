# Current GCP observer configuration mapping

Issue: <https://github.com/f5-sales-demo/marketplace/issues/1559>.
Draft delivery: <https://github.com/f5-sales-demo/marketplace/pull/1698>.

Recorded artifact profiles recognized Terraform 1.17.2, Google 8.12.0 and
XC 15.17.6, but the observer graph and request-reason validators still refused
that exact tuple. Current source renders the nonexecutable 21-resource graph
and preserves its original request correlation. Historical tuples remain
resolvable; mixed or unknown versions and altered correlation inputs refuse.

Two new tests failed first on those guards. Sixteen focused cases and 117
assertions pass. The existing negative case now rejects unqualified 8.12.1;
the new cases explicitly verify current 8.12.0 and wrong-tuple refusal.
All GCloud, Terraform and Platform suites and three typechecks pass. A separate
compiled graph preserves 18 CE and three observer resources. Normal registry
initialization and actual provider schema validation pass with the unchanged
lock SHA256 f77a17ac8bfb5a808da63d887e8427c8663a460600174842e9b534dabf4419a5.

The original shared-suite wrapper supplied an unused Python variable and failed
on missing fixture prerequisites. That run is retained. The corrected run uses
the existing verified CE_TEST_PYTHON environment with Python 3.15.0, psutil 7.2.2
and pytest 8.4.2. No test or failure was hidden or bypassed.

The graph retains the pinned Ubuntu observer image, separate disk, no service
account, narrowly scoped SSH firewall, distinct campaign keys and token-only
CE bootstrap. Public creation selection and admission retain their live hold.
No cloud plan or apply was submitted. Positive original guest access, complete
attributed capture, V2/callback/default factory, all native/Terraform lifecycle
and networking, traffic/recovery/restoration/cleanup and final publication and
installed acceptance remain open. Immutable v12.3.1 is unchanged.
