import { expect, test } from 'bun:test';
import { presentation } from '@f5-sales-demo/xcsh/presentation';
import { presentTool } from '../src/presentation';

const options = { expanded: false, isPartial: false };
const result = (details: unknown, text = 'synthetic') => ({ content: [{ type: 'text', text }], details });
test('identity keeps every domain field and selected profile visible by default', () => {
  const view = presentTool({ name: 'aws_sts_whoami' }, presentation).presentation.result(
    result({ identity: { Account: '000000000000', Arn: 'synthetic', UserId: '' } }),
    options,
    { profile: 'example' },
  );
  expect(view.sections.find((s) => s.kind === 'fields' && s.title === 'Caller identity')).toMatchObject({
    previewFields: 'all',
    values: { Account: '000000000000', Arn: 'synthetic', UserId: '' },
  });
  expect(view.sections.find((s) => s.kind === 'code')?.argv).toEqual([
    'aws',
    'sts',
    'get-caller-identity',
    '--profile',
    'example',
    '--output',
    'json',
  ]);
});
test('EC2 preview contains twelve complete rows with readable domain columns and full expanded evidence once', () => {
  const rows = Array.from({ length: 13 }, (_, i) => ({
    instanceId: `i-${i}`,
    name: `Example ${i}`,
    state: 'running',
    type: 't3.small',
    az: 'ca-central-1a',
    privateIp: '192.0.2.1',
    publicIp: '',
  }));
  const tool = presentTool({ name: 'aws_ec2_describe_instances' }, presentation);
  const input = {
    region: 'ca-central-1',
    instanceIds: ['i-0123456789abcdef0'],
    filters: ['Name=instance-state-name,Values=running'],
  };
  const view = tool.presentation.result(result({ instances: rows }), options, input);
  expect(view.sections.find((s) => s.kind === 'table')).toMatchObject({
    previewRows: 12,
    rows,
    columns: expect.arrayContaining([
      { key: 'type', label: 'Instance type' },
      { key: 'az', label: 'Availability zone' },
    ]),
  });
  expect(view.sections.find((s) => s.kind === 'code')?.argv).toEqual([
    'aws',
    'ec2',
    'describe-instances',
    '--region',
    'ca-central-1',
    '--instance-ids',
    'i-0123456789abcdef0',
    '--filters',
    'Name=instance-state-name,Values=running',
    '--output',
    'json',
  ]);
  const expanded = tool.presentation.result(result({ instances: rows }), { ...options, expanded: true }, input);
  expect(expanded.expandedEvidence).toBe('provided');
  expect(JSON.stringify(expanded).match(/Example 12/g)).toHaveLength(1);
});
test('S3 declares bytes separately and preserves zero-size objects', () => {
  const view = presentTool({ name: 'aws_s3_ls' }, presentation).presentation.result(
    result({ objects: [{ key: 'empty', size: 0, lastModified: '' }] }),
    options,
    { target: 's3://synthetic/' },
  );
  expect(view.sections.find((s) => s.kind === 'table')).toMatchObject({
    previewRows: 12,
    columns: expect.arrayContaining([{ key: 'size', label: 'Size (bytes)', align: 'right' }]),
    rows: [{ key: 'empty', size: 0, lastModified: '' }],
  });
  expect(view.sections.find((s) => s.kind === 'code')?.argv).toEqual(['aws', 's3', 'ls', 's3://synthetic/']);
});
test('help and raw execution declare actual effective flags, complete guidance and opaque fallback', () => {
  const help = presentTool({ name: 'aws_help' }, presentation).presentation.result(
    result({ tool: 'aws_help' }, 'USAGE\naws ec2 help'),
    options,
    { command_path: 'ec2' },
  );
  expect(help.sections.find((s) => s.kind === 'code')?.argv).toEqual(['aws', 'ec2', 'help']);
  const exec = presentTool({ name: 'aws_exec' }, presentation).presentation.result(
    result({ fullOutput: '{"count":0,"enabled":false,"empty":""}' }),
    options,
    { args: ['sts', 'get-caller-identity', '--output=text'] },
  );
  expect(exec.sections.find((s) => s.kind === 'code')?.argv).toEqual([
    'aws',
    'sts',
    'get-caller-identity',
    '--output=text',
  ]);
  const failure = presentTool({ name: 'aws_sts_whoami' }, presentation).presentation.result(
    { ...result({ errorType: 'auth_required' }, 'Run exactly: xcsh plugin setup aws'), isError: true },
    options,
    {},
  );
  expect(JSON.stringify(failure)).toContain('Run exactly: xcsh plugin setup aws');
  const malformed = presentTool({ name: 'aws_ec2_describe_instances' }, presentation).presentation.result(
    result({ instances: 'malformed' }, 'literal corrective guidance'),
    options,
    {},
  );
  expect(malformed.expandedEvidence).not.toBe('provided');
  expect(malformed.completeness).not.toBe('provided');
});

test('empty and paginated results keep counts and automatic completion warnings', () => {
  const tool = presentTool({ name: 'aws_ec2_describe_instances' }, presentation);
  const empty = tool.presentation.result(result({ instances: [] }), options, {});
  expect(empty.sections.find((s) => s.kind === 'fields' && s.title === 'Results')?.values).toEqual({
    'Returned rows': 0,
  });
  const partial = tool.presentation.result(
    result({ instances: [], nextToken: 'synthetic-page' }),
    { ...options, isPartial: true },
    {},
  );
  expect(partial.warnings.join(' ')).toMatch(/stream|partial|more|page/i);
  expect(partial.completeness).not.toBe('provided');
});

test('CE summaries preserve guarded multi-command evidence without inventing a CLI invocation', () => {
  const tool = presentTool({ name: 'aws_ce_apply' }, presentation);
  const details = {
    tool: 'aws_ce_apply',
    planId: 'synthetic-plan',
    planSha256: 'synthetic-digest',
    checkpoint: { state: 'failed', completedActionIds: [], retryable: false },
  };
  const view = tool.presentation.result(result(details, '0/3 immutable actions checkpointed'), options, {});
  expect(view.sections.find((s) => s.kind === 'fields' && s.title === 'Checkpoint')).toMatchObject({
    previewFields: 'all',
    values: expect.objectContaining({ State: 'failed', 'Completed actions': 0 }),
  });
  expect(view.sections.some((s) => s.kind === 'code' && s.argv)).toBe(false);
  const expanded = tool.presentation.result(
    result(details, '0/3 immutable actions checkpointed'),
    { ...options, expanded: true },
    {},
  );
  expect(expanded.expandedEvidence).toBe('provided');
  expect(JSON.stringify(expanded)).toContain('false');
  const call = presentTool({ name: 'aws_cloud_init_analyze' }, presentation).presentation.call(
    { source: 'SYNTHETIC_PRIVATE_SOURCE', sourceArtifactId: '12' },
    { ...options, expanded: true },
  );
  expect(JSON.stringify(call)).not.toContain('SYNTHETIC_PRIVATE_SOURCE');
  expect(JSON.stringify(call)).toContain('12');
});

test('declared commands reproduce execution argv', async () => {
  const { Type } = await import('@sinclair/typebox');
  const { createAwsStsWhoamiTool } = await import('../src/tools/aws-sts-whoami');
  const { createAwsEc2DescribeInstancesTool } = await import('../src/tools/aws-ec2-describe-instances');
  const { createAwsS3LsTool } = await import('../src/tools/aws-s3-ls');
  const { createAwsHelpTool } = await import('../src/tools/aws-help');
  const { createAwsExecTool } = await import('../src/tools/aws-exec');
  const calls: string[][] = [];
  const makeApi = () => ({
    exec: async (_cmd: string, args: string[]) => {
      calls.push(args);
      return { stdout: '{}', stderr: '', exitCode: 0 };
    },
  });
  const cases = [
    [createAwsStsWhoamiTool({ typebox: { Type } }, makeApi), { profile: '   ' }],
    [
      createAwsEc2DescribeInstancesTool({ typebox: { Type } }, makeApi),
      { region: 'ca-central-1', filters: ['Name=instance-state-name,Values=running'] },
    ],
    [createAwsS3LsTool({ typebox: { Type } }, makeApi), {}],
    [createAwsHelpTool({ typebox: { Type } }, makeApi), { command_path: ' ec2  describe-instances ' }],
    [
      createAwsExecTool({ typebox: { Type } }, makeApi),
      { args: ['sts', 'get-caller-identity', '--output=text', '--query', "value || `false` | [@, '$x']"] },
    ],
  ] as const;
  for (const [tool, input] of cases) {
    await tool.execute('synthetic', input as never, undefined, undefined, { cwd: '/synthetic' });
    const argv = presentTool(tool, presentation)
      .presentation.call(input, options)
      .sections.find((s) => s.kind === 'code')?.argv;
    const executed = calls.at(-1);
    expect(executed).toBeDefined();
    if (!executed) throw new Error('Expected AWS execution arguments');
    expect(argv).toEqual(['aws', ...executed]);
  }
});

for (const shell of ['bash', 'zsh']) {
  const shellTest = Bun.which(shell) ? test : test.skip;
  shellTest(`declared commands preserve literal arguments in ${shell}`, async () => {
    const { execFileSync } = await import('node:child_process');
    const argv = [
      'synthetic-harmless',
      '',
      ' spaces ',
      "quote'",
      '"double"',
      '$x',
      '`literal`',
      '|',
      ';',
      '☁',
      'line\nbreak',
    ];
    // A shell function prints NUL-separated arguments and never invokes a cloud CLI.
    const command = presentation.command(argv).text;
    const bytes = execFileSync(shell, ['-c', `synthetic-harmless() { printf '%s\\0' "$@"; }; ${command}`]);
    expect(bytes.toString().split('\0').slice(0, -1)).toEqual(argv.slice(1));
  });
}

test('expanded CE calls withhold plural bootstrap references', () => {
  const view = presentTool({ name: 'aws_ce_apply' }, presentation).presentation.call(
    { planId: 'synthetic', bootstrapRefs: { node: 'SYNTHETIC_SECRET_SENTINEL' } },
    { ...options, expanded: true },
  );
  expect(JSON.stringify(view)).not.toContain('SYNTHETIC_SECRET_SENTINEL');
  expect(JSON.stringify(view)).toContain('synthetic');
});
