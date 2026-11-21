import { expect, test } from 'bun:test';
import { collectAwsCeInventory } from '../../src/ce/inventory';

const input = { accountId: '123456789012', awsProfile: 'ce-profile', regions: ['us-east-1'] };
const instanceId = 'i-0123456789abcdef0';
const eniId = 'eni-0123456789abcdef0';
const instance = {
  InstanceId: instanceId,
  State: { Name: 'running' },
  Tags: [
    { Key: 'ves-io-site-name', Value: 'site-a' },
    { Key: 'xcsh-managed-by', Value: 'aws-ce' },
    { Key: 'xcsh-deployment-id', Value: 'demo' },
    { Key: 'xcsh-execution-engine', Value: 'terraform' },
    { Key: 'xcsh-plan-sha256', Value: 'a'.repeat(64) },
  ],
  NetworkInterfaces: [{ NetworkInterfaceId: eniId, MacAddress: 'aa:bb:cc:dd:ee:ff' }],
};
const eni = {
  NetworkInterfaceId: eniId,
  Attachment: { InstanceId: instanceId, DeviceIndex: 0 },
  MacAddress: 'aa:bb:cc:dd:ee:ff',
  SubnetId: 'subnet-0123456789abcdef0',
  VpcId: 'vpc-0123456789abcdef0',
  Description: 'PRIVATE_DATA',
};
function fixture(overrides: Record<string, unknown> = {}) {
  const calls: string[][] = [];
  return {
    calls,
    api: {
      exec: async (_command: string, args: string[]) => {
        calls.push(args);
        let raw: unknown;
        if (args[0] === 'sts') raw = { Account: input.accountId };
        else if (args[1] === 'describe-instances')
          raw = args.includes('--next-token')
            ? { Reservations: [{ Instances: [instance] }] }
            : {
                Reservations: [
                  {
                    Instances: [
                      { InstanceId: 'i-11111111111111111', State: { Name: 'running' }, NetworkInterfaces: [] },
                    ],
                  },
                ],
                NextToken: 'page-two',
              };
        else raw = { NetworkInterfaces: [eni] };
        if (Object.hasOwn(overrides, args[1])) raw = overrides[args[1]];
        return { exitCode: 0, stderr: '', stdout: JSON.stringify(raw) };
      },
    },
  };
}
test('counts instances across all reservations/pages and preserves exact engine and interface correlation', async () => {
  const { api, calls } = fixture();
  const result = await collectAwsCeInventory(input, api);
  expect(result.counts).toEqual({ instances: 1, interfaces: 1 });
  expect(result.nodes[0].engine).toBe('terraform');
  expect(result.nodes[0].interfaces[0].correlation).toBe('instance-attachment-and-mac');
  expect(result.nodes[0].platformHealth).toBe('unknown');
  expect(JSON.stringify(result)).not.toContain('PRIVATE_DATA');
  expect(calls.every((args) => args.includes('ce-profile'))).toBe(true);
  expect(calls.some((args) => args.includes('page-two'))).toBe(true);
});
test('rejects wrong identity, repeated pagination, duplicate resources and conflicting MAC bindings', async () => {
  for (const overrides of [
    { 'get-caller-identity': { Account: '000000000000' } },
    { 'describe-instances': { Reservations: [], NextToken: 'repeated' } },
    { 'describe-network-interfaces': { NetworkInterfaces: [eni, eni] } },
    { 'describe-network-interfaces': { NetworkInterfaces: [{ ...eni, MacAddress: 'aa:aa:aa:aa:aa:aa' }] } },
  ])
    await expect(collectAwsCeInventory(input, fixture(overrides).api)).rejects.toThrow();
});
test('unavailable ENI evidence remains unknown, never a fabricated interface identity', async () => {
  const result = await collectAwsCeInventory(
    input,
    fixture({ 'describe-network-interfaces': { NetworkInterfaces: [] } }).api,
  );
  expect(result.nodes[0].interfaces[0]).toEqual({ id: eniId, correlation: 'unavailable' });
});
