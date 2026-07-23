Show Salesforce CLI help for a command path. Use this before running a command when unsure of a topic's subcommands or flags.

<instruction>
Provide `command_path` (optional): the command path without the `sf` prefix. Salesforce uses a `topic:command` grammar, so both spaces and colons separate parts, e.g. `org`, `org list`, `org:display`, `data query`. Omit for top-level help.

Runs `sf <command_path> --help` and returns the help text verbatim. Discover a command's flags and output options here, then run the actual read-only command through `sf_exec` (which enforces a read-only allowlist and supports the global `--json` flag and `sf api request` GET reads).
</instruction>
