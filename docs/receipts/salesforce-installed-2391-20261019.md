# Salesforce installed runtime 23.9.1 acceptance

Delivery: [#1635](https://github.com/f5-sales-demo/marketplace/issues/1635).
Parent gates: [#1591](https://github.com/f5-sales-demo/marketplace/issues/1591)
and [#1624](https://github.com/f5-sales-demo/marketplace/issues/1624).
This is historical qualification of Salesforce 2.3.13 with xcsh 23.9.1;
subsequent default-information and expansion-cue changes require fresh acceptance.

## Artifact and installation

Immutable runtime `v23.9.1` source is
`73563972964aa8425792ef568d0eb664bda3edf7`, release ID `417482146`.
The published Mac ZIP SHA256 is
`2492952ab3328f4a26e87f6333d7938ed784420384c94ca54f5890a35dd8c106`;
provenance SHA256 is
`2e6cd4f28229976b6b9943ecd82101178aa6cbecc6113c8d483d609a852a9a7e`.
The exact-tag signing and notarization verifier passed with team `97ZYL78T5F`.
Homebrew installed 23.9.1; installed CLI and native SHA256 respectively are
`90710701f6db506309478e9bbc376a5e4e7ee0d583c9b874adea6f34e695ec74`
and `f59c93166ee012e28b50052994a4f8307626e64052b333860a34f8aa259447dc`.
The 101 installed Salesforce 2.3.13 files matched the immutable archive;
plugin source remains `d13babf0909a87982f1ff9d43abe8d1ab8a41f2e`.
Artifact identity is separate from the behavioral checks below.

## Native fixture qualification

The corporate MDM MacBook ran the actual published binary and installed plugin.
The capture driver source was marketplace
`19b852abf5f9712b19920c2131d135f7189fdc9d`.
Individual inspection passed 780 frames over 13 cases, both themes,
Unicode/ASCII/Nerd presets, collapsed/expanded states and widths
40/76/120/153/150. A fresh native geometry frame proved allocation of 159 columns.
Bash and Zsh reconstructed declared command argv exactly. Pipeline execution
repainted 14 times and every completed case had zero post-end repaints.
Earlier insufficient-allocation captures remain preserved as invalid evidence.

This establishes native renderer and Herdr ANSI behavior. It does not establish
desktop-font raster fidelity, human observation or model tool selection.
The private fixture summary SHA256 is
`9f2f5f99a75f7a9b0a87da1599cd13a97cd90ef2b60e161216cc76c6c0de1b41`.

## Actual interactive shutdown

A synthetic pipeline ran inside the published interactive TUI with `hasUI: true`.
The documented shutdown request aborted the active execution, emitted its end
with active count zero, emitted `session_shutdown`, and exited with code zero
13 ms after the request. Zero late updates were observed through the recorded
post-exit observation window. This verifies actual interactive shutdown rather
than a capture-harness retirement. The private verification SHA256 is
`ffefb5c2c50dd67a636b0abb8c9ac2dfd1e4a631466b17e7a1b998a3980495d6`.

An independent idle interactive shutdown exited with code zero in 6 ms.
Its verification SHA256 is
`14765d8fe8645081aacf0019eeb7003866c1070cf8ea647fc8a96d23c382a084`.
The historical 23.9.0 failure remains in the
[interactive guidance receipt](salesforce-interactive-guidance-20261019.md).

Raw captures and lifecycle events remain private in the
`salesforce-interactive-shutdown-20261019` cohort. No Salesforce writes,
authentication repair or Salesforce service probes on Ubuntu/NUC were performed.

## Read-only service qualification

All six native tools succeeded on the corporate MacBook. Individual inspection
passed 360 native frames over 40/76/120/153/157 columns, both themes, three
symbol presets and collapsed/expanded states. Every execution had zero
post-end repaints; the pipeline emitted 373 execution repaints.
Bash and Zsh command reconstruction passed. The first inspection stopped at
a recorder timeout; an isolated retry reconstructed the same command in 95 ms,
and the complete inspection retry passed. The timeout remains a private
harness diagnostic. This result qualifies native buffers and service outcomes;
the partial independent Herdr viewport observations are not a complete
viewport matrix. The complete live inspection summary SHA256 is
`a955ed398d8b3d3c1c7ef31e669335e0511e6c9922b3180a802c725496d99f91`.
