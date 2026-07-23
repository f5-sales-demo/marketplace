# Autoresearch Ideas — gcloud Plugin

## Prompt Optimization

- [ ] Compress tool descriptions: keep flag names, parameter types, and one-line summaries; drop prose
- [ ] Add inline `--filter` / `--format` field examples to gcloud_projects_list and gcloud_compute_instances_list prompts (reduces gcloud_help round-trips)
- [ ] Reinforce the gcloud `--filter` (server-side selection) versus `--format` (client-side projection) split where the model is most likely to conflate them or reach for an Azure-style `--query`
- [ ] Cross-tool hints: "use gcloud_help to discover flags before gcloud_exec"
- [ ] Clarify when to prefer typed tools over gcloud_exec so the model does not reach for the passthrough first

## Error Handling

- [ ] Map more gcloud stderr signatures in src/gcloud/exec.ts to typed errors (auth, session-expired, permission-denied, not-found)
- [ ] Include the fix command in "not authenticated" errors (run: `gcloud auth login`)
- [ ] Add structured retry hints to error results (e.g. retry_with: gcloud_config_list)

## Formatter Improvements

- [ ] Shorten column labels in the instance summary table without losing meaning
- [ ] Consistent "no results" messaging across formatProjectTable, formatInstanceTable, and formatBucketTable
- [ ] Trim redundant whitespace emitted by the config detail formatter

## Token Efficiency

- [ ] Audit the per-file prompt byte budget across the prompts; target the largest first (gcloud_exec)
- [ ] Merge near-duplicate guidance shared by gcloud_projects_list and gcloud_compute_instances_list prompts
- [ ] Remove markdown that adds tokens without improving model parsing (horizontal rules, extra headings)

## Guardrail Coverage

- [ ] Extend benchmark scenarios for gcloud_exec: `container clusters get-credentials` block, `--zone`-shifted mutation block
- [ ] Add a describe-shaped read scenario driven by a `compute instances describe` fixture
- [ ] Keep the read-only allowlist fail-safe: new read verbs are opt-in, never a blanket allow
