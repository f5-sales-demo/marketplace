# GCP CI fixture clock isolation

Issue: <https://github.com/f5-sales-demo/marketplace/issues/1559>.
Delivery: draft <https://github.com/f5-sales-demo/marketplace/pull/1698>.

The resumed full normal suite retained failures in KVM, Platform and Terraform.
KVM's qualification environment lacked PyYAML. A new isolated Python environment
with PyYAML 6.0.3, psutil 7.2.2 and pytest 8.4.2 passes its seven checks without
changing KVM source or historical environments.

Platform's repeated placement collection exceeded Bun's five-second default
test timeout. Both complete-placement tests now declare 60-second framework
budgets. Explicit fixture guards also replace unchecked node and token paths.
The focused owned-placement suite passes 27 tests with 147 assertions.

Terraform's process-wide synthetic clock could expire the independent original
executor during an awaited inventory read, then move behind its already-started
final reserve when restored. A fixture-only asynchronous clock scopes each shift
to that observation. Concurrent, nested and rejected shifts retain their own
clock; independent execution keeps the original clock. Original retirement and
budget assertions remain in place. Six focused clock and baseline tests pass
with 42 assertions; the failing-first and resumed failures are retained privately.

Candidate versions are Terraform 2.4.131, Platform 6.3.28 and GCloud 1.7.56.
The complete normal plugin suites and full CLI isolation pass, each including
816 Terraform tests and 4296 assertions. Six recording cloud CLI stubs received
zero calls. Both runs retain unchanged source and dependency bindings. Catalog,
tracker, three family typechecks, staged privacy and configured hooks pass.
Current-head GitHub CI and required review remain independent gates.

The qualification environment keeps ordinary Python on PATH and the complete
isolated fixture packages on PYTHONPATH. Putting a copied virtualenv interpreter
first broke standard-library lookup after PATH sanitization; the failure and
its independent reproduction remain retained. All affected shell and Bun suites
pass without unrelated plugin source changes.

Production command, startup, observation, freshness, operation and final-capture
limits are unchanged. These fixtures establish no live GCP, original provider
refresh, guest access or installed runtime acceptance. The default capture
factory, original live lifecycle/networking/traffic/recovery scope, independent
cleanup, ordinary installed Ubuntu `bun dev`, CI/review, publication and verified
installation remain open. Frozen collectors, failed evidence, historical locks
and immutable v12.3.1 remain preserved.
