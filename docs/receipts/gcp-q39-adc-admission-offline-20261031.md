# GCP q39 ADC input admission

Issue: #1559. Attempt: 311. Full issue acceptance remains incomplete.

A private schema-two successor binds the reviewed authorized-user ADC file,
its original private path and bytes, verified client audience and exact
credential environment. It retains the frozen q39 configuration, provider lock,
21-resource create scope, single reviewed saved plan, engine identity,
five-minute evidence freshness and XCSH lifetime requirements. The existing
access-token admission component remains unchanged.

ADC parsing refuses duplicate keys, unsupported credential mappings, invalid
UTF-8, malformed strings and trailing data. Foreign account, token endpoint,
Google universe or quota project values refuse. Environment overrides,
credential rotation and changed private evidence invalidate admission.

The combined regression run passed 19 tests with 101 assertions. After the
parser lint repair, the final successor run passed 11 tests with 54 assertions.
Strict typecheck, bundle and configured source lint passed. The initial missing
module and ambiguous-field acceptance failures remain preserved.

For an operation longer than the currently verified Google token lifetime,
admission requires separately reviewed qualification of refresh during long
execution. Synthetic fixtures test that rule; they do not qualify the live
refresh gate. XCSH credentials must still cover the entire operation and the
separate five-minute final capture window. Short command admission never
silently admits a long apply.

This component exposes no executor and enables no cloud consumer. Trusted
production snapshot creation, long refresh qualification, exact Platform and
provider workspace joins, the production bridge and campaign guard remain
open. Installed runtime, live lifecycle, guest, networking, traffic, recovery,
cleanup, review and publication retain their existing gates. PR #1698 remains
draft; historical capture and reader closure flags remain false.
