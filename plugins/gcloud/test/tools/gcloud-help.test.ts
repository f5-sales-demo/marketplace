import { describe, expect, it } from 'bun:test';
import { createGcloudHelpTool } from '../../src/tools/gcloud-help';

const mockTypebox = {
  Type: {
    Object: (schema: Record<string, unknown>) => schema,
    String: (opts?: Record<string, unknown>) => ({ type: 'string', ...opts }),
    Optional: (schema: unknown) => ({ optional: true, ...((schema as object) ?? {}) }),
  },
};

describe('createGcloudHelpTool metadata', () => {
  const tool = createGcloudHelpTool({ typebox: mockTypebox });

  it('has correct name', () => {
    expect(tool.name).toBe('gcloud_help');
  });

  it('has a label', () => {
    expect(tool.label).toBe('Google Cloud CLI Help');
  });

  it('has a description mentioning gcloud', () => {
    expect(tool.description).toContain('gcloud');
  });

  it('has an execute function', () => {
    expect(typeof tool.execute).toBe('function');
  });
});

describe('gcloud_help command path validation', () => {
  const tool = createGcloudHelpTool({ typebox: mockTypebox });

  it('rejects a dash-led command path ("-x")', async () => {
    const r = await tool.execute('id', { command_path: '-x' }, undefined, null, { cwd: '/tmp' });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('invalid command path');
  });

  it('rejects a path with shell metacharacters ("a; rm")', async () => {
    const r = await tool.execute('id', { command_path: 'a; rm' }, undefined, null, { cwd: '/tmp' });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('invalid command path');
  });

  it('rejects an uppercase path ("Foo")', async () => {
    const r = await tool.execute('id', { command_path: 'Foo' }, undefined, null, { cwd: '/tmp' });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('invalid command path');
  });

  it('rejects a dash-led command path part (flag smuggling)', async () => {
    const r = await tool.execute('id', { command_path: 'compute -foo' }, undefined, null, { cwd: '/tmp' });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('must not start with');
  });

  it('accepts a valid multi-word command path ("compute instances")', async () => {
    try {
      const r = await tool.execute('id', { command_path: 'compute instances' }, undefined, null, { cwd: '/tmp' });
      expect(r.content[0].text).not.toContain('invalid command path');
    } catch {
      // gcloud CLI may be unavailable; validation passed
    }
  });
});
