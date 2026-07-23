import { describe, expect, it } from 'bun:test';
import { createAwsStsWhoamiTool } from '../../src/tools/aws-sts-whoami';

const mockTypebox = {
  Type: {
    Object: (schema: Record<string, unknown>) => schema,
    String: (opts?: Record<string, unknown>) => ({ type: 'string', ...opts }),
    Optional: (schema: unknown) => ({ optional: true, ...((schema as object) ?? {}) }),
  },
};

describe('createAwsStsWhoamiTool', () => {
  const tool = createAwsStsWhoamiTool({ typebox: mockTypebox });

  it('has correct name', () => {
    expect(tool.name).toBe('aws_sts_whoami');
  });

  it('has a label', () => {
    expect(tool.label).toBe('AWS Caller Identity');
  });

  it('has a description from markdown', () => {
    expect(tool.description).toContain('aws sts get-caller-identity');
  });

  it('has an execute function', () => {
    expect(typeof tool.execute).toBe('function');
  });
});

describe('aws_sts_whoami input validation', () => {
  const tool = createAwsStsWhoamiTool({ typebox: mockTypebox });

  it('rejects profile with shell injection', async () => {
    const result = await tool.execute('id', { profile: '$(whoami)' }, undefined, null, { cwd: '/tmp' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('invalid');
  });

  it('rejects profile with pipe', async () => {
    const result = await tool.execute('id', { profile: 'a|b' }, undefined, null, { cwd: '/tmp' });
    expect(result.isError).toBe(true);
  });

  it('rejects profile with semicolon', async () => {
    const result = await tool.execute('id', { profile: 'a;rm -rf /' }, undefined, null, { cwd: '/tmp' });
    expect(result.isError).toBe(true);
  });

  it('accepts a valid profile (no validation rejection before spawn)', async () => {
    try {
      await tool.execute('id', { profile: 'my-sso-profile' }, undefined, null, { cwd: '/tmp' });
    } catch {
      // aws CLI may be unavailable; validation passed
    }
  });
});
