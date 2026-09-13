import { expect, test } from 'bun:test';
import { associateAwsCeEip } from '../../src/ce/eip-association';
import type { AwsCePlan } from '../../src/ce/types';

function fixture() {
  const plan = { deploymentName: 'ce', engine: 'native', planSha256: 'digest', region: 'ca-west-1' } as AwsCePlan;
  const args = [
    'ec2',
    'associate-address',
    '--allocation-id',
    'eipalloc-12345678',
    '--network-interface-id',
    'eni-12345678',
  ];
  const address: Record<string, unknown> = {
    AllocationId: 'eipalloc-12345678',
    Tags: Object.entries({
      'xcsh-managed-by': 'aws-ce',
      'xcsh-deployment-id': 'ce',
      'xcsh-execution-engine': 'native',
      'xcsh-plan-sha256': 'digest',
    }).map(([Key, Value]) => ({ Key, Value })),
  };
  let writes = 0;
  const api = {
    async exec(_command: string, args: string[]) {
      if (args[1] === 'associate-address') {
        expect(args).toContain('--no-allow-reassociation');
        writes++;
        address.AssociationId = 'eipassoc-12345678';
        address.NetworkInterfaceId = 'eni-12345678';
        throw new Error('response lost');
      }
      return { exitCode: 0, stderr: '', stdout: JSON.stringify({ Addresses: [address] }) };
    },
  };
  return { address, run: () => associateAwsCeEip(api, plan, args), writes: () => writes };
}
test('reconciles a successful association with lost response and does not associate again', async () => {
  const f = fixture();
  expect(JSON.parse((await f.run()).stdout).AssociationId).toBe('eipassoc-12345678');
  await f.run();
  expect(f.writes()).toBe(1);
});
test('refuses foreign ownership or remapping an existing association', async () => {
  const foreign = fixture();
  foreign.address.Tags = [];
  await expect(foreign.run()).rejects.toThrow('ownership');
  expect(foreign.writes()).toBe(0);
  const mapped = fixture();
  mapped.address.AssociationId = 'eipassoc-12345678';
  mapped.address.NetworkInterfaceId = 'eni-87654321';
  await expect(mapped.run()).rejects.toThrow('another target');
  expect(mapped.writes()).toBe(0);
});
