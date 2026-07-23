import { describe, expect, it } from 'bun:test';
import { createGcloudConfigListTool } from '../../src/tools/gcloud-config-list';

const mockTypebox = {
  Type: {
    Object: (schema: Record<string, unknown>) => schema,
    String: (opts?: Record<string, unknown>) => ({ type: 'string', ...opts }),
    Optional: (schema: unknown) => ({ optional: true, ...((schema as object) ?? {}) }),
  },
};

describe('createGcloudConfigListTool metadata', () => {
  const tool = createGcloudConfigListTool({ typebox: mockTypebox });

  it('has correct name', () => {
    expect(tool.name).toBe('gcloud_config_list');
  });

  it('has a label', () => {
    expect(tool.label).toBe('Google Cloud Config');
  });

  it('has a description mentioning gcloud', () => {
    expect(tool.description).toContain('gcloud');
  });

  it('has an execute function', () => {
    expect(typeof tool.execute).toBe('function');
  });
});
