# gh_help

Show GitHub CLI help for a command path. Use this before `gh_exec` when unsure of a command's subcommands or flags.

## Parameters

- `command_path` (optional): the command path without the `gh` prefix, lowercase words separated by spaces, e.g. `pr`, `pr view`, `run`, `api`. Omit for top-level help.

## Notes

- Runs `gh <command_path> --help` and returns the help text verbatim.
- Discover a command's `--json` fields and flags here, then run the actual query with `gh_exec`.
