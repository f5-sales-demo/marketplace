# Original observer image evidence

Issue: <https://github.com/f5-sales-demo/marketplace/issues/1559>.
PR: <https://github.com/f5-sales-demo/marketplace/pull/1698> remains draft.

Terraform source 2.4.82 adds a fixed read of the qualification observer image in
the official `ubuntu-os-cloud` namespace. Caller arguments cannot redirect that
read. The source-owned producer durably retains raw replies before decoding and
checks the exact image name, numeric ID, namespace, architecture, ready status
and creation timestamp. Reader-issued objects bind original files and receipts;
copies, replacements, changed ownership and stale evidence refuse.

The immutable observer pin remains `ubuntu-2404-noble-amd64-v20261021`, numeric ID
`4996011480491275419`. Authenticated source reads verified that exact image using
the original credential snapshot and input guards. Independent review joined the
stored body, receipt, authentication hashes, source hashes and original actor.
These reads made zero managed cloud submissions and created no VM.

The first live source harness stopped before authentication because it tried to
admit the existing SDK directory as a private execution input. Its failure is
retained. A new private credential snapshot was then admitted while the original
SDK file was independently rechecked; the SDK directory and settings were not
changed. This follows the installed resolver's source/snapshot boundary.

Tests exposed a final-guard race: replacing an evidence file during the last
original-input check could return earlier bytes. Rechecking both body and receipt
after that guard repaired the failure. The bad run and precision-loss fixture
lint failure remain retained. Numeric-ID rejection now uses explicit conversion
instead of an imprecise integer literal; the producer still requires a string ID.

This is image/source evidence. Observer insert, disk, service-account absence,
SSH trust, guest capture, ordinary installed runtime and lifecycle/traffic
acceptance remain separate gates. The default capture factory is unconnected.
Fresh official version checks found Terraform 1.17.2, Google 8.11.0 and xcsh
15.15.7. Terraform 1.17.2 qualification and preservation of historical executable
paths remain required before another managed campaign. No published artifact or
immutable v12.3.1 asset was changed.

Validation passed nine image regressions, 49 focused tests with 306 assertions,
and 1,408 shared tests with 11,440 assertions. Three runtime builds/typechecks,
dependencies, catalog, manifests and tracker checks passed. The original live
source-read actor finished naturally; its original process group was independently
absent. Exact-head CI remains required for this new source commit.
