Show GitLab CLI help for a command path. Use this before running a query when unsure of a command's subcommands or flags.

<instruction>
Provide `command_path` (optional): the command path without the `glab` prefix, lowercase words separated by spaces, e.g. `issue`, `issue list`, `mr`, `api`. Omit for top-level help.

Runs `glab <command_path> --help` and returns the help text verbatim. Discover a command's flags and output options here, then run the actual query.
</instruction>
