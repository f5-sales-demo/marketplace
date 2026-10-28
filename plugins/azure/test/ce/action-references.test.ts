import { expect, test } from 'bun:test';
import type { AzExecApi } from '../../src/az/exec';
import { resolveActionArgs } from '../../src/ce/apply';
import type { AzureCePlan } from '../../src/ce/types';
import { resolveAzureCeActionReferences } from '../../src/tools/azure-ce-apply';

function fixture(roles: Array<'slo' | 'data' | 'sli'>) {
  const subscription = '00000000-0000-4000-8000-000000000001';
  const root = `/subscriptions/${subscription}/resourceGroups/reference-test/providers`;
  const vmId = `${root}/Microsoft.Compute/virtualMachines/reference-test-1`;
  const ids = roles.map((_, index) => `${root}/Microsoft.Network/networkInterfaces/reference-test-1-nic${index}`);
  const tags = {
    'xcsh-managed-by': 'azure-ce',
    'xcsh-execution-engine': 'native',
    'xcsh-deployment-id': 'reference-test',
    'xcsh-plan-sha256': 'a'.repeat(64),
  };
  const plan = {
    engine: 'native',
    topology: { nodeCount: 1 },
    subscription: { id: subscription },
    intent: { resourceGroup: 'reference-test' },
    deploymentName: 'reference-test',
    planSha256: tags['xcsh-plan-sha256'],
    nics: roles.map((role, index) => ({ index, role, subnet: {} })),
    actions: [
      ...ids.map((resourceId, index) => ({
        kind: 'nic-create',
        node: 1,
        resourceId,
        args: ['--name', `reference-test-1-nic${index}`],
      })),
      { kind: 'vm-create', node: 1, resourceId: vmId },
    ],
  } as unknown as AzureCePlan;
  let reads = 0;
  const state = { foreignOwner: false };
  const api: AzExecApi = {
    async exec(command, args) {
      reads++;
      expect(command).toBe('az');
      expect(args).toContain('--ids');
      expect(args).toContain('--subscription');
      const id = args[args.indexOf('--ids') + 1];
      let value: unknown;
      if (args.slice(0, 3).join(' ') === 'network nic show') {
        const index = ids.indexOf(id);
        if (index < 0) throw Error('Synthetic NIC identity is unavailable');
        value = {
          id,
          tags: {
            ...tags,
            'xcsh-plan-sha256': state.foreignOwner && roles[index] === 'data' ? 'b'.repeat(64) : plan.planSha256,
          },
          provisioningState: 'Succeeded',
          virtualMachine: { id: vmId },
          macAddress: `02:00:00:00:00:${String(index + 1).padStart(2, '0')}`,
          ipConfigurations: [{ primary: true, privateIPAddressVersion: 'IPv4', privateIPAddress: `10.20.${index}.5` }],
        };
      } else if (args[0] === 'vm' && args[1] === 'show') {
        expect(id).toBe(vmId);
        value = {
          id,
          tags,
          provisioningState: 'Succeeded',
          networkProfile: { networkInterfaces: ids.map((id) => ({ id })) },
        };
      } else throw Error('Mutation or unsupported command is forbidden in reference fixture');
      return { exitCode: 0, stderr: '', stdout: JSON.stringify(value) };
    },
  };
  return { plan, api, state, reads: () => reads };
}

for (const roles of [['slo'], ['slo', 'sli'], ['slo', 'data', 'sli']] as Array<Array<'slo' | 'data' | 'sli'>>)
  test(`native DATA reference uses the configured data-plane NIC for ${roles.join('/')}`, async () => {
    const f = fixture(roles);
    const token = '__NODE_1_DATA_PRIVATE_IP__';
    const selected = roles.includes('data') ? roles.indexOf('data') : roles.length === 1 ? 0 : roles.indexOf('sli');
    const references = await resolveAzureCeActionReferences([token], f.api, f.plan);
    expect(references[token]).toBe(`10.20.${selected}.5`);
    expect(resolveActionArgs(['--next-hop-ip-address', token], f.plan.planSha256, references)).toEqual([
      '--next-hop-ip-address',
      `10.20.${selected}.5`,
    ]);
    expect(f.reads()).toBeGreaterThan(0);
  });

test('native SLO, DATA, SLI and exact-index tokens retain distinct physical NIC addresses', async () => {
  const f = fixture(['slo', 'data', 'sli']);
  const tokens = [
    '__NODE_1_SLO_PRIVATE_IP__',
    '__NODE_1_DATA_PRIVATE_IP__',
    '__NODE_1_SLI_PRIVATE_IP__',
    '__NODE_1_NIC_1_PRIVATE_IP__',
  ];
  expect(await resolveAzureCeActionReferences(tokens, f.api, f.plan)).toEqual({
    [tokens[0]]: '10.20.0.5',
    [tokens[1]]: '10.20.1.5',
    [tokens[2]]: '10.20.2.5',
    [tokens[3]]: '10.20.1.5',
  });
});

test('ambiguous data role cannot silently fall back to a healthy SLI', async () => {
  const f = fixture(['slo', 'data', 'data', 'sli']);
  await expect(resolveAzureCeActionReferences(['__NODE_1_DATA_PRIVATE_IP__'], f.api, f.plan)).rejects.toThrow(
    /missing or ambiguous/,
  );
  expect(f.reads()).toBe(0);
});

test('foreign data owner cannot be substituted with the owned SLI', async () => {
  const f = fixture(['slo', 'data', 'sli']);
  f.state.foreignOwner = true;
  await expect(resolveAzureCeActionReferences(['__NODE_1_DATA_PRIVATE_IP__'], f.api, f.plan)).rejects.toThrow();
});

test('unresolved node or configuration identity rejects before cloud access', async () => {
  for (const token of ['__NODE_2_DATA_PRIVATE_IP__', '__NODE_1_NIC_1_IPCONFIG_NAME__']) {
    const f = fixture(['slo', 'data', 'sli']);
    await expect(resolveAzureCeActionReferences([token], f.api, f.plan)).rejects.toThrow();
    expect(f.reads()).toBe(0);
  }
});

test('cancellation rejects an address read before executing commands', async () => {
  const f = fixture(['slo', 'data', 'sli']);
  await expect(
    resolveAzureCeActionReferences(
      ['__NODE_1_DATA_PRIVATE_IP__'],
      f.api,
      f.plan,
      f.plan.planSha256,
      undefined,
      AbortSignal.abort(),
    ),
  ).rejects.toThrow();
  expect(f.reads()).toBe(0);
});
