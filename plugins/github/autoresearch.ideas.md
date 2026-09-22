# Autoresearch Ideas — GitHub Plugin

## Prompt Optimization

- [ ] Compress tool descriptions: keep flag names, parameter types, and one-line summaries; drop prose
- [ ] Add inline `--json` field examples to gh_repo_view, gh_pr_view, and gh_search_prs prompts (reduces gh_help round-trips)
- [ ] Add common `--jq` filter patterns inline (e.g. `.[] | select(.state=="OPEN") | .number`)
- [ ] Cross-tool hints: "use gh_help to discover `--json` fields before gh_exec"
- [ ] Clarify when to prefer typed tools over gh_exec so the model does not reach for the passthrough first

## Error Handling

- [ ] Map more gh stderr signatures in src/gh/exec.ts to typed errors (auth, not-found, rate-limit)
- [ ] Include the fix command in "not authenticated" errors (run: `/github:setup`)
- [ ] Add structured retry hints to error results (e.g. retry_with: gh_repo_view)

## Formatter Improvements

- [ ] Shorten column labels in PR/issue summaries without losing meaning
- [ ] Abbreviate long commit SHAs to short form in run-watch output
- [ ] Consistent "no results" messaging across formatRepoView, formatIssueView, formatSearchResults
- [ ] Trim redundant empty lines emitted by pushLine sequences

## Token Efficiency

- [ ] Audit the per-file prompt byte budget across the 11 prompts; target the largest first
- [ ] Merge near-duplicate guidance shared by gh_pr_view and gh_pr_diff prompts
- [ ] Remove markdown that adds tokens without improving model parsing (horizontal rules, extra headings)

## Lifecycle Coverage

- [ ] Add benchmark scenarios for independent prepare, publish, monitor, repair, and cleanup stages
- [ ] Compare typed lifecycle results for normal and explicitly overridden governance recommendations
- [ ] Add a gh_run_watch fixture-driven scenario (run-list.json + run-jobs.json) for a completed success run
- [ ] Keep `gh_exec` argv-only and preserve structural control-character validation
