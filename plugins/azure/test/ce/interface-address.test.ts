import { expect, it } from 'bun:test';
import { resolveInterfaceAddress } from '../../src/ce/interface-address';
import type { AzureCePlan } from '../../src/ce/types';

const root = '/subscriptions/00000000-0000-0000-0000-000000000001/resourceGroups/ce-rg/providers';
const nicId = `${root}/Microsoft.Network/networkInterfaces/ce-1-nic0`;
const vmId = `${root}/Microsoft.Compute/virtualMachines/ce-1`;
const plan = {
  engine: 'native',
  subscription: { id: '00000000-0000-0000-0000-000000000001' },
  intent: { resourceGroup: 'ce-rg' },
  deploymentName: 'ce',
  planSha256: 'plan',
  nics: [{ index: 0, role: 'slo', subnet: {} }],
  actions: [
    { kind: 'nic-create', node: 1, resourceId: nicId, args: ['--name', 'ce-1-nic0'] },
    { kind: 'vm-create', node: 1, resourceId: vmId },
  ],
} as unknown as AzureCePlan;
const tags = {
  'xcsh-managed-by': 'azure-ce',
  'xcsh-execution-engine': 'native',
  'xcsh-deployment-id': 'ce',
  'xcsh-plan-sha256': 'plan',
};
const nic = {
  id: nicId,
  tags,
  provisioningState: 'Succeeded',
  virtualMachine: { id: vmId },
  macAddress: '00-11-22-33-44-55',
  ipConfigurations: [{ primary: true, privateIPAddressVersion: 'IPv4', privateIPAddress: '10.0.0.4' }],
};
const vm = { id: vmId, tags, provisioningState: 'Succeeded', networkProfile: { networkInterfaces: [{ id: nicId }] } };
const api = (observed: unknown = nic, observedVm: unknown = vm) => ({
  exec: async (_cmd: string, args: string[]) => {
    expect(args).toContain('--ids');
    expect(args).toContain('--subscription');
    return { stdout: JSON.stringify(args.includes('nic') ? observed : observedVm), stderr: '', exitCode: 0 };
  },
});
it('reads a live SLO address from the planned NIC and reciprocal VM attachment', async () => {
  expect(await resolveInterfaceAddress(api(), plan, 1, 'slo')).toBe('10.0.0.4');
});
it('rejects stale, foreign, malformed and ambiguous interface identities', async () => {
  for (const change of [
    { id: `${nicId}-foreign` },
    { tags: {} },
    { virtualMachine: { id: `${vmId}-foreign` } },
    { macAddress: '' },
    { provisioningState: 'Updating' },
    { ipConfigurations: [{ primary: true, privateIPAddressVersion: 'IPv4', privateIPAddress: '999.0.0.4' }] },
    { ipConfigurations: [nic.ipConfigurations[0], nic.ipConfigurations[0]] },
  ])
    await expect(resolveInterfaceAddress(api({ ...nic, ...change }), plan, 1, 'slo')).rejects.toThrow();
  await expect(
    resolveInterfaceAddress(api(nic, { ...vm, networkProfile: { networkInterfaces: [] } }), plan, 1, 'slo'),
  ).rejects.toThrow();
});
