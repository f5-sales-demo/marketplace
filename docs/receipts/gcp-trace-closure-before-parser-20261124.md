# Original output closure before failed parser coverage

Issue: #1559. Delivery PR: #1698, still draft. This receipt qualifies source
closure behavior; installation, ordinary Ubuntu `bun dev`, live GCP behavior
and publication remain separate unfinished gates.

## Failure and repair

The real native startup test used the original compiled invocation and qualified
Terraform/provider bytes, then deliberately refused submission. Final capture
retained `submitted: false` and `originalGroupClosed: false`. The trace parser
refused with `Original UI descriptor completion differs` before acknowledging
the output issuer's later independent closure proof. The controller consequently
refused cleanup, and the factory could not expose its reader-group inputs.

The failing-first native accessor test reproduced this gap. Trace final capture
now verifies and retains the original output closure and bindings before parser
completion checks. Parser refusal, incomplete capture, original snapshots and
historical locks remain unchanged. The repair grants no apply authority.

## Verified source behavior

- The pinned native startup case passes 37 assertions. Its durable source set
  covers all 29 declared sources, including the two actual spawned readers.
- Concurrent and repeated runtime retention preserves one immutable handoff.
  Both readers retain `captureComplete: false`; final capture remains failed.
- Independent review verifies 178 archived files and hashes, original immutable
  handoff binding, three physical process-group absences and the unchanged
  initial false parent-closure snapshot. No signals or cloud apply were used.
- The focused committed regression checks early closure and copied-callback
  refusals, independent output proof and retained UI/capture failure.
- All 59 trace/controller/factory/retention/cleanup cases pass with 473
  assertions. Strict Terraform types, warning-clean configured formatting and
  the normal generated runtime build pass.

The fixture optionally copies pinned native software bytes and rejects mismatched
hashes. Its default symbolic inputs still fail native identity checks. Private
test archive limits include the 140,648,610-byte Google provider: 256 MiB per
file and 512 MiB total, with ownership and stability checks preserved. Guest
command, log, deadline and freshness limits are unchanged.

## Remaining acceptance

The complete factory remains an inactive source draft. Actual before/final
GCP guest capture, durable cloud cleanup admission, ADC and same-original Google
provider renewal across expiry, supported installation and ordinary registered
tools, all requested GCP lifecycle/network/traffic/recovery campaigns,
CI/review/merge, publication and published installation remain unfinished.
No GCP apply was submitted during this qualification.
