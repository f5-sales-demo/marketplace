# GCP process-completion offline qualification

Attempt 215 qualifies a separate private transport for bounded natural
completion of an original read-only process group. It provides no live GCP
guest acceptance and does not change [q27's failure receipt](gcp-q27-disposable-diagnostic-20261025.md).
At this historical stage, four campaigns had been submitted under the then-current
cap. The user subsequently removed the numerical campaign cap; the
[current acceptance matrix](gcp-issue-1559-acceptance.md) governs continuation.

## Documented behavior and implementation

Python's [subprocess contract](https://docs.python.org/3.15/library/subprocess.html)
describes completion of the child process. Reaping that child does not prove
that its entire process group has terminated. [POSIX signal zero](https://pubs.opengroup.org/onlinepubs/9799919799/functions/kill.html)
checks existence and permission without delivering a signal; permission denial
does not prove absence.

The new transport observes natural group completion for at most 500 milliseconds
within the original command deadline. It requires a valid captured original
identity and brackets group probes with current identity checks. A reused PID,
missing original identity, failed lookup, permission failure or interruption
retains an incomplete result and private partial output. The native identity
reader bounds its existing sysctl wait by the remaining budget. No command is
replayed to obtain completion.

Verified termination remains separate: the existing five-second closure budget,
one absence probe and zero natural grace. Closure can resolve a child barrier;
it cannot reset the command deadline or accept late output.

## Retained verification

Failing-first runs retained three failures and four errors, then three failures
and six errors after fixture refinement. The original 38 focused cases passed.
Their exact test source is retained separately from the subsequent removal of
one unused test import. The final full suite covers those cases with unchanged
current inputs: 464 tests, zero failures, zero errors and zero skips in
759.976 seconds. The actual Python/Bun bridge passed 44 tests with 241 assertions.

All 91 Python sources compiled. Selected Ruff checks retain 121 findings from
the initial 122-finding baseline and introduce none. This is not a full fleet
lint pass; the wider auxiliary-host-tool findings remain private. Python 3.15.0
launched Markdownlint-cli2 0.24.0 successfully. The final authored scan covered
130 files with zero secrets. Its six unchanged required private route/path
findings remain enforcement failures, separately reviewed for private use;
they grant no Git or public-content acceptance and were not suppressed.

Independent byte verification retained all 24,324 sealed q27 files, 673 original
launcher inputs, 21,359 earlier q26 files, 92 trust files, 485 qualified plugin
files and 3,989 installed-evidence files. The final attempt 215 seal contains
20,152 files and zero symlinks. No cloud submission, guest command, model call,
runtime update, GitHub mutation or publication occurred in this attempt.

The successor bindings are:

- Transport SHA256: `31cae170fa011cdc56eb31e6ddfd389a3712d6d40a06f79be239f2db009e8ced`.
- Identity reader SHA256: `7348dc0c7e2b3ed817ecc925db2c47d13ae32b5e187fe2433062391a61af1a89`.
- Qualification receipt SHA256: `a772a0550483b95d66b34a7c26b4394d59997bb0ed940b71c5286b954e420e77`.
- Sealed checkpoint SHA256: `c5c0cefe6353d7c2ae2b0612b711960e39c9a1bc047336e2a55abebd4baabfd2`.

## Remaining gates

Successor campaign preparation and submission continue within the existing task
authorization. Its consumer graph, source/executable pins, original identities,
current prerequisites and fresh 21-resource plan still need independent review.
Both GCP guest mapping holds, operational health, content traffic, broader
lifecycle and recovery, review, merge, publication and published installation
remain open. Frozen collectors, q27, q12 and v12.3.1 remain preserved.
