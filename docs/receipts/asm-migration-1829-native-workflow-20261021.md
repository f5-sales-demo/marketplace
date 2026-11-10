# ASM Migration stable native workflow qualification

Campaign #1579, child #1600, receipt issue #1829. This receipt preserves an
actual failed Ubuntu workflow and fresh artifact checks. It does not establish
successful conversion, complete workflow acceptance or deployment readiness.

## Artifact and runtime binding

The immutable `asm-migration/v2.3.2` tag still resolves to
`d659e5d74e3b424e35b62a6ea85b116029a0631b`. Fresh independent downloads on Mac
and Ubuntu have SHA-256
`930f0362de6f7dff9f83c9a3df54a4e94be78c1a90ae5c84710ab8def261ffa7`.
All 41 tracked plugin files match that archive, Git source and each host's actual
installed registry path. Both installed manifests report 2.3.2.

The generated GitHub archive digest differs from the historical #1726 download
(`cd3b3d2fecd2d83d50cc3f5258dcf9169f23cca4c2cd60c3c7a13a3f8425f44e`).
The historical receipt and both fresh failed digest checks remain preserved.
The tagged source and all plugin file contents match; the new archive digest is
recorded separately rather than substituted into the historical receipt.

Both hosts use the version-scoped published xcsh 23.9.5 binary. Its immutable
source is `3fc47cd286894e4a73e06fc0259ff98601b8a68f`. Fresh release provenance
was verified against its asset digest; runtime #5040 is an ancestor. Binary
SHA-256 values are:

- Mac: `0aa0e26857d81bf1fa565ea5bde6c5ead5ae101e96cad91a4adc35d2f7b9136e`.
- Ubuntu: `be6ea45f40f20d36fcad3b1b9aac4763e75720a137f3a974b3779082ae2d0ac2`.

The normal runtime and discovery lane remain unchanged. Historical #1729
synthetic rendering and #1733 directly imported module evidence remain separate.

## Actual failed Ubuntu execution

The guarded observer loaded the installed entrypoint and native tools through
the published runtime. The model read the entire installed ASM skill, then
selected policy validation, conversion and pack validation, in that order.
Exactly four tool calls and four execution results were observed during one
agent start/end pair. No Bash, deployment or delegation was selected.

Policy validation used the shipped `minimal-policy.xml` fixture and `asm-policy`
input type. It succeeded, identifying `minimal-policy`, blocking enforcement and
no unsupported enabled features.

Conversion selected the shipped policy and signature fixtures, synthetic
namespace `example` and a new private output directory. Contrary to the exact
reviewed argument set, the model added `targetName: ""`, `allowPartial: false`
and `overwrite: false`. The guard rejected this call before conversion ran.
No output directory or managed artifacts were created. The subsequent selected
pack validation returned the expected `io` failure because the pack did not
exist. The model did not retry and accurately reported incomplete qualification,
unverified resource counts/completeness/warnings, unconfirmed files and the
operator review requirement before any deployment.

The failed attempt's result buffers and final conclusion were inspected
individually at 40/76/120/153 columns, collapsed/expanded, dark/light and
Unicode/ASCII/Nerd presets: **192 buffers and 204 viewport pages pass their
failure-state expectations**. Viewport rows reconstruct every native buffer.
This proves accurate failure presentation for these observed cases; it does not
prove successful conversion. The observer capture opened and closed once.
Plugin cancellation, shutdown, context replacement and late updates remain
separate gates. The session remains open for its queued guidance capture.

Private result expectation SHA-256:
`9e4f2920fbdddd3a5145ab598b88c2ad9d8b3d26cf5ce581040c824671e9a88a`.
Private frame manifest SHA-256:
`7fc45bd49662fd9712421ed2d8ec90064748cadeeda3fff15ca183274cd4f2f0`.
The original scenario SHA-256 is
`93101c8fe03fb414fc2f046044ad63d89f69faee56b36f4307476e057c1c9089`.
Raw journals, model metadata, captures, archives and host paths remain private.

## Pending work and exact next actions

A fresh Ubuntu scenario now explicitly binds `targetName: "minimal-policy"`,
`allowPartial: false` and `overwrite: false`. The target equals the policy's
normal source-derived name and both safety flags preserve strict defaults.
Its scenario SHA-256 is
`ef07dfa644fcfc05291da77663cd4514ccf20a3da061df0110eae5e97b70a924`.
The submission is queued at position 2; the first session's guidance capture is
queued at position 1. Neither submission has been replayed or bypassed.

Mac's original workflow is queued at position 14 with zero agent or tool starts.
Its scenario SHA-256 is
`63997f1146b63ba50bec02dac726718f87d71c279ed8d2a508710d4823b94984`.
These are observed queue positions, not completed execution evidence.

Next actions: obtain normal admission for the existing submissions, inspect
complete guidance separately, and audit every selected argument/result. For a
successful conversion, independently compare all four generated artifacts with
the synthetic expectations and inspect every successful result and conclusion.
The omitted-option workflow remains an observed failure; an explicit-option
success would qualify only its distinct scenario. Complete host, argv,
readability, lifecycle and workflow gates remain open. Reinspect preserved
buffers using the delivered #1812 checker before relying on its repaired
paragraph interpretation. Do not retire queued panes or their worktrees.

Account-dependent deployment/service gates remain deferred by the user. After
deferral is lifted, qualify an existing authorized read-only receipt workflow;
this campaign does not start services, authenticate or deploy infrastructure.
Issues #1600 and #1579 remain open.
