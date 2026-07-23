# Autoresearch Ideas — Salesforce Plugin

## Prompt Optimization

- [ ] Compress tool descriptions: keep flag names, parameter types, and one-line summaries; drop prose
- [ ] Add inline SOQL examples to sf_query so the model composes valid queries without an sf_help round-trip
- [ ] Reinforce the sf `topic:command` grammar (spaces and colons both split parts) in sf_help and sf_exec
- [ ] Cross-tool hints: "use sf_help to discover flags before sf_exec"
- [ ] Clarify when to prefer typed tools (sf_query, sf_org_display) over sf_exec so the model does not reach for the passthrough first
- [ ] Steer pipeline requests to sf_pipeline_report instead of hand-rolled sf_query calls

## Error Handling

- [ ] Map more sf stderr/JSON signatures in src/sf/exec.ts to typed errors (session expired, no default org, auth)
- [ ] Include the fix command in "not authenticated" errors (run: `/salesforce:setup`)
- [ ] Add structured retry hints to error results (e.g. retry_with: sf_org_display)

## Formatter Improvements

- [ ] Shorten column labels in the org and query tables without losing meaning
- [ ] Consistent "no results" messaging across formatOrgTable and formatQueryResults
- [ ] Collapse redundant vertical whitespace emitted by formatOrgDetail

## Token Efficiency

- [ ] Audit the per-file prompt byte budget across the 6 prompts; target the largest first
- [ ] Merge near-duplicate guidance shared by sf_query and sf_pipeline_report prompts
- [ ] Remove markdown that adds tokens without improving model parsing (horizontal rules, extra headings)

## Guardrail Coverage

- [ ] Extend sf_exec scenarios: `--method POST` block, `-X PATCH` cluster block, colon-form write block
- [ ] Add a Tooling-API read scenario driven by a populated metadata fixture
- [ ] Keep the read-only allowlist fail-safe: new read verbs are opt-in, never a blanket allow
