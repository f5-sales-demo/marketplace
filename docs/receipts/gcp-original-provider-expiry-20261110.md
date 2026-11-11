# GCP original provider expiry and independent cleanup

Issue: #1559. Delivery: draft PR #1698. Evidence: attempts 444 through 448.

The original Google 8.11.0 provider supplied a fresh, distinct access token after
the original token's server-derived conservative expiry bound. Independent review
verified the retained raw before/after responses, unchanged principal and audience,
and the same original provider executable, process identity and executor group.
The original token lifetime was 3,595 seconds. Eighty retained identity rounds
had a maximum gap of 45,976 milliseconds. The original two-hour budget remained
unchanged throughout observation and cleanup.

Independent cleanup reviewed the saved destroy plan before its single submission.
Exactly three owned local `terraform_data` resources were deleted. There were zero
managed GCP resources and zero CE VMs in this campaign. Actual no-change planning,
three applied-state absences, empty destroy and stable empty state passed.
Two resumes made zero submissions. Sixty-one independent original identity and
group closure checks passed; the original archive remained unchanged and no new
executor lock remained. No campaign resource cleanup is outstanding.

The expiry review retains its original `cleanupVerified: false` observation.
The later independent final cleanup receipt records `cleanupVerified: true` and
binds that original expiry receipt. Historical failed flags, collectors, executors,
locks and immutable v12.3.1 artifacts remain preserved.

Private receipt SHA256 values:

- Expiry review: `418633201632624946b8bde09fb0c9b2db01e0b36ab744e75db3da7affdae21b`.
- Final cleanup: `14ff732128fd26408cbc48fe7e13382c5828dbecb2e857a10c741562e0358f6f`.

This evidence qualifies actual expiry through the original provider and local
cleanup. Managed VM insertion, bootstrap joins, complete guest capture, ordinary
installed runtime and full native/Terraform lifecycle and networking acceptance
remain unqualified. Required review, passing CI, merge, qualified publication and
verified published installation remain open. Credentials, state and raw transcripts
remain private. Full issue #1559 remains incomplete.
