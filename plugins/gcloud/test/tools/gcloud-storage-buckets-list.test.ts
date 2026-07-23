import { describe, expect, it } from 'bun:test';
import { createGcloudStorageBucketsListTool } from '../../src/tools/gcloud-storage-buckets-list';

const mockTypebox = {
  Type: {
    Object: (schema: Record<string, unknown>) => schema,
    String: (opts?: Record<string, unknown>) => ({ type: 'string', ...opts }),
    Number: (opts?: Record<string, unknown>) => ({ type: 'number', ...opts }),
    Optional: (schema: unknown) => ({ optional: true, ...((schema as object) ?? {}) }),
  },
};

describe('createGcloudStorageBucketsListTool metadata', () => {
  const tool = createGcloudStorageBucketsListTool({ typebox: mockTypebox });

  it('has correct name', () => {
    expect(tool.name).toBe('gcloud_storage_buckets_list');
  });

  it('has a label', () => {
    expect(tool.label).toBe('Google Cloud Storage Buckets');
  });

  it('has a description mentioning gcloud', () => {
    expect(tool.description).toContain('gcloud');
  });

  it('has an execute function', () => {
    expect(typeof tool.execute).toBe('function');
  });
});

describe('gcloud_storage_buckets_list limit validation', () => {
  const tool = createGcloudStorageBucketsListTool({ typebox: mockTypebox });

  it('rejects a zero limit', async () => {
    const r = await tool.execute('id', { limit: 0 }, undefined, null, { cwd: '/tmp' });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('limit');
  });

  it('rejects a non-integer limit', async () => {
    const r = await tool.execute('id', { limit: 1.1 }, undefined, null, { cwd: '/tmp' });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('limit');
  });
});
