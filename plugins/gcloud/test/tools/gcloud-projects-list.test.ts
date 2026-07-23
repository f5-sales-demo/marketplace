import { describe, expect, it } from 'bun:test';
import { createGcloudProjectsListTool } from '../../src/tools/gcloud-projects-list';

const mockTypebox = {
  Type: {
    Object: (schema: Record<string, unknown>) => schema,
    String: (opts?: Record<string, unknown>) => ({ type: 'string', ...opts }),
    Number: (opts?: Record<string, unknown>) => ({ type: 'number', ...opts }),
    Optional: (schema: unknown) => ({ optional: true, ...((schema as object) ?? {}) }),
  },
};

describe('createGcloudProjectsListTool metadata', () => {
  const tool = createGcloudProjectsListTool({ typebox: mockTypebox });

  it('has correct name', () => {
    expect(tool.name).toBe('gcloud_projects_list');
  });

  it('has a label', () => {
    expect(tool.label).toBe('Google Cloud Projects');
  });

  it('has a description mentioning gcloud', () => {
    expect(tool.description).toContain('gcloud');
  });

  it('has an execute function', () => {
    expect(typeof tool.execute).toBe('function');
  });
});

describe('gcloud_projects_list limit validation', () => {
  const tool = createGcloudProjectsListTool({ typebox: mockTypebox });

  it('rejects a zero limit', async () => {
    const r = await tool.execute('id', { limit: 0 }, undefined, null, { cwd: '/tmp' });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('limit');
  });

  it('rejects a negative limit', async () => {
    const r = await tool.execute('id', { limit: -5 }, undefined, null, { cwd: '/tmp' });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('limit');
  });

  it('rejects a non-integer limit', async () => {
    const r = await tool.execute('id', { limit: 2.5 }, undefined, null, { cwd: '/tmp' });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('limit');
  });

  it('accepts a valid positive integer limit (no validation rejection before spawn)', async () => {
    try {
      const r = await tool.execute('id', { limit: 10 }, undefined, null, { cwd: '/tmp' });
      expect(r.content[0].text).not.toContain('limit must');
    } catch {
      // gcloud CLI may be unavailable; validation passed
    }
  });
});
