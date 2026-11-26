# Published GCP prerequisite qualification on November 12

Full marketplace issue #1559 remains incomplete. This receipt records registry
installation and a synthetic loopback producer fixture. GCP deployment, guest capture,
registration, health, networking, traffic and recovery remain separate gates.

Latest-version queries confirmed Terraform 1.17.2, Google 8.11.0 and xcsh 15.16.2. A
fresh direct-registry installation with no resources passed initialization and provider
schema inspection. The xcsh binary matched the independently verified v15.16.2 release
from source `72ea8e91c10429b9f3dd4776dcfe8b76b882c870`.

| Input | SHA-256 |
| --- | --- |
| Terraform 1.17.2 executable | `dbfef0be43ba2117481be510d3b83a2d8cdfa6ae7ec69c5aeb04b3947956ff7e` |
| xcsh 15.16.2 executable | `542d99d1905fe03fadce8a889390751b3ad1531f367ef678cf03d97204ef7cc1` |
| Google 8.11.0 executable | `f6c7080ca82f5ecc2f279f9b6edf152ec366890f76ab0a97a1667bdf17331ef5` |
| Registry lock | `05b1685de902eec100da53ec973895b04f5faa5b81b3f5257de09caeace531bc` |
| Provider schema | `b09164cac44b715bf40fb5d26afc65b02c6d181cfb516ae54cf5b3e6c647af25` |

The initial preflight refused ambient Terraform 1.16.5 before registry initialization.
Selecting the retained, hash-verified 1.17.2 version-cache executable changed that
input. No user setting or cloud resource changed.

The frozen loopback fixture used the installed xcsh binary and a reviewed saved plan for
one synthetic Token. During its original POST, independent kernel reads observed exactly
one original Terraform child, parent PID, start ticks, boot digest, executable
digest/device/inode and retained original sink directory descriptor. The complete claim,
immutable-identity reservation and receipt joined that observed process, exact target,
scope bytes and saved plan. The fixture passed a no-change plan, separately reviewed
delete plan, one delete and empty destroy. No process signals were sent.

The initial fixture failure remains retained: its synthetic GET omitted the declared
concurrency version, so Terraform rejected incomplete state after the original POST.
Original processes and listener were independently absent before a fresh fixture
supplied that field. That failure did not qualify cleanup or producer completion.
Corrected fixture SHA-256:
`acd5f6625f84e8644f64ccfbd19912666d05269233b1b5363c58e61a4e7289d0`.

The SDK callback repair merged in xcsh PR #5165. Its merged-main installation failed the
stale Terraform corpus guard. Follow-up [PR #5167](https://github.com/f5-sales-demo/xcsh/pull/5167) refreshes the verified API
12.5.2 and provider/documentation 15.16.2 metadata. Frozen Bun 1.4.4 bootstrap, 45
focused tests, normal hooks/workspace checks, shell audit, privacy checks and complete
authenticated binary/source/tarball installation smoke passed locally. Applicable
exact-head CI/review, publication and installed SDK consumer verification remain
pending.

The runtime activation pin remains at its earlier qualified tuple. Distinct installed
xcsh capture authentication and the genuine default capture factory remain unfinished.
Fresh ordinary Ubuntu `bun dev`, full native/Terraform single-node and HA
lifecycle/networking/traffic campaigns, independent cleanup/restoration, plugin
review/CI/publication and published installation remain required. Historical failures,
locks, collectors and immutable assets are preserved.
