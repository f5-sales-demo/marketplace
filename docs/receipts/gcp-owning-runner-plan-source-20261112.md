# GCP owning runner plan source qualification

Issue: #1559. Delivery: draft PR #1698.

The Terraform runner now provides an opt-in original plan source during its one
saved-plan apply invocation. Capture reads a frozen projection through that same
issuer rather than starting another Terraform inspection while the runner is
busy. The projection binds the deployment scope, version, receipt and reviewed
resource inventory to monitored original plan, configuration, lock and manifest
files. It exposes selected nonsensitive identity scalars and distinguishes known,
unknown and unavailable values; it exports no raw state, bootstrap or token data.

The source and its returned projection use the issuer's private object registry.
JSON, copies, proxies, foreign scopes and retired invocations cannot replace them.
The installed capture handoff permanently refuses a counterfeit view. Reads retain
the original context's deadline and input guards. Retirement ends read authority;
it does not establish executor or reader group closure.

The shared service freezes the selected source policy and passes it to its own
runner. The installed Terraform 1.17.2 path transports the original source into
capture preparation before the single executor starts. This resolves runtime
selection preceding runner construction without creating a second runner or a
private state adapter. Legacy execution retains its opt-out behavior.

A pre-existing caller-mutation race was reproduced against the unchanged prior
source: modifying the caller's receipt during apply changed the persisted receipt.
The runner now clones the receipt at entry. The same regression passes against
the repaired source. Source tests also cover input mutation and restoration,
identical-byte replacement, sensitivity, malformed unknown markers, scope changes,
compiler transport, overlap, counterfeit handoff and failure retirement.

Three native typechecks and runtime builds pass. Source qualification does not
establish normal installed tool execution or live GCP acceptance. The observer
intent, owned 21-resource inventory and teardown must be connected to the public
path, followed by a genuine default installed capture controller and live guest,
networking, lifecycle and content-verified recovery qualification. Required review,
current-head CI, merge, publication and published installation remain separate gates.

Terraform source version is 2.4.84; GCloud is 1.7.49. Historical receipts, failed
captures, unresolved locks and immutable v12.3.1 assets remain preserved.
