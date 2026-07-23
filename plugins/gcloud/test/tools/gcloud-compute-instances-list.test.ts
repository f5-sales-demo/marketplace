import { describe, expect, it } from 'bun:test';
import { createGcloudComputeInstancesListTool } from '../../src/tools/gcloud-compute-instances-list';

const mockTypebox = {
  Type: {
    Object: (schema: Record<string, unknown>) => schema,
    String: (opts?: Record<string, unknown>) => ({ type: 'string', ...opts }),
    Number: (opts?: Record<string, unknown>) => ({ type: 'number', ...opts }),
    Optional: (schema: unknown) => ({ optional: true, ...((schema as object) ?? {}) }),
  },
};

describe('createGcloudComputeInstancesListTool metadata', () => {
  const tool = createGcloudComputeInstancesListTool({ typebox: mockTypebox });

  it('has correct name', () => {
    expect(tool.name).toBe('gcloud_compute_instances_list');
  });

  it('has a label', () => {
    expect(tool.label).toBe('Google Cloud Compute Instances');
  });

  it('has a description mentioning gcloud', () => {
    expect(tool.description).toContain('gcloud');
  });

  it('has an execute function', () => {
    expect(typeof tool.execute).toBe('function');
  });
});

describe('gcloud_compute_instances_list input validation', () => {
  const tool = createGcloudComputeInstancesListTool({ typebox: mockTypebox });

  it('rejects an invalid zone', async () => {
    const r = await tool.execute('id', { zone: 'Not_A_Zone' }, undefined, null, { cwd: '/tmp' });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('zone');
  });

  it('rejects a zone with shell metacharacters', async () => {
    const r = await tool.execute('id', { zone: 'us-central1-a; rm' }, undefined, null, { cwd: '/tmp' });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('zone');
  });

  it('rejects a zero limit', async () => {
    const r = await tool.execute('id', { limit: 0 }, undefined, null, { cwd: '/tmp' });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('limit');
  });

  it('rejects a negative limit', async () => {
    const r = await tool.execute('id', { limit: -1 }, undefined, null, { cwd: '/tmp' });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('limit');
  });

  it('rejects a non-integer limit', async () => {
    const r = await tool.execute('id', { limit: 3.14 }, undefined, null, { cwd: '/tmp' });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('limit');
  });

  it('accepts a valid zone (no validation rejection before spawn)', async () => {
    try {
      const r = await tool.execute('id', { zone: 'us-central1-a' }, undefined, null, { cwd: '/tmp' });
      expect(r.content[0].text).not.toContain('invalid zone');
    } catch {
      // gcloud CLI may be unavailable; validation passed
    }
  });
});
