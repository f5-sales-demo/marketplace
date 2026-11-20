import { expect, test } from 'bun:test';
import { observeAzureHealth } from '../../src/ce/health-observation';

const cloudScope = '/subscriptions/example-subscription/resourceGroups/example-group';
const vmId = `${cloudScope}/providers/Microsoft.Compute/virtualMachines/example-ce-1`;
const nicId = `${cloudScope}/providers/Microsoft.Network/networkInterfaces/example-ce-1-nic0`;
const plan = {
  subscription: { id: 'example-subscription' },
  intent: { resourceGroup: 'example-group' },
  deploymentName: 'example-ce',
  siteName: 'example-site',
  nics: [{ role: 'slo' }],
} as any;
const vm = {
  id: vmId,
  vmId: 'example-instance',
  provisioningState: 'Succeeded',
  tags: { 'xcsh-managed-by': 'azure-ce', 'xcsh-deployment-id': 'example-ce' },
  networkProfile: { networkInterfaces: [{ id: nicId }] },
};
const nic = {
  id: nicId,
  macAddress: '02-00-00-00-00-01',
  virtualMachine: { id: vmId },
  tags: { 'xcsh-deployment-id': 'example-ce' },
};
test('probe admission supplies measured Azure instance and NIC identity to F5', async () => {
  const api = {
    exec: async (_command: string, args: string[]) => ({
      exitCode: 0,
      stderr: '',
      stdout: JSON.stringify(args[0] === 'vm' ? vm : nic),
    }),
  };
  let observed: any;
  const result = await observeAzureHealth(
    plan,
    1,
    api,
    { XCSH_API_URL: 'https://tenant.example.test', XCSH_API_TOKEN: 'example' },
    async (expected) => {
      observed = expected;
      return { status: 'ready-for-probe', operationalServices: 'unknown' };
    },
  );
  expect(observed).toEqual({
    siteName: 'example-site',
    hostname: 'example-ce-1',
    instanceId: 'example-instance',
    mac: '02:00:00:00:00:01',
  });
  expect(result.status).toBe('ready-for-probe');
});
test('a substituted NIC or VM prevents any F5 admission request', async () => {
  let calls = 0;
  const api = {
    exec: async (_command: string, args: string[]) => ({
      exitCode: 0,
      stderr: '',
      stdout: JSON.stringify(args[0] === 'vm' ? vm : { ...nic, virtualMachine: { id: '/foreign-vm' } }),
    }),
  };
  const result = await observeAzureHealth(
    plan,
    1,
    api,
    { XCSH_API_URL: 'https://tenant.example.test', XCSH_API_TOKEN: 'example' },
    async () => {
      calls++;
      return { status: 'ready-for-probe' };
    },
  );
  expect(result.status).toBe('unknown');
  expect(calls).toBe(0);
});
