Show the active Google Cloud CLI configuration via `gcloud config list`.

Returns the resolved project, account, region, and zone for the current `gcloud` configuration. Use this to confirm which project and identity subsequent commands will target.

Takes no parameters. For richer configuration queries (all properties, named configurations), run `gcloud_exec` with `config list --all` and your own `--filter`/`--format` expressions.
