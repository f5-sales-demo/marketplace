# Autoresearch Ideas — GitLab Plugin

## Prompt Optimization

- [ ] Compress tool descriptions: keep flag names, parameter types, and one-line summaries; drop prose
- [ ] Add inline `--output json` field examples to glab_issue_list and glab_search prompts (reduces glab_help round-trips)
- [ ] Reinforce the glab-vs-gh flag contrast (`--output json`, not `--json`/`--jq`) where the model is most likely to guess wrong
- [ ] Cross-tool hints: "use glab_help to discover flags before glab_exec"
- [ ] Clarify when to prefer typed tools over glab_exec so the model does not reach for the passthrough first

## Error Handling

- [ ] Map more glab stderr signatures in src/glab/exec.ts to typed errors (auth, not-found, rate-limit)
- [ ] Include the fix command in "not authenticated" errors (run: `/gitlab:setup`)
- [ ] Add structured retry hints to error results (e.g. retry_with: glab_issue_view)

## Formatter Improvements

- [ ] Shorten column labels in the issue summary table without losing meaning
- [ ] Consistent "no results" messaging across formatIssueTable and formatIssueDetail
- [ ] Trim redundant empty lines emitted by the detail formatter

## Token Efficiency

- [ ] Audit the per-file prompt byte budget across the 6 prompts; target the largest first
- [ ] Merge near-duplicate guidance shared by glab_issue_view and glab_issue_list prompts
- [ ] Remove markdown that adds tokens without improving model parsing (horizontal rules, extra headings)

## Guardrail Coverage

- [ ] Extend benchmark scenarios for glab_exec: GraphQL-with-body block, `-F` body implies POST block
- [ ] Add a REST-plus-GraphQL dedup search scenario driven by a populated GraphQL fixture
- [ ] Keep the read-only allowlist fail-safe: new read verbs are opt-in, never a blanket allow
