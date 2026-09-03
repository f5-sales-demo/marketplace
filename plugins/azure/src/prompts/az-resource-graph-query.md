# Query Azure Resource Graph

Run a read-only Resource Graph query with typed paging and subscription scope.

- Put KQL in `query`; it is passed only to `--graph-query`.
- Put an optional JMESPath result transform in `output_projection`; it is passed only to global `--query`.
- Use `subscriptions` for individual Azure subscription UUIDs.
- Use `first` with either `skip` or `skip_token`; never combine `skip` and `skip_token`.
- Set `allow_partial_scopes` only when partial accessible-scope results are acceptable.

The tool disables dynamic extension installation. A setup-required result must be handled through
`/azure:setup`, which asks before installing or upgrading the `resource-graph` extension.
