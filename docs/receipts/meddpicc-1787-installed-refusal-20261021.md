# MEDDPICC 7.8.2 installed corrective-command qualification

Campaign #1579, child #1586, receipt delivery #1787.

## Publication and installation

Repair PR #1776 is independently confirmed MERGED with all four required
checks successful. Immutable tag `meddpicc/v7.8.2` resolves to source
`07ac50f83601855c0b2942e2ff96d2b87a818476`.
Independent Mac and Ubuntu downloads have archive SHA256
`0ccc4aabdad9b10d898e7e8c94aa0de6fad5c868f9b5baf8438f71b72813cd8c`.
All 100 shipped files match source and archive on both hosts. Normal plugin
upgrade installed 7.8.2 on each host; all 100 installed files match the archive.

Qualification runtime resolves separately to
`~/.xcsh/qualification/23.9.5/bin/xcsh`; Mac SHA256 is
`0aa0e26857d81bf1fa565ea5bde6c5ead5ae101e96cad91a4adc35d2f7b9136e`,
Ubuntu SHA256 is
`be6ea45f40f20d36fcad3b1b9aac4763e75720a137f3a974b3779082ae2d0ac2`.
Default runtime remains 23.9.3 and discovery remains 23.8.0.
Mac and Ubuntu are supported; Excel acceptance remains separate.

## Direct installed execution

A synthetic copy of the shipped example reintroduced twelve retired field
names. Its filename contains a space, apostrophe, dollar substitution,
punctuation and Unicode. Fixture SHA256:
`5842f0820eccc0dcdfe4c082d0e34039a776a305e4d2662ccb21ab5d2d1bc715`.
The direct installed `engine/cli.ts` ran under the resolved Bun executable:
Mac `/private/tmp/gcp-bun-142/bun-darwin-aarch64/bun`, Ubuntu
`/home/robin/.local/share/shell-tools/20261012/bin/bun`.

On both hosts `validate`, `next` and `score` exited one, reported `ok: false`
and twelve legacy fields, and preserved the fixture bytes. Each refusal
contained a complete executable migration suggestion. A harmless argument
recorder prefixed the entire displayed command, so the suggestion became
recorder arguments and no migration ran. Bash and Zsh each reconstructed
exactly five arguments: resolved Bun, exact installed CLI, `migrate`, full
synthetic deal path and `--apply`. All six per-host recorder cases passed
and fixture bytes remained unchanged.

A separate synthetic conflict populated both old and current field names.
Installed validation exited one, required manual resolution, omitted apply
advice and preserved its bytes. No real deal or CRM mutation occurred.
The first Ubuntu probe assumed an absent `/home/robin/.local/bin/bun` and
failed before engine execution. Its root is preserved. The successful probe
uses the independently resolved installed executable in a fresh root.

## Evidence limits and next actions

This is direct installed CLI and shell reconstruction evidence. It does not
establish model tool selection, shipped command/skill execution, xcsh native
framing, complete guidance fidelity, pagination or Excel acceptance.
Historical 7.8.1 receipts remain preserved for their historical version.
Only immutable merge/artifact and installed-host provenance gates are restored.

Next actions: execute narrowly guarded installed workflows through the runtime;
qualify remaining complete guidance ranges and every appearance combination;
verify outcome and lifecycle variants; perform explicitly required supported-host
Excel acceptance separately. Account-dependent work remains deferred.
Child #1586 and umbrella #1579 remain open.

Private evidence roots are named
`meddpicc1787-independent-{mac,ubuntu}-20261021` and
`meddpicc1787-installed-refusal-{mac,ubuntu}-20261021` (successful Ubuntu root
has suffix `-resolved`). Raw outputs and failed attempts remain private.
Repair worktree #1775 was retired on both hosts only after independent merged
and green-check confirmation. Its Git history and Ubuntu ignored files were
archived privately before removal. Receipt delivery worktree #1787 remains
owned and active until its PR is merged.
