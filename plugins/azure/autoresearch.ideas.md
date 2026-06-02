# Autoresearch Ideas — Azure Status Plugin

## Prompt Optimization

- [ ] Compress prompt descriptions: remove verbose paragraphs while keeping flag names, types, and one-line descriptions
- [ ] Add JMESPath query examples to az-resource and az-vm prompts (reduces turns by eliminating az_help calls)
- [ ] Add common --query patterns inline (e.g. `[].{name:name,state:state}`)
- [ ] Remove "Related Commands" sections that reference commands not accessible via the plugin's tools
- [ ] Remove redundant "Usage" sections where the flag table covers the same info
- [ ] Add cross-tool hints: "Use az_account list first to find subscription IDs"

## Error Handling

- [ ] Improve error messages for common failures: "not logged in" should include the fix command
- [ ] Add structured retry hints in error results (e.g., `retry_with: az_account show`)
- [ ] Consolidate subscription validation code shared across az_account, az_group, az_resource, az_vm

## Formatter Improvements

- [ ] Shorten column headers in markdown tables (e.g. "RG" instead of "Resource Group")
- [ ] Abbreviate UUIDs in table output (first 8 chars + ...)
- [ ] Add summary line to tables (e.g. "3 VMs in 2 resource groups")
- [ ] Consistent "no data" messaging across all formatters

## Code Consolidation

- [ ] Extract common parameter validation into a shared helper function
- [ ] Create a shared `buildCommonArgs` for --subscription and --resource-group flags
- [ ] Generic table builder to reduce per-formatter boilerplate

## Token Efficiency

- [ ] Current prompt budget: ~8.5KB across 6 files. Target: ~6KB without losing flag or field documentation
- [ ] Remove markdown formatting that adds tokens without helping AI parsing (extra empty lines, horizontal rules)
- [ ] Merge small prompts that share significant content
