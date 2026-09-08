import { expect, it } from 'bun:test';
import type { AzExecApi } from '../../src/az/exec';
import { discoverAzureTerraformInterfaces } from '../../src/ce/terraform-identities';
import type { AzureCePlan } from '../../src/ce/types';

function fixture() {
  const subscription = '00000000-0000-0000-0000-000000000001';
  const tenant = '00000000-0000-0000-0000-000000000002';
  const root = `/subscriptions/${subscription}/resourceGroups/ce-rg/providers`;
  const vmId = `${root}/Microsoft.Compute/virtualMachines/ce-1`;
  const nics = ['slo', 'data', 'sli'].map((role, index) => ({
    index,
    role,
    subnet: { resourceId: `${root}/Microsoft.Network/virtualNetworks/ce/subnets/nic${index}` },
  }));
  const ids = nics.map(({ index }) => `${root}/Microsoft.Network/networkInterfaces/ce-1-nic${index}`);
  const plan = {
    planId: 'azure-ce-fixture',
    planSha256: 'a'.repeat(64),
    engine: 'terraform',
    subscription: { id: subscription, tenantId: tenant, cloud: 'AzureCloud' },
    intent: { resourceGroup: 'ce-rg' },
    deploymentName: 'ce',
    siteName: 'ce-site',
    region: 'eastus',
    topology: { nodeCount: 1 },
    nics,
    actions: [
      { kind: 'vm-create', node: 1, resourceId: vmId },
      ...ids.map((id, index) => ({
        kind: 'nic-create',
        node: 1,
        resourceId: id,
        args: ['--name', `ce-1-nic${index}`],
      })),
    ],
  } as unknown as AzureCePlan;
  const tags = {
    'xcsh-managed-by': 'azure-ce',
    'xcsh-execution-engine': 'terraform',
    'xcsh-deployment-id': 'ce',
    'xcsh-plan-sha256': plan.planSha256,
  };
  const vm = {
    id: vmId,
    vmId: '00000000-0000-0000-0000-000000000003',
    location: 'eastus',
    tags,
    provisioningState: 'Succeeded',
    networkProfile: { networkInterfaces: ids.map((id) => ({ id })) },
  };
  const live: Record<string, any> = { [vmId]: vm };
  const interfaces: Record<string, unknown> = {};
  for (const nic of nics) {
    const id = ids[nic.index];
    interfaces[`1:${nic.index}`] = {
      id,
      subnet_id: nic.subnet.resourceId,
      node: 1,
      index: nic.index,
      role: nic.role,
      site_name: plan.siteName,
    };
    live[id] = {
      id,
      location: 'eastus',
      tags,
      provisioningState: 'Succeeded',
      virtualMachine: { id: vmId },
      macAddress: `00-11-22-33-44-0${nic.index}`,
      ipConfigurations: [
        {
          primary: true,
          privateIPAddressVersion: 'IPv4',
          privateIPAddress: `10.0.${nic.index}.4`,
          subnet: { id: nic.subnet.resourceId },
        },
      ],
    };
  }
  const outputs: Record<string, any> = {
    ce_instances: { '1': { id: vmId, vm_id: vm.vmId, site_name: plan.siteName, hostname: 'ce-1' } },
    ce_interfaces: interfaces,
  };
  const account = { id: subscription, tenantId: tenant, environmentName: 'AzureCloud', state: 'Enabled' };
  const calls: string[][] = [];
  const api: AzExecApi = {
    exec: async (command, args, options) => {
      expect(command).toBe('az');
      expect(args[args.indexOf('--subscription') + 1]).toBe(subscription);
      expect(args).toContain('--output');
      expect(options?.signal?.aborted).not.toBe(true);
      calls.push(args);
      return {
        exitCode: 0,
        stderr: '',
        stdout: JSON.stringify(args[0] === 'account' ? account : live[args[args.indexOf('--ids') + 1]]),
      };
    },
  };
  return { plan, outputs, live, vm, ids, account, api, calls };
}

it('collects current Azure MAC and IPv4 bindings for the explicit three-NIC layout', async () => {
  const f = fixture();
  const result = await discoverAzureTerraformInterfaces(f.plan, f.outputs, f.api);
  expect(result.engine).toBe('terraform');
  expect(result.planSha256).toBe(f.plan.planSha256);
  expect(result.interfaces.map((nic) => [nic.index, nic.role, nic.mac, nic.privateIp])).toEqual([
    [0, 'slo', '00:11:22:33:44:00', '10.0.0.4'],
    [1, 'data', '00:11:22:33:44:01', '10.0.1.4'],
    [2, 'sli', '00:11:22:33:44:02', '10.0.2.4'],
  ]);
  expect(result.interfaces.every((nic) => nic.vmId === f.vm.vmId)).toBe(true);
  expect(JSON.stringify(result)).not.toContain('eth');
  expect(f.calls.length).toBe(5);
});

for (const mutation of [
  (f: ReturnType<typeof fixture>) => {
    f.outputs.ce_instances['1'].vm_id += '-stale';
  },
  (f: ReturnType<typeof fixture>) => {
    delete f.outputs.ce_interfaces['1:2'];
  },
  (f: ReturnType<typeof fixture>) => {
    f.outputs.ce_interfaces['1:2'].id = f.ids[0];
  },
  (f: ReturnType<typeof fixture>) => {
    f.outputs.ce_interfaces['1:2'].role = 'slo';
  },
  (f: ReturnType<typeof fixture>) => {
    f.live[f.ids[2]].virtualMachine.id += '-old';
  },
  (f: ReturnType<typeof fixture>) => {
    f.vm.networkProfile.networkInterfaces.pop();
  },
  (f: ReturnType<typeof fixture>) => {
    f.vm.networkProfile.networkInterfaces[2] = { id: f.ids[0] };
  },
  (f: ReturnType<typeof fixture>) => {
    f.live[f.ids[2]].macAddress = f.live[f.ids[0]].macAddress;
  },
  (f: ReturnType<typeof fixture>) => {
    delete f.live[f.ids[2]].macAddress;
  },
  (f: ReturnType<typeof fixture>) => {
    f.live[f.ids[2]].ipConfigurations[0].privateIPAddress = '999.0.0.4';
  },
  (f: ReturnType<typeof fixture>) => {
    f.live[f.ids[2]].ipConfigurations[0].subnet.id += '-other';
  },
  (f: ReturnType<typeof fixture>) => {
    f.live[f.ids[2]].tags['xcsh-execution-engine'] = 'native';
  },
  (f: ReturnType<typeof fixture>) => {
    f.live[f.ids[2]].location = 'westus';
  },
  (f: ReturnType<typeof fixture>) => {
    f.live[f.ids[2]].nextLink = 'more';
  },
  (f: ReturnType<typeof fixture>) => {
    f.account.environmentName = 'AzureChinaCloud';
  },
]) {
  it('rejects incomplete, stale, foreign, or ambiguous Terraform/Azure bindings', async () => {
    const f = fixture();
    mutation(f);
    await expect(discoverAzureTerraformInterfaces(f.plan, f.outputs, f.api)).rejects.toThrow();
  });
}

it('rejects cancellation and native ownership before executing a command', async () => {
  const f = fixture();
  await expect(discoverAzureTerraformInterfaces(f.plan, f.outputs, f.api, AbortSignal.abort())).rejects.toThrow();
  f.plan.engine = 'native';
  await expect(discoverAzureTerraformInterfaces(f.plan, f.outputs, f.api)).rejects.toThrow(/Terraform ownership/);
  expect(f.calls).toEqual([]);
});

it('requires all three HA node identities and nine distinct NIC bindings', async () => {
  const f = fixture();
  f.plan.topology.nodeCount = 3;
  const originalActions = structuredClone(f.plan.actions);
  for (const node of [2, 3]) {
    const replace = (value: string) => value.replaceAll('ce-1', `ce-${node}`);
    f.plan.actions.push(
      ...JSON.parse(replace(JSON.stringify(originalActions))).map((action: Record<string, unknown>) => ({
        ...action,
        node,
      })),
    );
    const instance = JSON.parse(replace(JSON.stringify(f.outputs.ce_instances['1'])));
    instance.vm_id = f.vm.vmId.slice(0, -1) + String(node + 2);
    f.outputs.ce_instances[String(node)] = instance;
    f.live[instance.id] = JSON.parse(replace(JSON.stringify(f.vm)));
    f.live[instance.id].vmId = instance.vm_id;
    for (const index of [0, 1, 2]) {
      const source = f.outputs.ce_interfaces[`1:${index}`];
      f.outputs.ce_interfaces[`${node}:${index}`] = { ...source, id: replace(source.id), node };
      const nic = JSON.parse(replace(JSON.stringify(f.live[source.id])));
      nic.macAddress = `00-11-22-33-0${node}-0${index}`;
      nic.ipConfigurations[0].privateIPAddress = `10.0.${index}.${node + 3}`;
      f.live[nic.id] = nic;
    }
  }
  const result = await discoverAzureTerraformInterfaces(f.plan, f.outputs, f.api);
  expect(result.interfaces.length).toBe(9);
  expect(new Set(result.interfaces.map((nic) => nic.vmId)).size).toBe(3);
  delete f.outputs.ce_instances['3'];
  await expect(discoverAzureTerraformInterfaces(f.plan, f.outputs, f.api)).rejects.toThrow(/incomplete/);
});

it('binds greenfield subnets to the plan, not to mutually consistent forged outputs and cloud responses', async () => {
  const f = fixture();
  for (const nic of f.plan.nics) {
    const resourceId = nic.subnet.resourceId;
    nic.subnet = { mode: 'greenfield', name: `nic${nic.index}`, cidr: `10.0.${nic.index}.0/24` };
    f.plan.actions.push({
      id: `subnet-${nic.index}`,
      phase: 'prerequisites',
      kind: 'subnet-create',
      description: 'planned subnet',
      args: ['--name', nic.subnet.name!],
      resourceId,
      mutates: true,
      destructive: false,
    });
  }
  expect((await discoverAzureTerraformInterfaces(f.plan, f.outputs, f.api)).interfaces.length).toBe(3);
  const output = f.outputs.ce_interfaces['1:2'];
  output.subnet_id += '-foreign';
  f.live[f.ids[2]].ipConfigurations[0].subnet.id = output.subnet_id;
  await expect(discoverAzureTerraformInterfaces(f.plan, f.outputs, f.api)).rejects.toThrow(/planned identity/);
});
