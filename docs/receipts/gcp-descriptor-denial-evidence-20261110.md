# GCP denied descriptor evidence

Issue: #1559. Delivery: draft PR #1698.

The prior live descriptor failure retained an initial prospective kernel snapshot
and a generic permission failure. It did not establish the actor's state when
access was denied. That historical failure remains unqualified.

The reader now preserves the original permission error as the cause of a typed
failure. Private evidence records the exact descriptor, errno and filename,
inspection and diagnostic timestamps, and a later kernel snapshot or its
unavailability. The state at denial remains explicitly unknown. Later readable
metadata cannot qualify the failed descriptor, a replacement process or capture.

The monitor retires without issuing a capability. Diagnostic persistence failure
retains both the original denied read and the persistence error. No denied read
is retried, and no privilege or permission control changes.

Verification: three failing-first regression tests; all 52 Python process and
reader tests pass under Python 3.12; 71 related Python tests pass under Python
3.15. All 1,325 shared and canonical tests pass with 33,889 assertions. Ruff,
Mypy, configured Pylint (10.00), three native typechecks, three runtime builds,
dependency checks and manifest validation pass. The supported tracker update
preserves 2,678 tasks, 315 surfaces, 22 plugins and their historical receipts.

Fresh live descriptor evidence, original provider lifetime, token refresh,
complete installed capture and every remaining live and delivery gate remain
open.
