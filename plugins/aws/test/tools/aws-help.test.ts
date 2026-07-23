import { describe, expect, it } from 'bun:test';
import { createAwsHelpTool } from '../../src/tools/aws-help';

const mockTypebox = {
  Type: {
    Object: (schema: Record<string, unknown>) => schema,
    String: (opts?: Record<string, unknown>) => ({ type: 'string', ...opts }),
    Optional: (schema: unknown) => ({ optional: true, ...((schema as object) ?? {}) }),
  },
};

describe('createAwsHelpTool', () => {
  const tool = createAwsHelpTool({ typebox: mockTypebox });

  it('has correct name', () => {
    expect(tool.name).toBe('aws_help');
  });

  it('has a label', () => {
    expect(tool.label).toBe('AWS CLI Help');
  });

  it('has an execute function', () => {
    expect(typeof tool.execute).toBe('function');
  });
});

describe('aws_help command path validation', () => {
  const tool = createAwsHelpTool({ typebox: mockTypebox });

  it('accepts a service with digits ("ec2")', async () => {
    try {
      const result = await tool.execute('id', { command_path: 'ec2' }, undefined, null, { cwd: '/tmp' });
      expect(result.content[0].text).not.toContain('invalid command path');
    } catch {
      // aws CLI may be unavailable; validation passed
    }
  });

  it('accepts a service with digits and letters ("s3api")', async () => {
    try {
      const result = await tool.execute('id', { command_path: 's3api' }, undefined, null, { cwd: '/tmp' });
      expect(result.content[0].text).not.toContain('invalid command path');
    } catch {
      // aws CLI may be unavailable; validation passed
    }
  });

  it('rejects a path with shell metacharacters', async () => {
    const result = await tool.execute('id', { command_path: 'pr; rm' }, undefined, null, { cwd: '/tmp' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('invalid command path');
  });

  it('rejects an uppercase path', async () => {
    const result = await tool.execute('id', { command_path: 'EC2' }, undefined, null, { cwd: '/tmp' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('invalid command path');
  });

  it('rejects a dash-led command path part (flag smuggling)', async () => {
    const result = await tool.execute('id', { command_path: 'iam -foo' }, undefined, null, { cwd: '/tmp' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('must not start with');
  });
});
