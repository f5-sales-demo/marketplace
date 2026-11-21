# CE UAT69 lifecycle terminal exclusion

Public AWS Terraform upgrade, failover and whole-site power could reach runtime/provider services after retirement began. They now acquire the same owner-bound
lifecycle lock used by deployment and teardown, then reject retirement or in-progress F5 cancellation before runtime/provider access. The lock covers
preparation and execution through checkpoint persistence; native lifecycle paths retain their own behavior.

Source tests preserve upgrade/failover/power behavior and exercise malformed retirement markers, cancellation markers and competing lock ownership. The initial
upgrade rejection tests failed because runtime access occurred before retirement checking. Those failures and a corrected failover test parameter fixture remain
private. Full suite: 1977 tests / 11916 assertions; AWS compiler passed.

Exact archive and installed public-tool checks are recorded separately. This correction does not qualify live lifecycle recovery, partial physical registration
retirement or full CE acceptance. Supported SLI control and freshness, six-interface up/down/up, complete live matrix, producer qualification before repin,
independent cleanup and fleet convergence remain open. Recovery212977 ms versus45000 ms remains failed. Readiness remains false, 288 required rows / 300
blockers. PR1565 stays draft; normal publication requires explicit UAT acceptance.
