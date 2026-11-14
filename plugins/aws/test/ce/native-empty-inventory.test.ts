import { expect, test } from 'bun:test';
import type { AwsExecApi } from '../../src/aws/exec';
import { collectAwsNativeEmptyCloudInventory } from '../../src/ce/native-empty-inventory';
import type { AwsCePlan } from '../../src/ce/types';

const plan = {
  engine: 'native',
  accountId: '123456789012',
  partition: 'aws',
  region: 'us-east-1',
  deploymentName: 'ce-test',
  intent: { operation: 'teardown' },
} as AwsCePlan;
const digest = 'a'.repeat(64);
const ownerTags = [
  { Key: 'xcsh-managed-by', Value: 'aws-ce' },
  { Key: 'xcsh-deployment-id', Value: 'ce-test' },
  { Key: 'xcsh-execution-engine', Value: 'native' },
  { Key: 'xcsh-plan-sha256', Value: digest },
];
function api(reply?: (args: string[], count: number) => unknown) {
  const calls: string[][] = [];
  const value: AwsExecApi = {
    exec: async (command, args) => {
      expect(command).toBe('aws');
      expect(args).toContain('--no-paginate');
      expect(args[args.indexOf('--region') + 1]).toBe('us-east-1');
      calls.push(args);
      const custom = reply?.(args, calls.length);
      const body =
        custom ??
        (args[0] === 'sts'
          ? { Account: '123456789012', Arn: 'arn:aws:sts::123456789012:assumed-role/demo/test' }
          : args[0] === 'ec2'
            ? { Tags: [] }
            : { ResourceTagMappingList: [], PaginationToken: '' });
      return { exitCode: 0, stderr: '', stdout: JSON.stringify(body) };
    },
  };
  return { api: value, calls };
}
test('empty native retirement requires authenticated complete EC2 and regional tagging evidence', async () => {
  const f = api();
  const result = await collectAwsNativeEmptyCloudInventory(f.api, plan, [digest]);
  expect(result.status).toBe('absent');
  expect(f.calls.map((r) => r.slice(0, 2))).toEqual([
    ['sts', 'get-caller-identity'],
    ['ec2', 'describe-tags'],
    ['resourcegroupstaggingapi', 'get-resources'],
  ]);
});
test('owned EC2 resources are pending and join complete immutable owner tags', async () => {
  const id = 'eni-12345678';
  let ec2 = 0;
  const f = api((args) =>
    args[0] === 'ec2'
      ? ++ec2 === 1
        ? { Tags: [{ ResourceId: id, ResourceType: 'network-interface', Key: 'xcsh-deployment-id', Value: 'ce-test' }] }
        : { Tags: ownerTags.map((t) => ({ ...t, ResourceId: id, ResourceType: 'network-interface' })) }
      : undefined,
  );
  const r = await collectAwsNativeEmptyCloudInventory(f.api, plan, [digest]);
  expect(r.status).toBe('pending');
  expect(r.remainingResourceIds).toEqual([id]);
});
test('regional tagged load balancer remains pending through complete pagination', async () => {
  let page = 0;
  const arn = 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/net/ce/1234';
  const f = api((args) =>
    args[0] === 'resourcegroupstaggingapi'
      ? ++page === 1
        ? { ResourceTagMappingList: [{ ResourceARN: arn, Tags: ownerTags }], PaginationToken: 'next' }
        : { ResourceTagMappingList: [], PaginationToken: '' }
      : undefined,
  );
  const r = await collectAwsNativeEmptyCloudInventory(f.api, plan, [digest]);
  expect(r.status).toBe('pending');
  expect(page).toBe(2);
  expect(f.calls.at(-1)).toContain('--pagination-token');
});
for (const wrong of [{ Account: '999999999999' }, { Arn: 'arn:aws-cn:sts::123456789012:assumed-role/demo/test' }])
  test(`foreign account/partition rejects ${Object.keys(wrong)[0]}`, async () => {
    const f = api((args) =>
      args[0] === 'sts'
        ? { Account: '123456789012', Arn: 'arn:aws:sts::123456789012:assumed-role/demo/test', ...wrong }
        : undefined,
    );
    await expect(collectAwsNativeEmptyCloudInventory(f.api, plan, [digest])).rejects.toThrow('account or partition');
    expect(f.calls.length).toBe(1);
  });
for (const state of [
  'missing-list',
  'duplicate-identity',
  'pagination-loop',
  'foreign-region',
  'foreign-owner',
  'duplicate-tags',
] as const)
  test(`native absence rejects ${state}`, async () => {
    const arn = 'arn:aws:ec2:us-east-1:123456789012:network-interface/eni-12345678';
    const f = api((args) => {
      if (args[0] === 'ec2') {
        if (state === 'missing-list') return {};
        if (state === 'pagination-loop') return { Tags: [], NextToken: 'same' };
        if (state === 'duplicate-identity') {
          const row = {
            ResourceId: 'eni-12345678',
            ResourceType: 'network-interface',
            Key: 'xcsh-deployment-id',
            Value: 'ce-test',
          };
          return { Tags: [row, row] };
        }
      }
      if (args[0] === 'resourcegroupstaggingapi')
        return {
          ResourceTagMappingList: [
            {
              ResourceARN: state === 'foreign-region' ? arn.replace('us-east-1', 'us-west-2') : arn,
              Tags:
                state === 'foreign-owner'
                  ? ownerTags.map((t) => (t.Key === 'xcsh-execution-engine' ? { ...t, Value: 'terraform' } : t))
                  : state === 'duplicate-tags'
                    ? [...ownerTags, ownerTags[0]]
                    : ownerTags,
            },
          ],
          PaginationToken: '',
        };
    });
    await expect(collectAwsNativeEmptyCloudInventory(f.api, plan, [digest])).rejects.toThrow();
  });
test('unavailable service and malformed parser data do not fabricate absence or disclose data', async () => {
  const unavailable: AwsExecApi = { exec: async () => ({ exitCode: 1, stdout: '', stderr: 'private-error-context' }) };
  await expect(collectAwsNativeEmptyCloudInventory(unavailable, plan, [digest])).rejects.toThrow('unavailable');
  const malformed: AwsExecApi = {
    exec: async () => ({ exitCode: 0, stdout: '{"private":"parser-secret', stderr: '' }),
  };
  let caught: unknown;
  try {
    await collectAwsNativeEmptyCloudInventory(malformed, plan, [digest]);
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(Error);
  expect(String(caught)).not.toContain('parser-secret');
});
