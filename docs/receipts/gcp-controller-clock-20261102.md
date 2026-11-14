# GCP refresh controller clock and claim qualification

Issue: <https://github.com/f5-sales-demo/marketplace/issues/1559>. Draft PR:
<https://github.com/f5-sales-demo/marketplace/pull/1698>.

Attempt 316 repairs the canonical presentation fingerprints after the Terraform 2.4.5 source
change. Supported reconciliation reopened 59 gates while preserving all historical evidence,
receipts and retired rows. Thirty-seven focused tests passed with 22,514 assertions. Hooks,
secret detection and both staged privacy modes passed. The repair and pending capture receipts
were delivered through verified Ubuntu SSH at `6daa10fbaf997a969bc0e86de8c75eec56c7d2c9`.
All 23 reported CI checks completed without failures; expected skipped checks remain recorded.

Attempt 317 qualifies a private clock bridge and a successor to the short-lived claim helper.
It binds Python system-monotonic samples to the original boot, interpreter bytes, probe bytes
and nonce. Bounded Bun observations provide conservative system-clock estimates. Deadline
admission uses the upper estimate. Repeated samples corroborate the original clock origin;
changed identities, reversed clocks and divergent samples refuse without retry.

The two-hour operation and five-minute final reserve retain their original start. Delayed
completion cannot extend either deadline. A final transition is single-use and cannot reopen
the operation. Nineteen clock tests passed with 34 assertions, followed by strict type checking
and configured TypeScript and Python lint checks.

The frozen helper's twenty-second timeout failed the new live lifetime test as expected. Its
failure, original claim and independent group-absence evidence remain private and preserved.
The successor retains the shared Platform claim through the original fixed budget. Its final
48-second local test captured initial, periodic and final system-clock observations. Independent
reviews confirmed both original process groups absent before releasing the successful claim.
The helper checks the original final deadline again immediately before release.

These executions used disposable local Python processes. No Google provider or CE guest ran,
and no cloud resource was submitted. The actual original-budget controller, callback-context
integration, fresh reviewed local plan, real token verification across expiry and local-state
cleanup remain open. Full GCP lifecycle and traffic acceptance, review, publication and published
installed acceptance remain open. Ordinary `bun dev` stays on Ubuntu; frozen collectors,
historical failed capture flags and immutable v12.3.1 assets remain unchanged.
