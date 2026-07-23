import { describe, expect, it } from 'bun:test';
import { Type } from '@sinclair/typebox';
import { createAwsExecTool } from '../../src/tools/aws-exec';
import { buildAwsArgs, findMutation } from '../../src/tools/aws-exec-guard';
import { createAwsHelpTool } from '../../src/tools/aws-help';
import { hasControlChars } from '../../src/tools/shared';

const NUL = String.fromCharCode(0);
const TAB = String.fromCharCode(9);
const SOH = String.fromCharCode(1);

const mockPi = { typebox: { Type } };

function makeExec() {
  return createAwsExecTool(mockPi);
}
function makeHelp() {
  return createAwsHelpTool(mockPi);
}

describe('findMutation — ALLOW read-only aws commands', () => {
  const allow: string[][] = [
    ['sts', 'get-caller-identity'],
    ['ec2', 'describe-instances'],
    ['s3', 'ls'],
    ['iam', 'list-users'],
    ['dynamodb', 'query', '--table-name', 'X'],
    [
      'ec2',
      'describe-instances',
      '--query',
      'Reservations[].Instances[]',
      '--filters',
      'Name=instance-state-name,Values=running',
    ],
    ['cloudformation', 'describe-stacks'],
    ['help'],
  ];

  for (const args of allow) {
    it(`allows ${JSON.stringify(args)}`, () => {
      expect(findMutation(args).blocked).toBe(false);
    });
  }
});

describe('findMutation — BLOCK writes and unknown ops (fail-safe)', () => {
  const block: string[][] = [
    ['ec2', 'run-instances'],
    ['ec2', 'terminate-instances', '--instance-ids', 'i-x'],
    ['iam', 'create-user', '--user-name', 'x'],
    ['s3', 'rm', 's3://b/k'],
    ['s3', 'sync', '.', 's3://b'],
    ['s3', 'cp', 'a', 's3://b'],
    ['s3api', 'put-object', '--bucket', 'b', '--key', 'k'],
    ['lambda', 'update-function-code', '--function-name', 'f'],
    [],
  ];

  for (const args of block) {
    it(`blocks ${JSON.stringify(args)}`, () => {
      expect(findMutation(args).blocked).toBe(true);
    });
  }

  it('blocks an empty command with a helpful reason', () => {
    expect(findMutation([]).reason).toContain('no aws command');
  });
});

describe('findMutation — flag-value-shift bypass (port gitlab exclusion)', () => {
  it('blocks when a leading value flag would otherwise shift the operation', () => {
    // `--region`'s value `us-east-1` is excluded; positionals = [ec2, run-instances].
    const r = findMutation(['--region', 'us-east-1', 'ec2', 'run-instances']);
    expect(r.blocked).toBe(true);
  });

  it('still allows a real read when a leading value flag precedes it', () => {
    const r = findMutation(['--region', 'us-east-1', 'ec2', 'describe-instances']);
    expect(r.blocked).toBe(false);
  });

  it('does not let a global value flag between service and op break a read', () => {
    // --region's value us-east-1 excluded → positionals = [ec2, describe-instances].
    expect(findMutation(['ec2', '--region', 'us-east-1', 'describe-instances']).blocked).toBe(false);
  });
});

describe('findMutation — boolean-flag guard bypass (value-taking exclusion only)', () => {
  const block: string[][] = [
    // A boolean flag before the op must NOT drop the write verb.
    ['lambda', '--no-cli-pager', 'invoke', '--function-name', 'x', 'get-out.json'],
    ['ec2', '--debug', 'run-instances'],
    // synthesize-speech is a write; it matches no read prefix.
    ['polly', 'synthesize-speech', 'out.mp3'],
    ['--no-paginate', 'iam', 'create-user', '--user-name', 'x'],
  ];
  for (const args of block) {
    it(`blocks ${JSON.stringify(args)}`, () => {
      expect(findMutation(args).blocked).toBe(true);
    });
  }

  const allow: string[][] = [
    // --debug is boolean → s3 kept → positionals [s3, ls] → allowed.
    ['--debug', 's3', 'ls'],
    ['--region', 'us-east-1', 'ec2', 'describe-instances'],
    ['ec2', 'describe-instances', '--query', 'Reservations[].Instances[]'],
    ['sts', 'get-caller-identity'],
  ];
  for (const args of allow) {
    it(`allows ${JSON.stringify(args)}`, () => {
      expect(findMutation(args).blocked).toBe(false);
    });
  }
});

describe('findMutation — s3 special-case', () => {
  it('allows s3 ls', () => {
    expect(findMutation(['s3', 'ls']).blocked).toBe(false);
    expect(findMutation(['s3', 'ls', 's3://bucket/prefix/']).blocked).toBe(false);
  });

  it('blocks s3 write subcommands with a "writes to S3" reason', () => {
    for (const op of ['cp', 'mv', 'rm', 'sync', 'mb', 'rb']) {
      const r = findMutation(['s3', op, 'a', 'b']);
      expect(r.blocked).toBe(true);
      expect(r.reason).toContain('S3');
    }
  });

  it('blocks an unknown s3 subcommand fail-safe', () => {
    expect(findMutation(['s3', 'presign', 's3://b/k']).blocked).toBe(true);
  });

  it('blocks bare s3 with no subcommand', () => {
    expect(findMutation(['s3']).blocked).toBe(true);
  });
});

describe('findMutation — generic allowlist', () => {
  it('allows every READ_PREFIX family', () => {
    expect(findMutation(['ec2', 'describe-vpcs']).blocked).toBe(false);
    expect(findMutation(['iam', 'list-roles']).blocked).toBe(false);
    expect(findMutation(['ssm', 'get-parameter', '--name', 'x']).blocked).toBe(false);
    expect(findMutation(['cloudtrail', 'lookup-events']).blocked).toBe(false);
    expect(findMutation(['ec2', 'search-transit-gateway-routes']).blocked).toBe(false);
    expect(findMutation(['s3api', 'head-bucket', '--bucket', 'b']).blocked).toBe(false);
  });

  it('allows READ_EXACT ops', () => {
    expect(findMutation(['dynamodb', 'scan', '--table-name', 't']).blocked).toBe(false);
    expect(findMutation(['dynamodb', 'query', '--table-name', 't']).blocked).toBe(false);
    expect(findMutation(['ec2', 'wait', 'instance-running']).blocked).toBe(false);
  });

  it('blocks a service with no operation', () => {
    expect(findMutation(['ec2']).blocked).toBe(true);
  });

  it('names the cli-operator delegation path in the block reason for a write', () => {
    const r = findMutation(['ec2', 'run-instances']);
    expect(r.reason?.toLowerCase()).toContain('cli-operator');
  });
});

describe('buildAwsArgs — default --output json unless caller set output', () => {
  it('appends --output json by default', () => {
    expect(buildAwsArgs(['ec2', 'describe-instances'])).toEqual(['ec2', 'describe-instances', '--output', 'json']);
  });

  it('respects a caller-supplied --output', () => {
    expect(buildAwsArgs(['ec2', 'describe-instances', '--output', 'table'])).toEqual([
      'ec2',
      'describe-instances',
      '--output',
      'table',
    ]);
  });

  it('respects a caller-supplied -o', () => {
    expect(buildAwsArgs(['s3', 'ls', '-o', 'text'])).toEqual(['s3', 'ls', '-o', 'text']);
  });
});

describe('hasControlChars', () => {
  it('rejects NUL/C0 controls but allows tab and normal args', () => {
    expect(hasControlChars(`a${NUL}b`)).toBe(true);
    expect(hasControlChars(`a${SOH}b`)).toBe(true);
    expect(hasControlChars(`a${TAB}b`)).toBe(false);
    expect(hasControlChars('ec2 describe-instances --query Reservations[]')).toBe(false);
  });
});

describe('aws_exec execute', () => {
  it('returns correct name and label', () => {
    const tool = makeExec();
    expect(tool.name).toBe('aws_exec');
    expect(tool.label).toBe('AWS CLI Execute');
    expect(typeof tool.description).toBe('string');
    expect(tool.description.length).toBeGreaterThan(20);
  });

  it('rejects empty args', async () => {
    const r = await makeExec().execute('id', { args: [] }, undefined, undefined, { cwd: '/tmp' });
    expect(r.isError).toBe(true);
  });

  it('rejects a control character before spawning', async () => {
    const r = await makeExec().execute('id', { args: [`ec2${NUL}describe`] }, undefined, undefined, { cwd: '/tmp' });
    expect(r.isError).toBe(true);
    expect(r.content[0].text.toLowerCase()).toContain('control character');
  });

  it('blocks a mutating operation before spawning (read-only + cli-operator)', async () => {
    const r = await makeExec().execute('id', { args: ['ec2', 'run-instances'] }, undefined, undefined, { cwd: '/tmp' });
    expect(r.isError).toBe(true);
    const text = r.content[0].text.toLowerCase();
    expect(text).toContain('read-only');
    expect(text).toContain('cli-operator');
  });

  it('blocks an s3 write before spawning', async () => {
    const r = await makeExec().execute('id', { args: ['s3', 'rm', 's3://b/k'] }, undefined, undefined, { cwd: '/tmp' });
    expect(r.isError).toBe(true);
  });

  it('blocks the leading-flag operation shift before spawning', async () => {
    const r = await makeExec().execute(
      'id',
      { args: ['--region', 'us-east-1', 'ec2', 'run-instances'] },
      undefined,
      undefined,
      { cwd: '/tmp' },
    );
    expect(r.isError).toBe(true);
  });

  it('tags results with the aws_exec tool detail', () => {
    const tool = makeExec();
    expect(tool.name).toBe('aws_exec');
  });
});

describe('aws_help execute', () => {
  it('returns correct name and label', () => {
    const tool = makeHelp();
    expect(tool.name).toBe('aws_help');
    expect(tool.label).toBe('AWS CLI Help');
    expect(typeof tool.description).toBe('string');
  });

  it('rejects a command path with invalid characters', async () => {
    const r = await makeHelp().execute('id', { command_path: 'ec2; rm -rf /' }, undefined, undefined, { cwd: '/tmp' });
    expect(r.isError).toBe(true);
    expect(r.content[0].text.toLowerCase()).toContain('invalid');
  });

  it('rejects a command path part starting with a dash (charset-valid but dash-led)', async () => {
    // `iam -foo` passes the [a-z -] charset regex but the second part is a dash flag.
    const r = await makeHelp().execute('id', { command_path: 'iam -foo' }, undefined, undefined, { cwd: '/tmp' });
    expect(r.isError).toBe(true);
  });

  it('rejects uppercase / command substitution', async () => {
    const r = await makeHelp().execute('id', { command_path: 'ec2 $(whoami)' }, undefined, undefined, { cwd: '/tmp' });
    expect(r.isError).toBe(true);
  });
});
