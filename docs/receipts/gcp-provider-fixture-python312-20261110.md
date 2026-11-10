# GCP provider fixture compatibility

Issue: #1559. Delivery: draft PR #1698.

The provider regression fixture loaded its reader with `exec_module` without
first registering the module in `sys.modules`. Python 3.12 failed while
processing the reader's dataclasses; the same fixture passed under Python 3.15.
Both fixture entry paths now register their module before execution.

The Bun wrapper reports only validated test file and function names on failure,
including class-based cases and teardown errors. Raw Python output remains in
private logs. The existing success assertion and capture requirements remain.

Verification:

- Failing first: Python 3.12 produced two failed tests and two teardown errors;
  the original fixture child identified the missing module registration.
- Fixed: all 363 Terraform tests pass with Python 3.12, the CI-pinned Python
  dependencies, and sleeping cloud CLI stubs.
- All 49 focused Python process and reader regressions pass under Python 3.15.
- Ruff, Mypy, configured Pylint (10.00), Biome and native Terraform typecheck pass.
- Current stable releases verified: Terraform 1.17.1, Google and Google Beta
  providers 8.10.0, and xcsh provider 15.15.7.

This receipt qualifies the fixture repair. Live provider descriptor access,
lifetime, token refresh, complete GCP lifecycle acceptance and publication
remain open.
