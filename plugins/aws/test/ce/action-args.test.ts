import { expect, test } from 'bun:test';
import { resolveAwsCeActionArgs } from '../../src/ce/action-args';

test('resolves generated identities once while preserving the exact borrowed key name', () => {
  const name = `__PLAN_SHA256__ __BOOTSTRAP_FILE__ \${var.key} %{if true}`;
  const args = [
    'ec2',
    'run-instances',
    `--key-name=${name}`,
    '--user-data',
    'file://__BOOTSTRAP_FILE__',
    '--tag-specifications',
    'Value=__PLAN_SHA256__',
  ];
  expect(
    resolveAwsCeActionArgs(args, { __PLAN_SHA256__: 'sealed', __BOOTSTRAP_FILE__: '/private/bootstrap' }, name),
  ).toEqual([
    'ec2',
    'run-instances',
    `--key-name=${name}`,
    '--user-data',
    'file:///private/bootstrap',
    '--tag-specifications',
    'Value=sealed',
  ]);
});
test('requires generated runtime identities to resolve before execution', () => {
  expect(() => resolveAwsCeActionArgs(['--key-name=__FOREIGN__'], {}, 'different')).toThrow('unresolved');
  expect(() => resolveAwsCeActionArgs(['__ENI_1_0__'], {})).toThrow('unresolved');
  expect(() => resolveAwsCeActionArgs(['__ENI_1_0__'], { __ENI_1_0__: '__UNRESOLVED__' })).toThrow('unresolved');
  expect(() => resolveAwsCeActionArgs(['--key-name=bad\nname'], {}, 'bad\nname')).toThrow('control');
  expect(resolveAwsCeActionArgs(['file://__BOOTSTRAP_FILE__'], {}, undefined, ['__BOOTSTRAP_FILE__'])).toEqual([
    'file://__BOOTSTRAP_FILE__',
  ]);
});
