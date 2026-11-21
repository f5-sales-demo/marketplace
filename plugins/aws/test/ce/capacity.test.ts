import { expect, test } from 'bun:test';
import type { AwsExecApi } from '../../src/aws/exec';
import { observeStandardVcpuCapacity, observeTaggedResourceCapacity } from '../../src/ce/capacity';

function executor(page: unknown): AwsExecApi {
  return {
    async exec(_cmd, args) {
      return {
        exitCode: 0,
        stderr: '',
        stdout: JSON.stringify(
          args[1] === 'describe-instances'
            ? page
            : { InstanceTypes: [{ InstanceType: 'm5.2xlarge', VCpuInfo: { DefaultVCpus: 8 } }] },
        ),
      };
    },
  };
}
const ownership = { deploymentName: 'lab', planSha256s: [] };
test('remaining vCPU capacity includes pending usage and excludes spot', async () => {
  const result = await observeStandardVcpuCapacity(
    executor({
      Reservations: [
        {
          Instances: [
            { InstanceId: 'i-11111111', InstanceType: 'm5.2xlarge', State: { Name: 'pending' } },
            {
              InstanceId: 'i-22222222',
              InstanceType: 'm5.2xlarge',
              State: { Name: 'running' },
              InstanceLifecycle: 'spot',
            },
          ],
        },
      ],
    }),
    'us-east-1',
    24,
    ownership,
    3,
  );
  expect(result).toMatchObject({ used: 8, remaining: 16, reusableOwned: 0 });
});

test('VPC capacity counts the authenticated account and rejects a full quota before creation', async () => {
  const api: AwsExecApi = {
    async exec() {
      return {
        exitCode: 0,
        stderr: '',
        stdout: JSON.stringify({
          Vpcs: [
            { VpcId: 'vpc-11111111', OwnerId: '123456789012' },
            { VpcId: 'vpc-22222222', OwnerId: '999999999999' },
          ],
        }),
      };
    },
  };
  const scope = { deploymentName: 'lab', planSha256s: [], accountId: '123456789012' };
  expect(
    await observeTaggedResourceCapacity(api, 'us-east-1', 'describe-vpcs', 'Vpcs', 'VpcId', 1, scope),
  ).toMatchObject({ used: 1, remaining: 0 });
  await expect(
    observeTaggedResourceCapacity(api, 'us-east-1', 'describe-vpcs', 'Vpcs', 'VpcId', 1, {
      ...scope,
      accountId: undefined,
    }),
  ).rejects.toThrow('account');
});
test('partial pages, malformed usage and duplicate identities cannot establish capacity', async () => {
  for (const page of [
    { Reservations: [], NextToken: '' },
    { Reservations: [{ Instances: [{}] }] },
    {
      Reservations: [
        {
          Instances: [1, 2].map(() => ({
            InstanceId: 'i-11111111',
            InstanceType: 'm5.2xlarge',
            State: { Name: 'running' },
          })),
        },
      ],
    },
  ])
    await expect(observeStandardVcpuCapacity(executor(page), 'us-east-1', 24, ownership, 3)).rejects.toThrow();
});
