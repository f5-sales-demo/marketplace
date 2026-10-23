# CE schema test fixtures

The six `*schema.json` fixtures retain the captured public vendor documents.
Repeated identical objects are stored once in `shared-schema-components.json`.
The references to that file are test storage references. Test callers expand
these references with `resolveCeSchemaFixture` before invoking the unchanged
wire validators. Vendor references and all constraints, annotations, endpoint
spellings and extension fields remain unchanged after expansion.

`schema-fixture-provenance.json` records canonical hashes of the original schema
groups and full documents at the captured source commit. The fixture regression
runs in the platform suite and verifies exact reconstruction, malformed and
cyclic reference rejection, preservation of vendor references and isolation
between consumers that mutate their own fixture copies.

Regenerate shared storage with `python3 scripts/deduplicate-ce-schema-fixtures.py`,
then format the JSON with the repository Biome configuration. Regeneration is
idempotent on parsed JSON; formatting does not alter the reconstructed documents.
