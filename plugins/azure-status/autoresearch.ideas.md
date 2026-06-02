# Autoresearch Ideas — Azure Status Plugin

## Prompt Optimization (EXHAUSTED)

- [x] Compress prompt descriptions: removed verbose paragraphs, kept keywords
- [x] Remove "Related Commands" sections — not accessible via plugin tools
- [x] Remove "Common Resource Types" / "Common VM Operations" — duplicates az_help
- [x] Remove redundant "Usage" sections — flags covered inline
- [x] Add cross-tool hints: az_help reference in az_exec
- [x] Remove Output field lists — formatters handle output
- [x] Remove markdown formatting (tables, backticks, headings)
- [x] Optimize keyword distribution — each keyword appears exactly once
- [x] Reached 98.1% of theoretical composite maximum (0.892 / 0.909)

## Error Handling (NOT BENCHMARKED)

- [ ] Improve error messages for common failures: "not logged in" should include the fix command
- [ ] Add structured retry hints in error results
- [ ] Consolidate subscription validation code shared across tools

Note: Error handling improvements don't affect the current benchmark metrics (accuracy already 1.0, turns/tokens unaffected by error paths).

## Formatter Improvements (NOT BENCHMARKED)

- [ ] Shorten column headers in markdown tables
- [ ] Abbreviate UUIDs in table output
- [ ] Add summary line to tables
- [ ] Consistent "no data" messaging across all formatters

Note: Formatter output doesn't affect any benchmark metric. Only matters for real-world AI usage quality.

## Code Consolidation (NOT BENCHMARKED)

- [ ] Extract common parameter validation into a shared helper function
- [ ] Create a shared `buildCommonArgs` for --subscription and --resource-group flags
- [ ] Generic table builder to reduce per-formatter boilerplate

Note: Code structure doesn't affect benchmark metrics. Only matters for maintainability.
