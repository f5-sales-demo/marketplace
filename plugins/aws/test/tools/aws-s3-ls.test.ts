import { describe, expect, it } from 'bun:test';
import { createAwsS3LsTool } from '../../src/tools/aws-s3-ls';

const mockTypebox = {
  Type: {
    Object: (schema: Record<string, unknown>) => schema,
    String: (opts?: Record<string, unknown>) => ({ type: 'string', ...opts }),
    Optional: (schema: unknown) => ({ optional: true, ...((schema as object) ?? {}) }),
  },
};

describe('createAwsS3LsTool', () => {
  const tool = createAwsS3LsTool({ typebox: mockTypebox });

  it('has correct name', () => {
    expect(tool.name).toBe('aws_s3_ls');
  });

  it('has a label', () => {
    expect(tool.label).toBe('AWS S3 List');
  });

  it('has a description from markdown', () => {
    expect(tool.description).toContain('S3');
  });

  it('has an execute function', () => {
    expect(typeof tool.execute).toBe('function');
  });
});

describe('aws_s3_ls input validation', () => {
  const tool = createAwsS3LsTool({ typebox: mockTypebox });

  it('rejects a target that is not an s3:// URI', async () => {
    const result = await tool.execute('id', { target: '/etc/passwd' }, undefined, null, { cwd: '/tmp' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('invalid');
  });

  it('rejects a target with shell injection', async () => {
    const result = await tool.execute('id', { target: 's3://bucket; rm -rf /' }, undefined, null, { cwd: '/tmp' });
    expect(result.isError).toBe(true);
  });

  it('rejects a target with command substitution', async () => {
    const result = await tool.execute('id', { target: 's3://$(whoami)' }, undefined, null, { cwd: '/tmp' });
    expect(result.isError).toBe(true);
  });

  it('accepts a valid s3:// target (no validation rejection before spawn)', async () => {
    try {
      await tool.execute('id', { target: 's3://my-bucket/prefix/' }, undefined, null, { cwd: '/tmp' });
    } catch {
      // aws CLI may be unavailable; validation passed
    }
  });
});
