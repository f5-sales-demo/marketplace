# GCP bootstrap handoff after a before-read expiry

Issue #1559 remains incomplete. This receipt qualifies the bootstrap VM source
boundary using offline native fixtures, without submitting GCP infrastructure.

Attempt 1221 reproduced a failed before-phase read permanently preventing the
fresh final bootstrap/VM handoff. The original controller now distinguishes
only its own input-verified operation expiry by actual error identity, owning
context and callback nonce. Error names, messages and copied callbacks cannot
issue that classification. Invalid clock values and other errors retain their
existing refusal behavior.

An expired before reference remains refused. A final handoff can independently
verify fresh Site/Token bodies and the original VM, token, executor, inputs and
unchanged after reserve. Its view carries `originalBeforeReadExpired` so the
prior failed read is not erased. Input and ownership failures remain permanent;
this classification grants no execution, guest acceptance or renewed budget.

Attempt 1222 passes the actual expired-before case with 15 assertions. Attempt
1225 passes 87 bootstrap, controller, executor, input and cleanup cases with
479 assertions across nine files. Normal runtime regeneration, strict Terraform
types and 25 compiled installation/source cases with 68 assertions pass.
Attempt 1228 independently verifies 834 retained files across six archives
against their hashes, sizes and private file properties.

Complete source factory composition and expiry behavior in the remaining VM,
reader, access and guest stages remain open. Realistic inventory throughput,
supported installation and ordinary Ubuntu `bun dev`, original-provider refresh,
all live lifecycle/networking/traffic/recovery/cleanup gates, current CI/review
and qualified publication/installation remain separate requirements.
