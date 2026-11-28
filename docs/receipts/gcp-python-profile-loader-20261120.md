# Python profile-reader test loading

Issue: <https://github.com/f5-sales-demo/marketplace/issues/1559>.
Draft delivery: <https://github.com/f5-sales-demo/marketplace/pull/1698>.

The current capture-profile test used `importlib` to execute the shipped Google
reader without registering its module in `sys.modules`. Python 3.12 dataclass
initialization then failed before profile selection. The CI job reported 838
passing Terraform tests and this one failing case. Local Python 3.15 had passed
the same helper. The original CI log and both interpreter results are retained.

The test loader now registers the module before execution, following ordinary
Python import behavior. The unchanged shipped reader still verifies exact
executable pairs and refuses mixed pins. The failing-first reproduction on
Python 3.12.3 now passes; the same four cases also pass on Python 3.15.
The source repair retains all runtime, capture and publication holds.

Terraform is 2.4.137. GCloud and Platform remain 1.7.62 and 6.3.30. New-head CI,
current installed runtime, original guest capture and every remaining live and
delivery acceptance gate stay separate. No cloud apply was submitted.
