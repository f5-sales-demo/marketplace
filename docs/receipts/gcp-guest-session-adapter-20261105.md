# Original-bound GCP guest session adapter

Issue: [marketplace #1559](https://github.com/f5-sales-demo/marketplace/issues/1559).
Attempt: 393. This receipt qualifies source and local SSH transport components.
Full issue acceptance remains incomplete.

## Implementation

Terraform now includes a source-owned guest-session adapter and the qualified
PTY transport. The adapter checks original VM, token and NIC bindings, private
SSH input identities and independent observer and CE serial trust before commands.
It checks token expiry again after ownership and trust reads.

Command dispatch requires fresh completion from the same session and exact
command scope. Container inspection and logs require an unambiguous ID from
that original node's fresh listing. Malformed rows refuse capture. Log options
require their own completion evidence; full bounded log windows remain incomplete.

Command bytes, responses and hashes are retained privately before final
verification. Ownership changes preserve the failed capture. Completion clearing
spends the original command budget. SSH protocol closure and natural exit precede
independent process-group absence checks and descriptor release.

## Verification

| Check | Result |
| --- | --- |
| Failing-first regressions | Missing adapter, completion clearing, malformed listings and token expiry during ownership reads reproduced |
| Focused adapter and PTY regressions | 29 tests covered by the shared Python run |
| Shared Python regressions | 58 passed |
| Shared TypeScript regressions | 830 passed, 4,379 assertions, Bun 1.4.2 |
| Source Ruff and strict mypy | Passed with the existing policy and qualified development type stubs |
| Fresh local SSH sessions | Ed25519 logout, protocol disconnect and RSA host keys passed |
| Independent local process-group absence | Verified for each SSH fixture's original client, server and broker |

The transport retains its two previously reviewed, narrow validated-execution
annotations. The repository lint policy and actual runtime SDK are unchanged.
Shared tests include their existing disposable process-termination fixture;
their success is not evidence of a signal-free production executor.

The first shared TypeScript run selected ambient Bun 1.4.3. The preserved
Bun 1.4.2 binary was independently hashed and selected for qualification.
A launcher path failure and a later unexplained launcher exit remain retained.
No SSH fixture scope or matching actor survived the interrupted launch. Fresh
direct launches produced separate attributed receipts and absence evidence.

## Remaining acceptance

The guest adapter was tested with offline transport doubles. The real SSH proofs
exercise the shipped PTY against disposable local fixtures. Neither proves GCP
guest access, VM serial trust, bootstrap journals, CE health or traffic.

The original cloud and serial controller is still absent from the default installed
factory, and GCP Terraform apply remains refused before plan consumption. Wiring
and qualifying that controller must retain the original runtime inputs, provider
identities, execution budget, final capture reserve and ownership joins.

Fresh reviewed campaigns, complete guest capture, operational and traffic evidence,
typed cleanup, ordinary Ubuntu `bun dev`, the remaining lifecycle and networking
matrix, review, CI, publication and published installation remain open.
Historical evidence, executor claims and immutable v12.3.1 assets remain preserved.
