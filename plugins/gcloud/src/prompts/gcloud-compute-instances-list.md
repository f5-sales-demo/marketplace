List Compute Engine virtual machine instances via `gcloud compute instances list`.

Returns a table of instance name, zone, machine type, status, and internal/external IP.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `zone`    | Optional zone to restrict results (mapped to gcloud `--zones`), e.g. `"us-central1-a"` |
| `filter`  | Optional gcloud `--filter` expression, e.g. `"status=RUNNING"` |
| `limit`   | Optional positive integer capping the number of results |

For richer queries (custom projections, sorting, sub-field selection), run `gcloud_exec` with `compute instances list` and your own `--filter`/`--format` flags.
