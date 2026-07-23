List Cloud Storage buckets via `gcloud storage buckets list`.

Returns a table of bucket name, location, storage class, and creation time.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filter`  | Optional gcloud `--filter` expression, e.g. `"location=US"` |
| `limit`   | Optional positive integer capping the number of results |

For richer queries (custom projections, sorting, sub-field selection), run `gcloud_exec` with `storage buckets list` and your own `--filter`/`--format` flags.
