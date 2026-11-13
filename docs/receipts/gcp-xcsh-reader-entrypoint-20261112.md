# Installed GCP artifact and xcsh reader source checkpoint

Marketplace #1559 remains incomplete.

The installed artifact resolver now recognizes the independently verified
Terraform 1.17.2, Google 8.11.0 and xcsh 15.16.2 registry tuple. Its lock and three
executable hashes were remeasured against the retained signed-release and normal
registry-installation evidence. Historical profiles keep their original locks
and binaries. A Google-only lookup keeps its historical selection.

The actual Google Python reader previously rejected Terraform 1.17.2 because
its executable profiles stopped at 1.17.1. Failing-first tests reproduced that
refusal. The new exact tuple preserves older mappings and rejects Google 8.10,
xcsh executables and altered hashes in the Google reader role. All 55 existing
and new process/reader Python regressions passed.

The distinct xcsh reader entry point uses the existing original-process, sink,
claim and receipt observer. It validates the original two-hour operation budget,
a 45-second observation bound, a separate 15-second startup bound, exact source
and executable inputs, and prepared Site/Token target coverage. It compiles
admitted source buffers with Python's standard loader and retains partial
observations. Request and result records grant no apply authority.

The new entry point has 39 request, identity, source, encoding and startup tests.
The first source-availability test failed before implementation; startup and
strict UTF-8 cases also have retained failing-first evidence. Packaging tests
failed while the entry point was absent from the shipped source inventory, then
passed after the normal builder added its hash. All ten shipped source hashes
match their current files.

The shared Terraform, Platform and GCloud tests plus isolated runtime regressions
passed all 1,308 tests with zero failures and 6,344 assertions. All three runtime
bundles built. Relevant Ruff, mypy, Biome, diff and authored-source secret scans
passed.

These are source and offline results. The actual xcsh reader CLI lifecycle,
its TypeScript bridge, full installed capture composition, original Site/token/
JWT/VM/NIC/audit joins and Google refresh across expiry still need qualification.
The default capture factory and runtime activation source remain unchanged.
No new GCP campaign or guest, networking, lifecycle or traffic acceptance is
claimed. Historical receipts, collectors, locks and immutable assets are retained.

The SDK prerequisite repairs and version PR passed their applicable CI and
merged. Tag `v23.10.13` exists; publication CI is active. Published download and
installation verification remains a separate gate before consumer typechecks
and marketplace delivery.
