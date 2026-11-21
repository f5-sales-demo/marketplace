import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type TSchema, Type } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import type { PluginInterface } from '../../src/az/types';
import { assertActionOwnership, assertAzureCeRoutingExecutable } from '../../src/ce/apply';
import { loadPlanArtifact, type SessionManagerLike, saveDiscoveryArtifact } from '../../src/ce/artifacts';
import { resolveAzureNicAddress } from '../../src/ce/interface-address';
import { azureNativePendingActionConverged } from '../../src/ce/native-action-recovery';
import { compileAzureCePlan } from '../../src/ce/planner';
import { renderAzureTerraformFoundation } from '../../src/ce/terraform-foundation';
import { createAzureCePlanTool } from '../../src/tools/azure-ce-plan';
import { intent, observation } from './fixtures';

function input(engine: 'native' | 'terraform' = 'terraform') {
  const value = structuredClone(intent);
  value.engine = engine;
  value.nics = [
    { name: 'mgmt', role: 'slo', subnet: { mode: 'greenfield', name: 'mgmt', cidr: '10.20.0.0/24' } },
    { name: 'outside', role: 'data', subnet: { mode: 'greenfield', name: 'outside', cidr: '10.20.1.0/24' } },
    { name: 'inside', role: 'sli', subnet: { mode: 'greenfield', name: 'inside', cidr: '10.20.2.0/24' } },
  ];
  return {
    ...value,
    routing: {
      mode: 'udr' as const,
      destinationCidrs: ['10.253.0.0/24', '10.254.0.0/24'],
      udr: { subnetNames: ['inside'], nextHop: { node: 1, nicIndex: 1 } },
    },
  };
}
const bootstrap = '#cloud-config\nwrite_files:\n- path: /etc/vpm/user_data\n  content: fixture-material\n';
for (const engine of ['native', 'terraform'] as const)
  test(`plans explicit greenfield UDR association and exact next-hop NIC for ${engine}`, () => {
    const p = compileAzureCePlan(input(engine), observation);
    expect(p.routing.udr).toEqual({ subnetNames: ['inside'], nextHop: { node: 1, nicIndex: 1 } });
    expect(() => assertAzureCeRoutingExecutable(p)).not.toThrow();
    const routes = p.actions.filter((a) => a.kind === 'route-create');
    expect(routes).toHaveLength(2);
    for (const route of routes) expect(route.args).toContain('__NODE_1_NIC_1_PRIVATE_IP__');
    const associations = p.actions.filter((a) => a.kind === 'route-association-update');
    expect(associations).toHaveLength(1);
    expect(associations[0].resourceId).toBe(
      `/subscriptions/${p.subscription.id}/resourceGroups/${p.intent.resourceGroup}/providers/Microsoft.Network/virtualNetworks/${p.deploymentName}-vnet/subnets/inside`,
    );
    expect(associations[0].args).toContain(
      `/subscriptions/${p.subscription.id}/resourceGroups/${p.intent.resourceGroup}/providers/Microsoft.Network/routeTables/${p.deploymentName}-rt`,
    );
  });
test('renders owned Terraform UDR resources and association before and after compute admission', () => {
  const p = compileAzureCePlan(input(), observation);
  for (const admissions of [{}, { '1': bootstrap }] as Record<string, string>[]) {
    const config = JSON.parse(renderAzureTerraformFoundation(p, admissions));
    expect(config.resource.azurerm_route_table.ce).toMatchObject({
      name: `${p.deploymentName}-rt`,
      tags: { 'xcsh-plan-sha256': p.planSha256, 'xcsh-execution-engine': 'terraform' },
    });
    expect(config.resource.azurerm_route).toEqual({
      route_0: {
        name: 'ce-route-1',
        resource_group_name: `\${azurerm_resource_group.ce.name}`,
        route_table_name: `\${azurerm_route_table.ce.name}`,
        address_prefix: '10.253.0.0/24',
        next_hop_type: 'VirtualAppliance',
        next_hop_in_ip_address: `\${azurerm_network_interface.node_1_nic_1.private_ip_address}`,
      },
      route_1: {
        name: 'ce-route-2',
        resource_group_name: `\${azurerm_resource_group.ce.name}`,
        route_table_name: `\${azurerm_route_table.ce.name}`,
        address_prefix: '10.254.0.0/24',
        next_hop_type: 'VirtualAppliance',
        next_hop_in_ip_address: `\${azurerm_network_interface.node_1_nic_1.private_ip_address}`,
      },
    });
    expect(config.resource.azurerm_subnet_route_table_association.udr_0).toEqual({
      subnet_id: `\${azurerm_subnet.subnet_2.id}`,
      route_table_id: `\${azurerm_route_table.ce.id}`,
      depends_on: ['azurerm_route.route_0', 'azurerm_route.route_1'],
    });
    expect(config.resource.azurerm_route_server).toBeUndefined();
    expect(JSON.stringify(config.resource)).not.toContain('__NODE_');
  }
});
test('normalizes explicit association ordering and binds changed targets and next-hop identity in the plan hash', () => {
  const a = input();
  a.routing.udr.subnetNames = ['mgmt', 'inside'];
  const b = structuredClone(a);
  b.routing.udr.subnetNames.reverse();
  expect(compileAzureCePlan(a, observation).planSha256).toBe(compileAzureCePlan(b, observation).planSha256);
  b.routing.udr.nextHop.nicIndex = 2;
  expect(compileAzureCePlan(a, observation).planSha256).not.toBe(compileAzureCePlan(b, observation).planSha256);
});
for (const [label, modify] of Object.entries({
  emptyTargets: (v: ReturnType<typeof input>) => {
    v.routing.udr.subnetNames = [];
  },
  duplicateTargets: (v: ReturnType<typeof input>) => {
    v.routing.udr.subnetNames = ['inside', 'inside'];
  },
  missingTarget: (v: ReturnType<typeof input>) => {
    v.routing.udr.subnetNames = ['foreign'];
  },
  unresolvedTarget: (v: ReturnType<typeof input>) => {
    v.routing.udr.subnetNames = ['__SUBNET__'];
  },
  wrongNode: (v: ReturnType<typeof input>) => {
    v.routing.udr.nextHop.node = 4;
  },
  wrongNic: (v: ReturnType<typeof input>) => {
    v.routing.udr.nextHop.nicIndex = 7;
  },
  fractionalNic: (v: ReturnType<typeof input>) => {
    v.routing.udr.nextHop.nicIndex = 1.5;
  },
  noDestinations: (v: ReturnType<typeof input>) => {
    v.routing.destinationCidrs = [];
  },
  wrongRoutingMode: (v: ReturnType<typeof input>) => {
    Object.assign(v.routing, { mode: 'route-server', localAsn: 64512 });
  },
  ambiguousBrownfield: (v: ReturnType<typeof input>) => {
    v.brownfield.routeChanges.push({
      routeTableId: 'foreign',
      subnetId: 'foreign',
      routeName: 'route',
      destinationCidr: '10.253.0.0/24',
    });
  },
}))
  test(`rejects ${label} explicit greenfield UDR intent`, () => {
    const v = input();
    modify(v);
    expect(() => compileAzureCePlan(v, observation)).toThrow();
  });
test('keeps unassociated UDR destinations blocked and emits no orphan Terraform routes', () => {
  const value = structuredClone(intent);
  value.engine = 'terraform';
  value.routing = { mode: 'udr', destinationCidrs: ['10.253.0.0/24'] };
  const p = compileAzureCePlan(value, observation);
  expect(() => assertAzureCeRoutingExecutable(p)).toThrow(/association/);
  expect(() => renderAzureTerraformFoundation(p)).toThrow(/association/);
});

function ownedFixture() {
  const p = compileAzureCePlan(input('native'), observation),
    group = `/subscriptions/${p.subscription.id}/resourceGroups/${p.intent.resourceGroup}/providers/Microsoft.Network`;
  const vnetId = `${group}/virtualNetworks/${p.deploymentName}-vnet`,
    tableId = `${group}/routeTables/${p.deploymentName}-rt`;
  const action = p.actions.find((a) => a.kind === 'route-association-update');
  if (!action?.resourceId) throw Error('missing association');
  const tags = {
    'xcsh-managed-by': 'azure-ce',
    'xcsh-execution-engine': 'native',
    'xcsh-deployment-id': p.deploymentName,
    'xcsh-plan-sha256': p.planSha256,
  };
  const resources = new Map<string, Record<string, unknown>>([
    [vnetId, { id: vnetId, location: p.region, provisioningState: 'Succeeded', tags: { ...tags } }],
    [tableId, { id: tableId, location: p.region, provisioningState: 'Succeeded', tags: { ...tags } }],
    [
      action.resourceId,
      { id: action.resourceId, provisioningState: 'Succeeded', addressPrefix: '10.20.2.0/24', routeTable: null },
    ],
  ]);
  const calls: string[][] = [];
  const api = {
    async exec(command: string, args: string[]) {
      calls.push(args);
      expect(command).toBe('az');
      expect(args).toContain('show');
      const id = args[args.indexOf('--ids') + 1];
      const value = resources.get(id);
      if (!value) throw Error('unexpected read');
      return { exitCode: 0, stderr: '', stdout: JSON.stringify(value) };
    },
  };
  return { p, action, api, resources, calls, vnetId, tableId };
}
test('native association verifies exact owned VNet/table and approved newly created subnet', async () => {
  const f = ownedFixture();
  await assertActionOwnership(f.p, f.action, f.api);
  expect(f.calls).toHaveLength(3);
});
for (const target of ['vnetId', 'tableId'] as const)
  test(`rejects foreign ${target} before native association`, async () => {
    const f = ownedFixture();
    const resource = f.resources.get(f[target]);
    if (!resource) throw Error('missing resource');
    resource.tags = {};
    await expect(assertActionOwnership(f.p, f.action, f.api)).rejects.toThrow();
  });
test('resolves data NIC1 without substituting SLI NIC2 for an explicit next hop', async () => {
  const p = compileAzureCePlan(input('native'), observation);
  const nicId = p.actions.find(
    (a) => a.kind === 'nic-create' && a.args?.includes(`${p.deploymentName}-1-nic1`),
  )?.resourceId;
  const vmId = p.actions.find((a) => a.kind === 'vm-create')?.resourceId;
  if (!nicId || !vmId) throw Error('missing graph IDs');
  const tags = {
    'xcsh-managed-by': 'azure-ce',
    'xcsh-execution-engine': 'native',
    'xcsh-deployment-id': p.deploymentName,
    'xcsh-plan-sha256': p.planSha256,
  };
  const value = await resolveAzureNicAddress(
    {
      async exec(_command, args) {
        const nic = args.includes('nic');
        return {
          exitCode: 0,
          stderr: '',
          stdout: JSON.stringify(
            nic
              ? {
                  id: nicId,
                  tags,
                  provisioningState: 'Succeeded',
                  virtualMachine: { id: vmId },
                  macAddress: '02:00:00:00:00:01',
                  ipConfigurations: [
                    {
                      primary: true,
                      privateIPAddressVersion: 'IPv4',
                      privateIPAddress: '10.20.1.5',
                      subnet: {
                        id: `/subscriptions/${p.subscription.id}/resourceGroups/${p.intent.resourceGroup}/providers/Microsoft.Network/virtualNetworks/${p.deploymentName}-vnet/subnets/outside`,
                      },
                    },
                  ],
                }
              : {
                  id: vmId,
                  tags,
                  provisioningState: 'Succeeded',
                  networkProfile: { networkInterfaces: [{ id: nicId }] },
                },
          ),
        };
      },
    },
    p,
    1,
    1,
  );
  expect(value).toBe('10.20.1.5');
});

test('native lost-association acknowledgement reconciles only the exact current table and parent owner', async () => {
  const f = ownedFixture();
  const subnet = f.resources.get(f.action.resourceId as string);
  if (!subnet) throw Error('missing subnet');
  subnet.routeTable = { id: f.tableId };
  const api = {
    async exec(command: string, args: string[]) {
      if (args[0] === 'resource')
        return {
          exitCode: 0,
          stderr: '',
          stdout: JSON.stringify({
            id: f.action.resourceId,
            properties: { provisioningState: 'Succeeded', routeTable: { id: f.tableId } },
          }),
        };
      return f.api.exec(command, args);
    },
  };
  expect(await azureNativePendingActionConverged(f.p, f.action, api)).toBe(true);
  const parent = f.resources.get(f.vnetId);
  if (!parent) throw Error('missing parent');
  parent.tags = {};
  await expect(azureNativePendingActionConverged(f.p, f.action, api)).rejects.toThrow();
});
test('association rejects a current foreign route table even inside the created subnet', async () => {
  const f = ownedFixture();
  const subnet = f.resources.get(f.action.resourceId as string);
  if (!subnet) throw Error('missing subnet');
  subnet.routeTable = { id: `${f.tableId}-foreign` };
  await expect(assertActionOwnership(f.p, f.action, f.api)).rejects.toThrow();
});

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true });
});
for (const engine of ['native', 'terraform'] as const)
  test(`actual public ${engine} planner schema and persisted artifact retain explicit UDR targets`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'ce-greenfield-udr-'));
    roots.push(root);
    let seq = 0,
      cloudCalls = 0;
    const paths = new Map<string, string>();
    const session: SessionManagerLike = {
      getSessionId: () => root,
      getArtifactsDir: () => root,
      getArtifactPath: async (id) => paths.get(id) ?? null,
      saveArtifact: async (content, type) => {
        const id = String(++seq),
          path = join(root, `${id}.${type}.log`);
        await writeFile(path, content);
        paths.set(id, path);
        return id;
      },
    };
    const discoveryArtifactId = await saveDiscoveryArtifact(session, observation);
    if (!discoveryArtifactId) throw Error('missing discovery');
    const tool = createAzureCePlanTool({ typebox: { Type } } as unknown as PluginInterface, () => {
      cloudCalls++;
      throw Error('planning cannot query cloud');
    });
    const value = input(engine),
      request = { discoveryArtifactId, intent: value };
    expect(Value.Check(tool.parameters as TSchema, request)).toBe(true);
    const invalid = structuredClone(request);
    invalid.intent.routing.udr.nextHop.nicIndex = 1.5;
    expect(Value.Check(tool.parameters as TSchema, invalid)).toBe(false);
    const result = await tool.execute('test', request, undefined, undefined, { cwd: root, sessionManager: session });
    expect(result.isError).toBeUndefined();
    const plan = result.details.plan;
    if (!plan) throw Error('missing public plan');
    expect(plan.routing.udr).toEqual(value.routing.udr);
    expect((await loadPlanArtifact(session, plan.planId, plan.planSha256)).plan).toEqual(plan);
    expect(cloudCalls).toBe(0);
  });
test('native UDR ownership cancellation prevents an ignored provider call from stalling', async () => {
  const f = ownedFixture(),
    controller = new AbortController();
  const pending = assertActionOwnership(
    f.p,
    f.action,
    {
      async exec() {
        controller.abort(Error('cancel-udr'));
        return new Promise(() => {});
      },
    },
    controller.signal,
  );
  await expect(pending).rejects.toThrow('cancel-udr');
});
test('exact NIC resolution cancellation prevents an ignored provider call from stalling', async () => {
  const p = compileAzureCePlan(input('native'), observation),
    controller = new AbortController();
  const pending = resolveAzureNicAddress(
    {
      async exec() {
        controller.abort(Error('cancel-address'));
        return new Promise(() => {});
      },
    },
    p,
    1,
    1,
    p.planSha256,
    controller.signal,
  );
  await expect(pending).rejects.toThrow('cancel-address');
});

test('native association accepts current plural prefix spelling and rejects contradictory singular evidence', async () => {
  const f = ownedFixture(),
    subnet = f.resources.get(f.action.resourceId as string);
  if (!subnet) throw Error('missing subnet');
  delete subnet.addressPrefix;
  subnet.addressPrefixes = ['10.20.2.0/24'];
  await assertActionOwnership(f.p, f.action, f.api);
  subnet.addressPrefix = '10.20.3.0/24';
  await expect(assertActionOwnership(f.p, f.action, f.api)).rejects.toThrow();
});
test('native malformed ownership JSON does not expose provider output', async () => {
  const f = ownedFixture();
  await expect(
    assertActionOwnership(f.p, f.action, {
      async exec() {
        return { exitCode: 0, stdout: 'SECRET_SENTINEL', stderr: '' };
      },
    }),
  ).rejects.toThrow('Greenfield UDR ownership evidence is malformed');
});
