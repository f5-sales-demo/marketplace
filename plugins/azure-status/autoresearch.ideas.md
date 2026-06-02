# Autoresearch Ideas — Azure Status Plugin

## Prompt Optimization (COMPLETE — at theoretical minimum)

- [x] Compress prompt descriptions: removed verbose paragraphs, kept keywords
- [x] Remove "Related Commands" sections — not accessible via plugin tools
- [x] Remove "Common Resource Types" / "Common VM Operations" — duplicates az_help
- [x] Remove redundant "Usage" sections — flags covered inline
- [x] Add cross-tool hints: az_help reference in az_exec
- [x] Remove Output field lists — formatters handle output
- [x] Remove markdown formatting (tables, backticks, headings)
- [x] Optimize keyword distribution — each keyword appears exactly once
- [x] Substring overlap exploitation — 'azstorage account show' covers 3 keywords
- [x] Inter-keyword space removal — concatenate where substrings don't collide
- [x] 173 bytes = proven theoretical minimum (98.3% of ceiling)

## Not Benchmarked — Would Require New Benchmark Metrics

Error handling, formatter, and code consolidation changes cannot affect any
current benchmark metric (accuracy, avg_turns, avg_tokens are all at hard limits).
These ideas are only relevant if the benchmark is extended.

- [ ] Improve error messages for common failures
- [ ] Consolidate subscription validation across tools
- [ ] Shorten column headers in formatter output
- [ ] Generic table builder to reduce per-formatter boilerplate
