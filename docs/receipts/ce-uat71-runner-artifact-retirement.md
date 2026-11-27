# CE UAT71 runner artifact retirement

Teardown retained sensitive configuration, binary plans, local state and revision archives because authorized resume depended on those inputs. The owning
Terraform service now exposes an internal terminal retirement operation. It requires the exact final saved no-change plan, unchanged owner/configuration/provider
bindings, complete empty planned values and current local state without resources or outputs. The supplied cloud/F5 absence evidence digest is a separate
caller obligation; the runner does not claim cloud cleanup from local state.

Before removing any file, retirement persists an immutable manifest/plan/evidence-bound inventory and a permanent execution barrier. It removes recorded files,
links and directories without recursive deletion or following links. A resumed operation accepts only remaining unchanged inventory entries and the same evidence.
Unexpected or substituted artifacts fail closed. The owner manifest and nonsensitive retirement receipt remain; normal execution and configuration access reject
retirement even after restart. Owned directory identity is checked before and after acquiring the process lock.

Tests were written first and failed before implementation. A further directory-substitution test reproduced deletion through a substituted deployment-directory
link; explicit directory identity checks repair that failure. Regression coverage includes populated or malformed state, planned resources, outputs, changed
plans, unresolved evidence, hard links, outside links, pre-aborted requests and partially removed inventories. The initial failures are retained privately.

Source execution with real Terraform 1.16.6 retires an unapplied builtin-resource configuration and its archives after a refreshed empty no-change plan, resumes
terminal cleanup and rejects late execution. This is a local diagnostic: no cloud resource, F5 object or bootstrap token is created. Installed archive consumption
and full cloud/F5 teardown integration require their own receipts. Partial registration ownership/deletion, parent deployment-store sensitive journals, cloud/F5
absence, the failed 45000 ms recovery criterion and full CE UAT acceptance remain open.
