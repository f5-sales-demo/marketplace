import { expect, test } from 'bun:test';
import type { AzExecApi } from '../../src/az/exec';
import { resolveActionArgs } from '../../src/ce/apply';
import type { AzureCePlan } from '../../src/ce/types';
import { resolveAzureCeActionReferences } from '../../src/tools/azure-ce-apply';

function fixture(roles: Array<'slo' | 'data' | 'sli'>, nodeCount = 1, deploymentName = 'reference-test') {
  const subscription = '00000000-0000-4000-8000-000000000001';
  const root = `/subscriptions/${subscription}/resourceGroups/${deploymentName}/providers`;
  const nodes = Array.from({ length: nodeCount }, (_, index) => index + 1);
  const vmId = (node: number) => `${root}/Microsoft.Compute/virtualMachines/${deploymentName}-${node}`;
  const nics = nodes.flatMap((node) =>
    roles.map((role, index) => ({
      node,
      role,
      index,
      id: `${root}/Microsoft.Network/networkInterfaces/${deploymentName}-${node}-nic${index}`,
      mac: `02:00:00:00:00:${((node - 1) * roles.length + index + 1).toString(16).padStart(2, '0')}`,
    })),
  );
  const tags = {
    'xcsh-managed-by': 'azure-ce',
    'xcsh-execution-engine': 'native',
    'xcsh-deployment-id': deploymentName,
    'xcsh-plan-sha256': 'a'.repeat(64),
  };
  const plan = {
    engine: 'native',
    topology: { nodeCount, ha: nodeCount === 3 },
    subscription: { id: subscription },
    intent: { resourceGroup: deploymentName },
    deploymentName,
    planSha256: tags['xcsh-plan-sha256'],
    nics: roles.map((role, index) => ({ index, role, subnet: {} })),
    actions: [
      ...nics.map((nic) => ({
        kind: 'nic-create',
        node: nic.node,
        resourceId: nic.id,
        args: ['--name', `${deploymentName}-${nic.node}-nic${nic.index}`],
      })),
      ...nodes.map((node) => ({ kind: 'vm-create', node, resourceId: vmId(node) })),
    ],
  } as unknown as AzureCePlan;
  let reads = 0;
  const state = { foreignOwner: false };
  const nicReads: Array<{ id: string; mac: string; node: number; role: string }> = [];
  const api: AzExecApi = {
    async exec(command, args) {
      reads++;
      expect(command).toBe('az');
      expect(args).toContain('--ids');
      expect(args).toContain('--subscription');
      const id = args[args.indexOf('--ids') + 1];
      let value: unknown;
      if (args.slice(0, 3).join(' ') === 'network nic show') {
        const nic = nics.find((nic) => nic.id === id);
        if (!nic) throw Error('Synthetic NIC identity is unavailable');
        nicReads.push({ id: nic.id, mac: nic.mac, node: nic.node, role: nic.role });
        value = {
          id,
          tags: {
            ...tags,
            'xcsh-plan-sha256': state.foreignOwner && nic.role === 'data' ? 'b'.repeat(64) : plan.planSha256,
          },
          provisioningState: 'Succeeded',
          virtualMachine: { id: vmId(nic.node) },
          macAddress: nic.mac,
          ipConfigurations: [
            { primary: true, privateIPAddressVersion: 'IPv4', privateIPAddress: `10.20.${nic.index}.${nic.node + 4}` },
          ],
        };
      } else if (args[0] === 'vm' && args[1] === 'show') {
        const node = nodes.find((node) => vmId(node) === id);
        if (!node) throw Error('Synthetic VM identity is unavailable');
        value = {
          id,
          tags,
          provisioningState: 'Succeeded',
          networkProfile: { networkInterfaces: nics.filter((nic) => nic.node === node).map(({ id }) => ({ id })) },
        };
      } else throw Error('Mutation or unsupported command is forbidden in reference fixture');
      return { exitCode: 0, stderr: '', stdout: JSON.stringify(value) };
    },
  };
  return { plan, api, state, nicReads, reads: () => reads };
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

test('ambiguous data role cannot silently fall back to a owned SLI', async () => {
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

test('native HA action references retain all nine node and MAC-bound NIC identities', async () => {
  const f = fixture(['slo', 'data', 'sli'], 3);
  const tokens = [1, 2, 3].flatMap((node) =>
    ['SLO', 'DATA', 'SLI'].map((role) => `__NODE_${node}_${role}_PRIVATE_IP__`),
  );
  const references = await resolveAzureCeActionReferences(tokens, f.api, f.plan);
  for (const node of [1, 2, 3])
    for (const [index, role] of ['SLO', 'DATA', 'SLI'].entries())
      expect(references[`__NODE_${node}_${role}_PRIVATE_IP__`]).toBe(`10.20.${index}.${node + 4}`);
  expect(new Set(f.nicReads.map(({ id }) => id)).size).toBe(9);
  expect(new Set(f.nicReads.map(({ mac }) => mac)).size).toBe(9);
  for (const node of [1, 2, 3])
    expect(new Set(f.nicReads.filter((row) => row.node === node).map(({ role }) => role))).toEqual(
      new Set(['slo', 'data', 'sli']),
    );
});

test('independent native deployments resolve their own scope even when private addresses overlap', async () => {
  const sites = ['reference-a', 'reference-b', 'reference-c'].map((name) => fixture(['slo', 'data', 'sli'], 1, name));
  const token = '__NODE_1_DATA_PRIVATE_IP__';
  for (const f of sites) {
    expect((await resolveAzureCeActionReferences([token], f.api, f.plan))[token]).toBe('10.20.1.5');
    expect(f.nicReads.every(({ id }) => id.includes(`/resourceGroups/${f.plan.intent.resourceGroup}/`))).toBe(true);
  }
  expect(new Set(sites.flatMap(({ nicReads }) => nicReads.map(({ id }) => id))).size).toBe(3);
});

test('a complete foreign independent NIC observation cannot satisfy another deployment data reference', async () => {
  const own = fixture(['slo', 'data', 'sli'], 1, 'reference-a');
  const foreign = fixture(['slo', 'data', 'sli'], 1, 'reference-b');
  const token = '__NODE_1_DATA_PRIVATE_IP__';
  expect((await resolveAzureCeActionReferences([token], own.api, own.plan))[token]).toBe('10.20.1.5');
  const substituted: AzExecApi = {
    exec: (command, args, options) =>
      foreign.api.exec(
        command,
        args.map((arg) => arg.replaceAll('reference-a', 'reference-b')),
        options,
      ),
  };
  await expect(resolveAzureCeActionReferences([token], substituted, own.plan)).rejects.toThrow();
  expect(foreign.nicReads.length).toBeGreaterThan(0);
});
