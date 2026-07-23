Reads a GitHub pull request through the local GitHub CLI.

<instruction>
- Accepts a pull request number, URL, or branch name
- Omitting `pr` targets the pull request associated with the current branch
- Use this for PR metadata, body, changed-file summaries, review discussion, inline review comments, and issue-comment context
- For custom field projection or uncovered commands, use `gh_exec` with `--json`/`--jq` (jq syntax)
</instruction>

<output>
Returns pull request metadata, body text, changed files, and optionally visible reviews, inline review comments, and issue comments in a readable format.
</output>
