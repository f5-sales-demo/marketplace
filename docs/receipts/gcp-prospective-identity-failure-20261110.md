# GCP prospective identity failure evidence

Issue 1559 remains incomplete. An unavailable actor now retains the exact kernel
read that caused refusal: PID, raw stat bytes, observed state, UID and monotonic
capture time. This immutable private snapshot is explicitly unqualified. The
prospective provider acquisition retains it before retiring the reader, without
issuing a process or FIFO witness. Identity and persistence failures both survive.
Existing stopped, replaced, ambiguous and incomplete-capture refusals remain.

Failing-first tests observed the missing failure type and missing acquisition
receipt. Synthetic stopped-state reads require no process signals. All 63 related
Python process/FIFO/guest tests, Ruff, Mypy and configured Pylint pass. Shared suites
pass 1,115 tests and 5,095 assertions; the serialized root/canonical suite passes
164 tests and 5,471 assertions. All three native typechecks, runtime builds,
dependency and manifest checks pass. Historical profiles, collectors and failed
receipts remain unchanged.

After independently rechecking the preceding failed campaign's cleanup, one fresh
source-read fixture used the changed reader and Terraform1.17.1/Google8.10.0/
xcsh15.15.7 with Bun1.4.4. It retained 9,709 records, two providers, six RPCs and the
same original Google provider/FIFO across two windows. Source query/page/body
checks, no-change planning, typed teardown, empty destroy and two non-submitting
resumes passed. Independent verification found 28 process groups absent and stable
empty state. No managed cloud resource changed.

| Private evidence | SHA-256 |
| --- | --- |
| Changed source-read receipt | `207800ea54e385d424ee89b56a9d50e29602ebec567f3b2b3254b3c11ca469c2` |
| Independent cleanup | `b51e436f5c0f85fc5fd51af45f068c31c569a251d55f5fdb79513cda1298091d` |

The preceding capture remains failed. This passing run does not establish that
initial schema-provider lifetime transitions are qualified, nor does its
55-second duration prove credential expiry. Original source/RPC/provider lifetime,
current reason-bound audit attribution, Platform bootstrap ownership and the full
default installed capture factory remain required. Every native/Terraform live CE,
network, lifecycle, traffic, restoration, ordinary installed Ubuntu runtime,
review, publication and installed release gate remains open.
