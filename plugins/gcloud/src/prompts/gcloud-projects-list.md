List the Google Cloud projects accessible to the active account via `gcloud projects list`.

Returns a table of project ID, name, number, and lifecycle state.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filter`  | Optional gcloud `--filter` expression, e.g. `"lifecycleState=ACTIVE"` |
| `limit`   | Optional positive integer capping the number of results |

For richer queries (custom projections, sorting, sub-field selection), run `gcloud_exec` with `projects list` and your own `--filter`/`--format` flags.
