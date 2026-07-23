List Amazon S3 buckets, or the contents of a bucket or prefix, via the AWS CLI.

## Usage

```
aws s3api list-buckets --output json      # no target: list all buckets
aws s3 ls s3://bucket/prefix/             # with target: list objects/prefixes
```

## Parameters

| Parameter | Description |
|-----------|-------------|
| `target` | Optional `s3://bucket[/prefix]` URI. Omit to list all buckets in the account. |

## Output Fields

Bucket listing (JSON):

- `Name` — Bucket name
- `CreationDate` — When the bucket was created

Object listing (text, parsed):

- `key` — Object key or common prefix (directory)
- `size` — Object size in bytes (0 for prefixes)
- `lastModified` — Last modified timestamp

## Notes

Without a target, buckets are listed globally for the account (bucket names are
not region-scoped). With a target, a trailing slash lists the contents of that
prefix; `PRE` entries are common prefixes ("folders").

For advanced filtering on the JSON bucket list, add `--query` with a JMESPath
expression, e.g. `--query "Buckets[?starts_with(Name, 'log')].Name"`.

## Related Commands

- `aws s3 ls s3://bucket --recursive` — List all objects under a bucket
- `aws s3api head-object --bucket B --key K` — Object metadata
