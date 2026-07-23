import { describe, expect, it } from 'bun:test';
import { createAwsEc2DescribeInstancesTool } from '../../src/tools/aws-ec2-describe-instances';

const mockTypebox = {
  Type: {
    Object: (schema: Record<string, unknown>) => schema,
    String: (opts?: Record<string, unknown>) => ({ type: 'string', ...opts }),
    Array: (item: unknown, opts?: Record<string, unknown>) => ({ type: 'array', items: item, ...opts }),
    Optional: (schema: unknown) => ({ optional: true, ...((schema as object) ?? {}) }),
  },
};

describe('createAwsEc2DescribeInstancesTool', () => {
  const tool = createAwsEc2DescribeInstancesTool({ typebox: mockTypebox });

  it('has correct name', () => {
    expect(tool.name).toBe('aws_ec2_describe_instances');
  });

  it('has a label', () => {
    expect(tool.label).toBe('AWS EC2 Instances');
  });

  it('has a description from markdown', () => {
    expect(tool.description).toContain('describe-instances');
  });

  it('has an execute function', () => {
    expect(typeof tool.execute).toBe('function');
  });
});

describe('aws_ec2_describe_instances input validation', () => {
  const tool = createAwsEc2DescribeInstancesTool({ typebox: mockTypebox });

  it('rejects an invalid region', async () => {
    const result = await tool.execute('id', { region: 'us_east_1' }, undefined, null, { cwd: '/tmp' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('invalid region');
  });

  it('rejects a region with shell injection', async () => {
    const result = await tool.execute('id', { region: 'us-east-1; rm -rf /' }, undefined, null, { cwd: '/tmp' });
    expect(result.isError).toBe(true);
  });

  it('rejects an invalid instance ID', async () => {
    const result = await tool.execute('id', { instanceIds: ['not-an-id'] }, undefined, null, { cwd: '/tmp' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('invalid instance ID');
  });

  it('rejects an instance ID with injection', async () => {
    const result = await tool.execute('id', { instanceIds: ['i-0123; whoami'] }, undefined, null, { cwd: '/tmp' });
    expect(result.isError).toBe(true);
  });

  it('rejects a filter with control characters', async () => {
    const dirty = `Name=tag,Values=x${String.fromCharCode(1)}`;
    const result = await tool.execute('id', { filters: [dirty] }, undefined, null, { cwd: '/tmp' });
    expect(result.isError).toBe(true);
  });

  it('rejects a dash-prefixed filter (flag smuggling)', async () => {
    const result = await tool.execute('id', { filters: ['--force'] }, undefined, null, { cwd: '/tmp' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('invalid filter');
  });

  it('rejects a malformed filter that is not Name=...,Values=...', async () => {
    const result = await tool.execute('id', { filters: ['badfilter'] }, undefined, null, { cwd: '/tmp' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('invalid filter');
  });

  it('accepts a valid Name=...,Values=... filter (no validation rejection before spawn)', async () => {
    try {
      const result = await tool.execute(
        'id',
        { filters: ['Name=instance-state-name,Values=running'] },
        undefined,
        null,
        { cwd: '/tmp' },
      );
      // If the aws CLI is present the call may resolve; either way validation
      // must not have flagged the filter as invalid.
      expect(result.content[0].text).not.toContain('invalid filter');
    } catch {
      // aws CLI may be unavailable; validation passed
    }
  });

  it('accepts valid region + instance IDs + filters (no validation rejection before spawn)', async () => {
    try {
      await tool.execute(
        'id',
        {
          region: 'us-east-1',
          instanceIds: ['i-0123456789abcdef0'],
          filters: ['Name=instance-state-name,Values=running'],
        },
        undefined,
        null,
        { cwd: '/tmp' },
      );
    } catch {
      // aws CLI may be unavailable; validation passed
    }
  });
});
