import { expect, test } from 'bun:test';
import { observeAzureTrafficSource } from '../../src/ce/traffic-source';
import type { AzureCePlan } from '../../src/ce/types';

const subscriptionId = ['11111111', '1111', '4111', '8111', '111111111111'].join('-');
const tenantId = ['22222222', '2222', '4222', '8222', '222222222222'].join('-');
const sourceVmResourceId =
  `/subscriptions/${subscriptionId}/resourceGroups/rg-app/providers/Microsoft.Compute/virtualMachines/probe`.toLowerCase();
const nicResourceId =
  `/subscriptions/${subscriptionId}/resourceGroups/rg-app/providers/Microsoft.Network/networkInterfaces/probe-nic`.toLowerCase();

function fixture() {
  const plan = {
    engine: 'native',
    planId: 'azure-ce-test',
    planSha256: 'a'.repeat(64),
    subscription: { id: subscriptionId, tenantId, cloud: 'AzureCloud' },
    region: 'canadacentral',
    intent: {
      ingress: {
        mode: 'platform-http',
        port: 8080,
        listener: {
          name: 'ce-listener',
          namespace: 'system',
          domain: 'ce.example.invalid',
          privateAddress: '10.20.1.10',
          originPool: { name: 'ce-origin', namespace: 'system' },
        },
        probe: {
          sourceVmResourceId,
          path: '/healthz',
          expectedStatus: 200,
          expectedBodySha256: '4'.repeat(64),
        },
      },
      brownfield: { resourceIds: [sourceVmResourceId], routeChanges: [] },
    },
    ownershipInventory: [{ resourceId: sourceVmResourceId, owned: false, action: 'modify-approved' }],
  } as AzureCePlan;
  const calls: string[][] = [];
  const responses = {
    account: {
      id: subscriptionId.toUpperCase(),
      tenantId: tenantId.toUpperCase(),
      environmentName: 'AzureCloud',
      state: 'Enabled',
    },
    vm: {
      id: sourceVmResourceId.toUpperCase(),
      vmId: '33333333-3333-4333-8333-333333333333',
      location: 'CanadaCentral',
      provisioningState: 'Succeeded',
      powerState: 'VM running',
      networkProfile: { networkInterfaces: [{ id: nicResourceId.toUpperCase(), primary: true }] },
    },
    nic: {
      id: nicResourceId.toUpperCase(),
      provisioningState: 'Succeeded',
      virtualMachine: { id: sourceVmResourceId.toUpperCase() },
      ipConfigurations: [{ primary: true, privateIPAddressVersion: 'IPv4', privateIPAddress: '10.30.0.4' }],
    },
  };
  const api = {
    async exec(_command: string, args: string[]) {
      calls.push(args);
      const value = args[0] === 'account' ? responses.account : args[0] === 'vm' ? responses.vm : responses.nic;
      return { exitCode: 0, stderr: '', stdout: JSON.stringify(value) };
    },
  };
  return { plan, calls, responses, api };
}

test('binds the reviewed Azure account, VM, NIC, and private address case-insensitively', async () => {
  const f = fixture();
  const result = await observeAzureTrafficSource(f.plan, f.api);
  expect(result).toMatchObject({
    subscriptionId,
    tenantId,
    cloud: 'AzureCloud',
    resourceId: sourceVmResourceId,
    vmId: f.responses.vm.vmId,
    nicResourceId: nicResourceId.toUpperCase(),
    privateAddress: '10.30.0.4',
    source: 'azure-cli-live',
  });
  expect(f.calls.map((args) => args.slice(0, 3))).toEqual([
    ['account', 'show', '--subscription'],
    ['vm', 'show', '--ids'],
    ['network', 'nic', 'show'],
  ]);
});

test('rejects an unreviewed source before Azure calls', async () => {
  const f = fixture();
  f.plan.ownershipInventory = [];
  await expect(observeAzureTrafficSource(f.plan, f.api)).rejects.toThrow(/reviewed inventory/i);
  expect(f.calls).toHaveLength(0);
});

test('rejects wrong account and stale VM or NIC attachment identities', async () => {
  const account = fixture();
  account.responses.account.id = '99999999-9999-4999-8999-999999999999';
  await expect(observeAzureTrafficSource(account.plan, account.api)).rejects.toThrow(/account differs/i);
  expect(account.calls).toHaveLength(1);

  const vm = fixture();
  vm.responses.vm.powerState = 'VM deallocated';
  await expect(observeAzureTrafficSource(vm.plan, vm.api)).rejects.toThrow(/VM identity or readiness/i);
  expect(vm.calls).toHaveLength(2);

  const nic = fixture();
  nic.responses.nic.virtualMachine.id = `${sourceVmResourceId}-replacement`;
  await expect(observeAzureTrafficSource(nic.plan, nic.api)).rejects.toThrow(/NIC identity/i);
  expect(nic.calls).toHaveLength(3);
});
