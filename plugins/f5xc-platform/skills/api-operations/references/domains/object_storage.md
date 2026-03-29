# Object Storage

Mobile SDK assets, versioned binaries, and app shield files.

Category: Platform. Complexity: simple. Paths: 9. Schemas: 18.

## Use Cases

- Manage object storage services
- Configure stored objects and buckets
- Manage storage policies

## Resources

| Resource | Description | Tier | CRUD | Profile |
| ---------- | ------------- | ------ | ------ | --------- |
| object_store | Object store | Standard | - | resources/object_storage/object_store.md |
| bucket | Bucket | Standard | - | resources/object_storage/bucket.md |

## Dependency Graph

- bucket requires: object_store

## Creation Order

1. object_store (no dependencies)
2. bucket (depends: object_store)

## Related Domains

`marketplace`
